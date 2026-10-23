/* Phone-operated test fixture. Credentials stay in device NVS, never in source. */
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_http_server.h"
#include "esp_random.h"
#include "esp_mac.h"
#include "esp_log.h"
#include "nvs.h"
#include "lwip/sockets.h"
#include "portable.h"

static QueueHandle_t commands;
static char token[33];
extern const unsigned char page_start[] asm("_binary_remote_html_start");
extern const unsigned char page_end[] asm("_binary_remote_html_end");
static portMUX_TYPE result_lock = portMUX_INITIALIZER_UNLOCKED;
static char last_result[192]="Ready. Start pairing when beside the TV.";

void portable_result(const char *message) {
    portENTER_CRITICAL(&result_lock);
    strlcpy(last_result,message,sizeof(last_result));
    portEXIT_CRITICAL(&result_lock);
}
bool portable_next(char *command) { return xQueueReceive(commands,command,0)==pdTRUE; }
static bool valid_command(const char *s) {
    const char *allowed[]={"pair","stop","up","down","left","right","ok","back","escape","home","play","space","volume_up","volume_down","mute","yes","no"};
    for(size_t i=0;i<sizeof(allowed)/sizeof(allowed[0]);i++) if(!strcmp(s,allowed[i])) return true;
    if(strlen(s)==9 && !strncmp(s,"profile ",8) && s[8]>='1' && s[8]<='4') return true;
    if(strlen(s)==14 && !strncmp(s,"profile pair ",13) && s[13]>='1' && s[13]<='4') return true;
    if(strlen(s)==10 && !strncmp(s,"pin ",4)) {
        for(int i=4;i<10;i++) if(s[i]<'0'||s[i]>'9') return false;
        return true;
    }
    return false;
}
static bool local_request(httpd_req_t *r) {
    char host[40],origin[48];
    if(httpd_req_get_hdr_value_str(r,"Host",host,sizeof(host))!=ESP_OK ||
        (strcmp(host,"192.168.4.1") && strcmp(host,"192.168.4.1:80"))) return false;
    if(httpd_req_get_hdr_value_len(r,"Origin") &&
        (httpd_req_get_hdr_value_str(r,"Origin",origin,sizeof(origin))!=ESP_OK ||
         (strcmp(origin,"http://192.168.4.1") && strcmp(origin,"http://192.168.4.1:80")))) return false;
    return true;
}
static esp_err_t index_page(httpd_req_t *r) {
    if(!local_request(r)) return httpd_resp_send_err(r,HTTPD_403_FORBIDDEN,"Use http://192.168.4.1/");
    httpd_resp_set_type(r,"text/html; charset=utf-8");
    httpd_resp_set_hdr(r,"Cache-Control","no-store");
    httpd_resp_set_hdr(r,"X-Content-Type-Options","nosniff");
    httpd_resp_set_hdr(r,"Content-Security-Policy","default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");
    /* Only this random hexadecimal token is substituted into the static page. */
    const char *marker=strstr((const char *)page_start,"__TOKEN__");
    if(!marker) return httpd_resp_send_err(r,HTTPD_500_INTERNAL_SERVER_ERROR,"Missing page token");
    httpd_resp_send_chunk(r,(const char *)page_start,marker-(const char *)page_start);
    httpd_resp_send_chunk(r,token,strlen(token));
    const char *rest=marker+9;
    httpd_resp_send_chunk(r,rest,(const char *)page_end-rest-1);
    return httpd_resp_send_chunk(r,NULL,0);
}
static esp_err_t status_page(httpd_req_t *r) {
    if(!local_request(r)) return httpd_resp_send_err(r,HTTPD_403_FORBIDDEN,"Invalid host or origin");
    char state[256],result[192],out[672];
    remote_status(state,sizeof(state));
    portENTER_CRITICAL(&result_lock);
    strlcpy(result,last_result,sizeof(result));
    portEXIT_CRITICAL(&result_lock);
    /* Results are our fixed strings and ESP error names. Escape for JSON anyway. */
    char escaped[384]; size_t n=0;
    for(const unsigned char *s=(const unsigned char *)result;*s && n<sizeof(escaped)-3;s++) {
        if(*s=='"'||*s=='\\') escaped[n++]='\\';
        if(*s>=32) escaped[n++]=*s;
    }
    escaped[n]=0;
    snprintf(out,sizeof(out),"{%s,\"result\":\"%s\"}",state,escaped);
    httpd_resp_set_type(r,"application/json");
    httpd_resp_set_hdr(r,"Cache-Control","no-store");
    return httpd_resp_send(r,out,HTTPD_RESP_USE_STRLEN);
}
static esp_err_t submit(httpd_req_t *r) {
    if(!local_request(r)) return httpd_resp_send_err(r,HTTPD_403_FORBIDDEN,"Invalid host or origin");
    char supplied[34];
    if(httpd_req_get_hdr_value_str(r,"X-Remote-Token",supplied,sizeof(supplied))!=ESP_OK || strcmp(supplied,token))
        return httpd_resp_send_err(r,HTTPD_403_FORBIDDEN,"Reload the control page");
    if(r->content_len<1 || r->content_len>31) return httpd_resp_send_err(r,HTTPD_400_BAD_REQUEST,"Invalid command size");
    char command[32]={0}; size_t n=0;
    while(n<r->content_len) {
        int got=httpd_req_recv(r,command+n,r->content_len-n);
        if(got<=0) return ESP_FAIL;
        n+=got;
    }
    if(strlen(command)!=n || !valid_command(command)) return httpd_resp_send_err(r,HTTPD_400_BAD_REQUEST,"Unknown command");
    /* One outstanding command; no backlog of stale navigation. */
    if(xQueueSend(commands,command,0)!=pdTRUE) {
        httpd_resp_set_status(r,"503 Service Unavailable");
        return httpd_resp_sendstr(r,"Busy; try again");
    }
    httpd_resp_set_type(r,"text/plain");
    return httpd_resp_sendstr(r,"Queued on remote");
}
void portable_start(void) {
    commands=xQueueCreate(1,32);
    if(!commands) abort();
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_t *netif=esp_netif_create_default_wifi_ap();
    if(!netif) abort();
    wifi_init_config_t init=WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&init));
    ESP_ERROR_CHECK(esp_wifi_set_storage(WIFI_STORAGE_RAM));
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP));
    /* BLE is already enabled, providing radio entropy for esp_fill_random. */
    nvs_handle_t nvs; char password[17]; size_t length=sizeof(password);
    ESP_ERROR_CHECK(nvs_open("remote_test",NVS_READWRITE,&nvs));
    esp_err_t found=nvs_get_str(nvs,"ap_password",password,&length);
    if(found==ESP_ERR_NVS_NOT_FOUND) {
        uint8_t bytes[8]; esp_fill_random(bytes,sizeof(bytes));
        for(int i=0;i<8;i++) snprintf(password+2*i,3,"%02x",bytes[i]);
        ESP_ERROR_CHECK(nvs_set_str(nvs,"ap_password",password));
        ESP_ERROR_CHECK(nvs_commit(nvs));
    } else ESP_ERROR_CHECK(found);
    nvs_close(nvs);
    uint8_t secret[16],mac[6]; esp_fill_random(secret,sizeof(secret));
    for(int i=0;i<16;i++) snprintf(token+2*i,3,"%02x",secret[i]);
    ESP_ERROR_CHECK(esp_read_mac(mac,ESP_MAC_WIFI_SOFTAP));
    wifi_config_t config={.ap={.channel=1,.authmode=WIFI_AUTH_WPA2_PSK,.max_connection=2,.pmf_cfg={.required=false}}};
    snprintf((char *)config.ap.ssid,sizeof(config.ap.ssid),"OpenRemote-%02X%02X",mac[4],mac[5]);
    config.ap.ssid_len=strlen((char *)config.ap.ssid);
    memcpy(config.ap.password,password,sizeof(password));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP,&config));
    ESP_ERROR_CHECK(esp_wifi_start());
    httpd_config_t server_config=HTTPD_DEFAULT_CONFIG();
    server_config.stack_size=6144;
    server_config.lru_purge_enable=true;
    httpd_handle_t server;
    ESP_ERROR_CHECK(httpd_start(&server,&server_config));
    httpd_uri_t routes[]={
        {.uri="/",.method=HTTP_GET,.handler=index_page},
        {.uri="/api/status",.method=HTTP_GET,.handler=status_page},
        {.uri="/api/command",.method=HTTP_POST,.handler=submit}
    };
    for(size_t i=0;i<sizeof(routes)/sizeof(routes[0]);i++) ESP_ERROR_CHECK(httpd_register_uri_handler(server,&routes[i]));
    esp_netif_ip_info_t ip; ESP_ERROR_CHECK(esp_netif_get_ip_info(netif,&ip));
    printf("PORTABLE_READY ssid=%s password=%s url=http://" IPSTR "/\n",config.ap.ssid,password,IP2STR(&ip.ip));
}

/* Exercise the real HTTP server locally, without generating any TV actions. */
void portable_check(void) {
    struct { const char *path,*body,*auth,*origin,*expect,*contains; } cases[]={
        {"/",NULL,NULL,NULL,"200 OK","Take it to the TV."},
        {"/api/status",NULL,NULL,NULL,"200 OK","\"authenticated\":"},
        {"/api/command","stop",NULL,NULL,"403 Forbidden",NULL},
        {"/api/command","bogus",token,NULL,"400 Bad Request",NULL},
        {"/api/command","pin 12x456",token,NULL,"400 Bad Request",NULL},
        {"/api/command","stop",token,"http://example.invalid","403 Forbidden",NULL},
        {"/api/command","stop",token,NULL,"200 OK","Queued on remote"}
    };
    char *response=malloc(10000);
    if(!response) { puts("WEB_CHECK allocation failed"); return; }
    int passed=0;
    for(size_t i=0;i<sizeof(cases)/sizeof(cases[0]);i++) {
        int sock=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP);
        if(sock<0) break;
        struct timeval timeout={.tv_sec=3};
        setsockopt(sock,SOL_SOCKET,SO_RCVTIMEO,&timeout,sizeof(timeout));
        setsockopt(sock,SOL_SOCKET,SO_SNDTIMEO,&timeout,sizeof(timeout));
        struct sockaddr_in addr={.sin_family=AF_INET,.sin_port=htons(80)};
        inet_pton(AF_INET,"192.168.4.1",&addr.sin_addr);
        if(connect(sock,(struct sockaddr *)&addr,sizeof(addr))!=0) { close(sock); break; }
        char request[512];
        int length=snprintf(request,sizeof(request),"%s %s HTTP/1.1\r\nHost: 192.168.4.1\r\nConnection: close\r\nContent-Length: %u\r\nX-Remote-Token: %s\r\n%s%s%s\r\n%s",
            cases[i].body?"POST":"GET",cases[i].path,(unsigned)(cases[i].body?strlen(cases[i].body):0),cases[i].auth?cases[i].auth:"",
            cases[i].origin?"Origin: ":"",cases[i].origin?cases[i].origin:"",cases[i].origin?"\r\n":"",cases[i].body?cases[i].body:"");
        int sent=0;
        while(sent<length) { int n=send(sock,request+sent,length-sent,0); if(n<=0) break; sent+=n; }
        size_t used=0; int got;
        while(used<9999 && (got=recv(sock,response+used,9999-used,0))>0) used+=got;
        response[used]=0; close(sock);
        bool ok=sent==length && strstr(response,cases[i].expect) && (!cases[i].contains || strstr(response,cases[i].contains));
        if(i==0) ok=ok && strstr(response,token) && !strstr(response,"__TOKEN__");
        printf("WEB_CHECK case=%u %s\n",(unsigned)i+1,ok?"PASS":"FAIL");
        if(ok) passed++;
    }
    free(response);
    printf("WEB_CHECK passed=%d total=%u (local TCP; phone radio path untested)\n",passed,(unsigned)(sizeof(cases)/sizeof(cases[0])));
}
