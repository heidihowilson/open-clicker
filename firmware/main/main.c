#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <inttypes.h>
#include <stdatomic.h>
#include <ctype.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "nvs_flash.h"
#include "esp_bt.h"
#include "esp_bt_main.h"
#include "esp_gap_ble_api.h"
#include "esp_gatts_api.h"
#include "esp_hidd.h"
#include "portable.h"

#define NAME "Open Remote C6"
static const char *TAG = "remote";
static esp_hidd_dev_t *device;
static atomic_bool connected, authenticated, hid_ready, adv_ready, scan_ready, advertising;
static atomic_int generation;
static portMUX_TYPE pair_lock = portMUX_INITIALIZER_UNLOCKED;
static uint32_t pairing_code;
static int pending_auth; /* 1: passkey input; 2: numeric comparison */
static esp_bd_addr_t pending_peer;
static int64_t pairing_deadline;

/* Keyboard report 1: modifier, reserved, six keys. Consumer report 2:
 * one 16-bit usage. Report IDs are passed separately to esp_hidd. */
static const uint8_t report_map[] = {
    0x05,0x01, 0x09,0x06, 0xA1,0x01, 0x85,0x01,
    0x05,0x07, 0x19,0xE0, 0x29,0xE7, 0x15,0x00, 0x25,0x01,
    0x75,0x01, 0x95,0x08, 0x81,0x02,
    0x75,0x08, 0x95,0x01, 0x81,0x01,
    0x05,0x08, 0x19,0x01, 0x29,0x05, 0x75,0x01, 0x95,0x05, 0x91,0x02,
    0x75,0x03, 0x95,0x01, 0x91,0x01,
    0x05,0x07, 0x19,0x00, 0x29,0x65, 0x15,0x00, 0x25,0x65,
    0x75,0x08, 0x95,0x06, 0x81,0x00, 0xC0,
    0x05,0x0C, 0x09,0x01, 0xA1,0x01, 0x85,0x02,
    0x15,0x00, 0x26,0xFF,0x03, 0x19,0x00, 0x2A,0xFF,0x03,
    0x75,0x10, 0x95,0x01, 0x81,0x00, 0xC0
};
static esp_hid_raw_report_map_t maps[] = {{.data=report_map,.len=sizeof(report_map)}};
static const esp_hid_device_config_t hid_config = {
    .vendor_id=0, .product_id=0, .version=1, /* Unassigned prototype identifiers. */
    .device_name=NAME, .manufacturer_name="Open Remote prototype", .serial_number="bench-01",
    .report_maps=maps, .report_maps_len=1
};
static esp_ble_adv_params_t adv_params = {
    .adv_int_min=0x30, .adv_int_max=0x60, .adv_type=ADV_TYPE_IND,
    .own_addr_type=BLE_ADDR_TYPE_PUBLIC, .channel_map=ADV_CHNL_ALL,
    .adv_filter_policy=ADV_FILTER_ALLOW_SCAN_ANY_CON_ANY
};
static bool pairing_open(void) {
    portENTER_CRITICAL(&pair_lock);
    bool open = esp_timer_get_time() < pairing_deadline;
    portEXIT_CRITICAL(&pair_lock);
    return open;
}
static void set_pending(int kind, const uint8_t *peer) {
    portENTER_CRITICAL(&pair_lock);
    memcpy(pending_peer,peer,6);
    pending_auth=kind;
    portEXIT_CRITICAL(&pair_lock);
}
static void gap_event(esp_gap_ble_cb_event_t event, esp_ble_gap_cb_param_t *p) {
    switch(event) {
    case ESP_GAP_BLE_ADV_DATA_SET_COMPLETE_EVT:
        adv_ready = p->adv_data_cmpl.status == ESP_BT_STATUS_SUCCESS; break;
    case ESP_GAP_BLE_SCAN_RSP_DATA_SET_COMPLETE_EVT:
        scan_ready = p->scan_rsp_data_cmpl.status == ESP_BT_STATUS_SUCCESS; break;
    case ESP_GAP_BLE_ADV_START_COMPLETE_EVT:
        advertising = p->adv_start_cmpl.status == ESP_BT_STATUS_SUCCESS;
        ESP_LOGI(TAG,"Advertising start status=%d",p->adv_start_cmpl.status); break;
    case ESP_GAP_BLE_ADV_STOP_COMPLETE_EVT:
        advertising=false; break;
    case ESP_GAP_BLE_SEC_REQ_EVT:
        ESP_ERROR_CHECK_WITHOUT_ABORT(esp_ble_gap_security_rsp(p->ble_security.ble_req.bd_addr,pairing_open())); break;
    case ESP_GAP_BLE_PASSKEY_REQ_EVT:
        if(pairing_open()) {
            set_pending(1,p->ble_security.ble_req.bd_addr);
            ESP_LOGI(TAG,"PAIRING: enter the host's six digits with: pin 123456");
        } else esp_ble_passkey_reply(p->ble_security.ble_req.bd_addr,false,0);
        break;
    case ESP_GAP_BLE_NC_REQ_EVT:
        if(pairing_open()) {
            portENTER_CRITICAL(&pair_lock); pairing_code=p->ble_security.key_notif.passkey; portEXIT_CRITICAL(&pair_lock);
            set_pending(2,p->ble_security.key_notif.bd_addr);
            ESP_LOGI(TAG,"PAIRING: compare %06" PRIu32 " on host, then type yes or no",p->ble_security.key_notif.passkey);
        } else esp_ble_confirm_reply(p->ble_security.key_notif.bd_addr,false);
        break;
    case ESP_GAP_BLE_PASSKEY_NOTIF_EVT:
        portENTER_CRITICAL(&pair_lock); pairing_code=p->ble_security.key_notif.passkey; portEXIT_CRITICAL(&pair_lock);
        set_pending(3,p->ble_security.key_notif.bd_addr);
        ESP_LOGI(TAG,"PAIRING: host entry code %06" PRIu32,p->ble_security.key_notif.passkey); break;
    case ESP_GAP_BLE_AUTH_CMPL_EVT:
        authenticated=p->ble_security.auth_cmpl.success;
        portENTER_CRITICAL(&pair_lock); pending_auth=0; portEXIT_CRITICAL(&pair_lock);
        ESP_LOGI(TAG,"Authentication success=%d reason=%u",p->ble_security.auth_cmpl.success,p->ble_security.auth_cmpl.fail_reason);
        break;
    default: break;
    }
}
static void hid_event(void *arg, esp_event_base_t base, int32_t id, void *data) {
    esp_hidd_event_data_t *p=data;
    switch(id) {
    case ESP_HIDD_START_EVENT: hid_ready=true; ESP_LOGI(TAG,"HID ready; type pair to advertise"); break;
    case ESP_HIDD_CONNECT_EVENT:
        connected=true; advertising=false; authenticated=false; generation++;
        ESP_LOGI(TAG,"Connected; awaiting authentication and report subscriptions"); break;
    case ESP_HIDD_DISCONNECT_EVENT:
        connected=false; authenticated=false; generation++;
        portENTER_CRITICAL(&pair_lock); pending_auth=0; portEXIT_CRITICAL(&pair_lock);
        ESP_LOGI(TAG,"Disconnected reason=%d; type pair to reconnect",p->disconnect.reason); break;
    case ESP_HIDD_PROTOCOL_MODE_EVENT:
        ESP_LOGI(TAG,"Protocol mode=%u",p->protocol_mode.protocol_mode); break;
    case ESP_HIDD_CONTROL_EVENT:
        ESP_LOGI(TAG,"Host control=%u",p->control.control); break;
    case ESP_HIDD_OUTPUT_EVENT:
        ESP_LOGI(TAG,"Host output report=%u length=%u",p->output.report_id,p->output.length); break;
    default: break;
    }
}

static void result(const char *message) { puts(message); portable_result(message); }

typedef struct { const char *name; uint8_t report; uint16_t usage; } action_t;
static const action_t actions[] = {
    {"up",1,0x52}, {"down",1,0x51}, {"left",1,0x50}, {"right",1,0x4F},
    {"ok",1,0x28}, {"escape",1,0x29}, {"space",1,0x2C},
    {"back",2,0x224}, {"home",2,0x223}, {"play",2,0xCD},
    {"volume_up",2,0xE9}, {"volume_down",2,0xEA}, {"mute",2,0xE2}
};
static void send_action(const action_t *a) {
    if(!connected || !authenticated) { result("ERR not authenticated; action discarded"); return; }
    int before=generation;
    uint8_t report[8]={0};
    size_t len=a->report==1 ? 8 : 2;
    if(a->report==1) report[2]=a->usage;
    else { report[0]=a->usage & 0xff; report[1]=a->usage >> 8; }
    esp_err_t press=esp_hidd_dev_input_set(device,0,a->report,report,len);
    vTaskDelay(pdMS_TO_TICKS(60));
    memset(report,0,sizeof(report));
    esp_err_t release=ESP_ERR_INVALID_STATE;
    /* Never send an old release into a different connection. */
    if(connected && generation==before) {
        release=esp_hidd_dev_input_set(device,0,a->report,report,len);
        if(release!=ESP_OK) {
            vTaskDelay(pdMS_TO_TICKS(30));
            if(connected && generation==before) release=esp_hidd_dev_input_set(device,0,a->report,report,len);
        }
    }
    char message[192];
    snprintf(message,sizeof(message),"TX %s press=%s release=%s (transport result, not TV acknowledgment)",a->name,esp_err_to_name(press),esp_err_to_name(release));
    result(message);
}
static void answer_pairing(const char *line) {
    int kind; esp_bd_addr_t peer;
    portENTER_CRITICAL(&pair_lock);
    kind=pending_auth; memcpy(peer,pending_peer,6);
    portEXIT_CRITICAL(&pair_lock);
    if(!kind || !pairing_open()) { result("ERR no pending pairing request"); return; }
    esp_err_t result=ESP_ERR_INVALID_ARG;
    if(kind==1 && strncmp(line,"pin ",4)==0 && strlen(line+4)==6) {
        bool digits=true;
        for(const char *s=line+4;*s;s++) if(!isdigit((unsigned char)*s)) digits=false;
        if(digits) result=esp_ble_passkey_reply(peer,true,(uint32_t)strtoul(line+4,NULL,10));
    } else if(kind==2 && (!strcmp(line,"yes") || !strcmp(line,"no"))) {
        result=esp_ble_confirm_reply(peer,!strcmp(line,"yes"));
    } else if(!strcmp(line,"no")) result=esp_ble_passkey_reply(peer,false,0);
    if(result==ESP_OK) { portENTER_CRITICAL(&pair_lock); pending_auth=0; portEXIT_CRITICAL(&pair_lock); }
    char message[80]; snprintf(message,sizeof(message),"PAIR_REPLY %s",esp_err_to_name(result));
    puts(message); portable_result(message);
}
static void command(const char *line) {
    if(!strcmp(line,"webcheck")) {
        portable_check();
    } else if(!strcmp(line,"help")) {
        puts("Commands: status, pair, stop, pin <6 digits>, yes, no, up, down, left, right, ok, back, escape, home, play, space, volume_up, volume_down, mute");
    } else if(!strcmp(line,"status")) {
        printf("STATUS name=%s connected=%d authenticated=%d advertising=%d ready=%d bonds=%d\n",NAME,(int)connected,(int)authenticated,(int)advertising,(int)(hid_ready&&adv_ready&&scan_ready),esp_ble_get_bond_device_num());
    } else if(!strcmp(line,"pair")) {
        if(connected) { result("ERR already connected"); return; }
        if(!hid_ready || !adv_ready || !scan_ready) { result("ERR stack not ready"); return; }
        portENTER_CRITICAL(&pair_lock); pairing_deadline=esp_timer_get_time()+120000000; portEXIT_CRITICAL(&pair_lock);
        if(!advertising) ESP_ERROR_CHECK_WITHOUT_ABORT(esp_ble_gap_start_advertising(&adv_params));
        result("PAIR_WINDOW 120 seconds; select Open Remote C6 on the host");
    } else if(!strcmp(line,"stop")) {
        portENTER_CRITICAL(&pair_lock); pairing_deadline=0; portEXIT_CRITICAL(&pair_lock);
        if(advertising) ESP_ERROR_CHECK_WITHOUT_ABORT(esp_ble_gap_stop_advertising());
        result("PAIR_WINDOW closed");
    } else if(!strncmp(line,"pin ",4) || !strcmp(line,"yes") || !strcmp(line,"no")) answer_pairing(line);
    else {
        for(size_t i=0;i<sizeof(actions)/sizeof(actions[0]);i++) {
            if(!strcmp(line,actions[i].name)) { send_action(&actions[i]); return; }
        }
        result("ERR unknown command; type help");
    }
}
void remote_status(char *buffer, size_t size) {
    portENTER_CRITICAL(&pair_lock);
    int pending=pending_auth; uint32_t code=pairing_code;
    portEXIT_CRITICAL(&pair_lock);
    snprintf(buffer,size,"\"connected\":%s,\"authenticated\":%s,\"advertising\":%s,\"pending\":%d,\"code\":%" PRIu32,
        connected?"true":"false",authenticated?"true":"false",advertising?"true":"false",pending,code);
}
static void check_reports(void) {
    esp_hid_report_map_t *parsed=esp_hid_parse_report_map(report_map,sizeof(report_map));
    if(!parsed) abort();
    bool keyboard=false, consumer=false;
    for(int i=0;i<parsed->reports_len;i++) {
        esp_hid_report_item_t *r=&parsed->reports[i];
        if(r->report_type!=ESP_HID_REPORT_TYPE_INPUT || r->protocol_mode!=ESP_HID_PROTOCOL_MODE_REPORT) continue;
        if(r->report_id==1 && r->value_len==8) keyboard=true;
        if(r->report_id==2 && r->value_len==2) consumer=true;
    }
    esp_hid_free_report_map(parsed);
    if(!keyboard || !consumer) abort();
    ESP_LOGI(TAG,"Report map verified: keyboard=8 bytes, consumer=2 bytes");
}
void app_main(void) {
    check_reports();
    ESP_ERROR_CHECK(nvs_flash_init()); /* Do not silently erase an incompatible NVS. */
    esp_bt_controller_config_t controller=BT_CONTROLLER_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_bt_controller_init(&controller));
    ESP_ERROR_CHECK(esp_bt_controller_enable(ESP_BT_MODE_BLE));
    ESP_ERROR_CHECK(esp_bluedroid_init());
    ESP_ERROR_CHECK(esp_bluedroid_enable());
    ESP_ERROR_CHECK(esp_ble_gap_register_callback(gap_event));
    ESP_ERROR_CHECK(esp_ble_gatts_register_callback(esp_hidd_gatts_event_handler));
    uint8_t auth=ESP_LE_AUTH_REQ_SC_MITM_BOND, io=ESP_IO_CAP_IN, keys=ESP_BLE_ENC_KEY_MASK|ESP_BLE_ID_KEY_MASK, size=16;
    ESP_ERROR_CHECK(esp_ble_gap_set_security_param(ESP_BLE_SM_AUTHEN_REQ_MODE,&auth,1));
    ESP_ERROR_CHECK(esp_ble_gap_set_security_param(ESP_BLE_SM_IOCAP_MODE,&io,1));
    ESP_ERROR_CHECK(esp_ble_gap_set_security_param(ESP_BLE_SM_MAX_KEY_SIZE,&size,1));
    ESP_ERROR_CHECK(esp_ble_gap_set_security_param(ESP_BLE_SM_SET_INIT_KEY,&keys,1));
    ESP_ERROR_CHECK(esp_ble_gap_set_security_param(ESP_BLE_SM_SET_RSP_KEY,&keys,1));
    ESP_ERROR_CHECK(esp_ble_gap_set_device_name(NAME));
    /* Bluedroid's structured advertising API takes 128-bit UUID entries,
     * then compresses Bluetooth-base UUIDs on air. */
    static uint8_t uuid[]={0xFB,0x34,0x9B,0x5F,0x80,0x00,0x00,0x80,0x00,0x10,0x00,0x00,0x12,0x18,0x00,0x00};
    esp_ble_adv_data_t adv={.appearance=ESP_HID_APPEARANCE_KEYBOARD,.service_uuid_len=sizeof(uuid),.p_service_uuid=uuid,.flag=ESP_BLE_ADV_FLAG_GEN_DISC|ESP_BLE_ADV_FLAG_BREDR_NOT_SPT};
    esp_ble_adv_data_t scan={.set_scan_rsp=true,.include_name=true};
    ESP_ERROR_CHECK(esp_ble_gap_config_adv_data(&adv));
    ESP_ERROR_CHECK(esp_ble_gap_config_adv_data(&scan));
    ESP_ERROR_CHECK(esp_hidd_dev_init(&hid_config,ESP_HID_TRANSPORT_BLE,hid_event,&device));
    ESP_ERROR_CHECK(esp_hidd_dev_battery_set(device,100)); /* USB-powered bench fixture, not a battery reading. */
    portable_start();
    puts("OPEN_REMOTE_READY v0.2; USB powered; phone Wi-Fi test mode; no automatic keys; type help");
    char line[80]; size_t n=0; bool overflow=false;
    while(1) {
        char web_command[32];
        if(portable_next(web_command)) command(web_command);
        int c=getchar();
        if(c!=EOF) {
            if(c=='\n' || c=='\r') {
                if(overflow) result("ERR command too long; discarded");
                else if(n) { line[n]=0; command(line); }
                n=0; overflow=false;
            } else if(c==8 || c==127) { if(n) n--; }
            else if(c>=32 && c<=126 && !overflow) {
                if(n<sizeof(line)-1) line[n++]=(char)c;
                else overflow=true;
            }
        }
        if(advertising && !pairing_open()) {
            ESP_ERROR_CHECK_WITHOUT_ABORT(esp_ble_gap_stop_advertising());
            advertising=false;
            result("PAIR_WINDOW expired");
        }
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}
