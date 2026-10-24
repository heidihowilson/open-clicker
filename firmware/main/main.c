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
#include "esp_mac.h"
#include "nvs.h"
#include "portable.h"
#include "keys.h"

#define NAME "Open Remote C6"
#define PROFILES 4
#define RECONNECT_SECONDS 30
#define PAIRING_SECONDS 120
static const char *TAG = "remote";
static esp_hidd_dev_t *device;
static atomic_bool connected, authenticated, hid_ready, adv_ready, scan_ready, advertising, addr_ready, bonded;
static atomic_int generation;
static portMUX_TYPE pair_lock = portMUX_INITIALIZER_UNLOCKED;
static uint32_t pairing_code;
static int pending_auth; /* 1: passkey input; 2: numeric comparison */
static esp_bd_addr_t pending_peer;
static int64_t pairing_deadline, adv_deadline;
/* One profile per target device. Each advertises from its own static random address, so a
 * TV bonded to one profile never recognises another. Only the main task touches these. */
static int active;
static uint8_t paired_mask;
static esp_bd_addr_t peers[PROFILES];
static int pairing_profile=-1;
static esp_ble_bond_dev_t bonds_before[CONFIG_BT_SMP_MAX_BONDS];
static int bonds_before_n;
static esp_bd_addr_t conn_peer, auth_peer;

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
    .own_addr_type=BLE_ADDR_TYPE_RANDOM, .channel_map=ADV_CHNL_ALL,
    .adv_filter_policy=ADV_FILTER_ALLOW_SCAN_ANY_CON_ANY
};
static bool pairing_open(void) {
    portENTER_CRITICAL(&pair_lock);
    bool open = esp_timer_get_time() < pairing_deadline;
    portEXIT_CRITICAL(&pair_lock);
    return open;
}
/* Bond lists are ~1.5 KB: keep them off the Bluetooth and main task stacks. */
static esp_ble_bond_dev_t bond_scratch[CONFIG_BT_SMP_MAX_BONDS], gap_scratch[CONFIG_BT_SMP_MAX_BONDS];
static bool is_bonded(const uint8_t *peer) {
    esp_ble_bond_dev_t *list=gap_scratch; int n=CONFIG_BT_SMP_MAX_BONDS;
    if(esp_ble_get_bond_device_list(&n,list)!=ESP_OK) return false;
    for(int i=0;i<n;i++) if(!memcmp(list[i].bd_addr,peer,6)) return true;
    return false;
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
    case ESP_GAP_BLE_SET_STATIC_RAND_ADDR_EVT:
        addr_ready = p->set_rand_addr_cmpl.status == ESP_BT_STATUS_SUCCESS; break;
    case ESP_GAP_BLE_SEC_REQ_EVT:
        /* A bonded device re-encrypting is not new pairing. */
        ESP_ERROR_CHECK_WITHOUT_ABORT(esp_ble_gap_security_rsp(p->ble_security.ble_req.bd_addr,
            pairing_open() || is_bonded(p->ble_security.ble_req.bd_addr))); break;
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
        if(authenticated) {
            portENTER_CRITICAL(&pair_lock); memcpy(auth_peer,p->ble_security.auth_cmpl.bd_addr,6); portEXIT_CRITICAL(&pair_lock);
            bonded=true;
        }
        portENTER_CRITICAL(&pair_lock); pending_auth=0; portEXIT_CRITICAL(&pair_lock);
        ESP_LOGI(TAG,"Authentication success=%d reason=%u",p->ble_security.auth_cmpl.success,p->ble_security.auth_cmpl.fail_reason);
        break;
    default: break;
    }
}
static void gatts_event(esp_gatts_cb_event_t event, esp_gatt_if_t gatts_if, esp_ble_gatts_cb_param_t *param) {
    if(event==ESP_GATTS_CONNECT_EVT) memcpy(conn_peer,param->connect.remote_bda,6);
    esp_hidd_gatts_event_handler(event,gatts_if,param);
}
static void hid_event(void *arg, esp_event_base_t base, int32_t id, void *data) {
    esp_hidd_event_data_t *p=data;
    switch(id) {
    case ESP_HIDD_START_EVENT: hid_ready=true; ESP_LOGI(TAG,"HID ready; type pair to advertise"); break;
    case ESP_HIDD_CONNECT_EVENT:
        connected=true; advertising=false; authenticated=false; generation++;
        ESP_LOGI(TAG,"Connected; awaiting authentication and report subscriptions"); break;
    case ESP_HIDD_DISCONNECT_EVENT:
        connected=false; authenticated=false; advertising=false; generation++;
        portENTER_CRITICAL(&pair_lock); pending_auth=0; portEXIT_CRITICAL(&pair_lock);
        ESP_LOGI(TAG,"Disconnected reason=%d; a key press reconnects",p->disconnect.reason); break;
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

static bool wait_for(atomic_bool *flag, bool value, int ms) {
    for(int t=0;t<ms;t+=10) { if(*flag==value) return true; vTaskDelay(pdMS_TO_TICKS(10)); }
    return *flag==value;
}
static void save_profiles(void) {
    nvs_handle_t nvs;
    if(nvs_open("profiles",NVS_READWRITE,&nvs)!=ESP_OK) return;
    nvs_set_u8(nvs,"active",(uint8_t)active);
    nvs_set_u8(nvs,"paired",paired_mask);
    nvs_set_blob(nvs,"peers",peers,sizeof(peers));
    nvs_commit(nvs); nvs_close(nvs);
}
static void load_profiles(void) {
    nvs_handle_t nvs;
    if(nvs_open("profiles",NVS_READONLY,&nvs)!=ESP_OK) return;
    uint8_t a=0; size_t length=sizeof(peers);
    if(nvs_get_u8(nvs,"active",&a)==ESP_OK && a<PROFILES) active=a;
    nvs_get_u8(nvs,"paired",&paired_mask);
    if(nvs_get_blob(nvs,"peers",peers,&length)!=ESP_OK) paired_mask=0;
    nvs_close(nvs);
}
/* Static random address: the two top bits set, derived from the chip MAC and the profile. */
static void profile_address(int profile, esp_bd_addr_t out) {
    ESP_ERROR_CHECK(esp_read_mac(out,ESP_MAC_BT));
    out[0]|=0xC0;
    out[5]^=(uint8_t)(0x5A+profile);
}
static void stop_advertising(void) {
    portENTER_CRITICAL(&pair_lock); pairing_deadline=0; adv_deadline=0; portEXIT_CRITICAL(&pair_lock);
    if(advertising) { ESP_ERROR_CHECK_WITHOUT_ABORT(esp_ble_gap_stop_advertising()); wait_for(&advertising,false,500); }
}
static bool use_identity(int profile) {
    stop_advertising();
    if(connected) { esp_ble_gap_disconnect(conn_peer); wait_for(&connected,false,3000); }
    esp_bd_addr_t address; profile_address(profile,address);
    addr_ready=false;
    if(esp_ble_gap_set_rand_addr(address)!=ESP_OK || !wait_for(&addr_ready,true,1000)) return false;
    char name[24]; snprintf(name,sizeof(name),"Open Remote %d",profile+1);
    esp_ble_adv_data_t scan={.set_scan_rsp=true,.include_name=true};
    scan_ready=false;
    if(esp_ble_gap_set_device_name(name)!=ESP_OK || esp_ble_gap_config_adv_data(&scan)!=ESP_OK) return false;
    if(!wait_for(&scan_ready,true,1000)) return false;
    active=profile; save_profiles();
    ESP_LOGI(TAG,"PROFILE %d identity %02X:%02X:%02X:%02X:%02X:%02X name=%s",profile+1,
        address[0],address[1],address[2],address[3],address[4],address[5],name);
    return true;
}
static void start_advertising(int seconds, bool pairing) {
    int64_t until=esp_timer_get_time()+(int64_t)seconds*1000000;
    portENTER_CRITICAL(&pair_lock); adv_deadline=until; pairing_deadline=pairing?until:0; portEXIT_CRITICAL(&pair_lock);
    if(!advertising) ESP_ERROR_CHECK_WITHOUT_ABORT(esp_ble_gap_start_advertising(&adv_params));
}
static void reconnect(void) {
    if(connected || advertising || !(paired_mask&(1<<active))) return;
    start_advertising(RECONNECT_SECONDS,false);
    char message[96]; snprintf(message,sizeof(message),"PROFILE %d reconnecting for %d seconds",active+1,RECONNECT_SECONDS);
    result(message);
}
static void select_profile(int profile) {
    char message[96];
    if(profile==active && connected) { snprintf(message,sizeof(message),"PROFILE %d already connected",profile+1); result(message); return; }
    if(!use_identity(profile)) { result("ERR could not switch Bluetooth identity"); return; }
    if(paired_mask&(1<<profile)) reconnect();
    else { snprintf(message,sizeof(message),"PROFILE %d is empty; pair it",profile+1); result(message); }
}
static void pair_profile(int profile) {
    if(profile!=active || connected) {
        if(!use_identity(profile)) { result("ERR could not switch Bluetooth identity"); return; }
    } else stop_advertising();
    if(paired_mask&(1<<profile)) {
        /* Re-pairing replaces this profile's device; other profiles keep theirs. */
        esp_ble_remove_bond_device(peers[profile]);
        paired_mask&=~(1<<profile); save_profiles();
    }
    bonds_before_n=CONFIG_BT_SMP_MAX_BONDS;
    if(esp_ble_get_bond_device_list(&bonds_before_n,bonds_before)!=ESP_OK) bonds_before_n=0;
    pairing_profile=profile;
    start_advertising(PAIRING_SECONDS,true);
    char message[96]; snprintf(message,sizeof(message),"PAIR_WINDOW %d seconds; select Open Remote %d on the TV",PAIRING_SECONDS,profile+1);
    result(message);
}
/* Called from the main loop after a successful authentication: the bond belongs to the profile
 * that opened pairing. A TV that was bonded before (for example to an older firmware identity)
 * updates its existing bond entry, so look for the authenticated peer first and only fall back
 * to the entry that is new since pairing opened. */
static void record_bond(void) {
    if(pairing_profile<0) return;
    esp_ble_bond_dev_t *list=bond_scratch; int n=CONFIG_BT_SMP_MAX_BONDS;
    if(esp_ble_get_bond_device_list(&n,list)!=ESP_OK) return;
    esp_bd_addr_t peer;
    portENTER_CRITICAL(&pair_lock); memcpy(peer,auth_peer,6); portEXIT_CRITICAL(&pair_lock);
    int found=-1;
    for(int i=0;i<n && found<0;i++) if(!memcmp(list[i].bd_addr,peer,6)) found=i;
    for(int i=0;i<n && found<0;i++) {
        bool known=false;
        for(int j=0;j<bonds_before_n;j++) if(!memcmp(list[i].bd_addr,bonds_before[j].bd_addr,6)) known=true;
        if(!known) found=i;
    }
    if(found<0) { result("ERR paired, but the bond was not found; profile not saved"); return; }
    memcpy(peers[pairing_profile],list[found].bd_addr,6);
    paired_mask|=1<<pairing_profile;
    save_profiles();
    char message[96]; snprintf(message,sizeof(message),"PROFILE %d paired",pairing_profile+1);
    result(message);
    pairing_profile=-1;
    portENTER_CRITICAL(&pair_lock); pairing_deadline=0; portEXIT_CRITICAL(&pair_lock);
}
static void profile_report(void) {
    for(int i=0;i<PROFILES;i++) {
        esp_bd_addr_t address; profile_address(i,address);
        printf("PROFILE %d%s identity=%02X:%02X:%02X:%02X:%02X:%02X paired=%s\n",i+1,i==active?" (active)":"",
            address[0],address[1],address[2],address[3],address[4],address[5],(paired_mask&(1<<i))?"yes":"no");
    }
}

typedef struct { const char *name; uint8_t report; uint16_t usage; } action_t;
static const action_t actions[] = {
    {"up",1,0x52}, {"down",1,0x51}, {"left",1,0x50}, {"right",1,0x4F},
    {"ok",1,0x28}, {"escape",1,0x29}, {"space",1,0x2C},
    {"back",2,0x224}, {"home",2,0x223}, {"play",2,0xCD},
    {"volume_up",2,0xE9}, {"volume_down",2,0xEA}, {"mute",2,0xE2}
};
static bool action_known(const char *name) {
    for(size_t i=0;i<sizeof(actions)/sizeof(actions[0]);i++) if(!strcmp(name,actions[i].name)) return true;
    return false;
}
static void send_action(const action_t *a) {
    if(!connected || !authenticated) {
        /* The press that wakes a link is discarded, never replayed later. */
        reconnect();
        result("ERR not connected; action discarded");
        return;
    }
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
        puts("Commands: status, profile, profile 1-4, profile pair 1-4, keys, map a|b <action>|none, pair, stop, pin <6 digits>, yes, no, up, down, left, right, ok, back, escape, home, play, space, volume_up, volume_down, mute");
    } else if(!strcmp(line,"profile")) {
        profile_report();
    } else if(!strncmp(line,"profile pair ",13) && line[13]>='1' && line[13]<='4' && !line[14]) {
        pair_profile(line[13]-'1');
    } else if(!strncmp(line,"profile ",8) && line[8]>='1' && line[8]<='4' && !line[9]) {
        select_profile(line[8]-'1');
    } else if(!strcmp(line,"keys")) {
        keys_report();
    } else if(!strncmp(line,"map ",4)) {
        keys_map(line);
    } else if(!strcmp(line,"status")) {
        printf("STATUS name=%s profile=%d connected=%d authenticated=%d advertising=%d ready=%d bonds=%d\n",NAME,active+1,(int)connected,(int)authenticated,(int)advertising,(int)(hid_ready&&adv_ready&&scan_ready),esp_ble_get_bond_device_num());
    } else if(!strcmp(line,"pair")) {
        if(!hid_ready || !adv_ready || !scan_ready) { result("ERR stack not ready"); return; }
        pair_profile(active);
    } else if(!strcmp(line,"stop")) {
        pairing_profile=-1;
        stop_advertising();
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
    snprintf(buffer,size,"\"profile\":%d,\"paired\":%u,\"connected\":%s,\"authenticated\":%s,\"advertising\":%s,\"pending\":%d,\"code\":%" PRIu32,
        active+1,paired_mask,connected?"true":"false",authenticated?"true":"false",advertising?"true":"false",pending,code);
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
    ESP_ERROR_CHECK(esp_ble_gatts_register_callback(gatts_event));
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
    load_profiles();
    if(!use_identity(active)) abort();
    portable_start();
    keys_start(action_known);
    puts("OPEN_REMOTE_READY v0.4; USB powered; phone Wi-Fi test mode; four profiles; type help");
    char line[80]; size_t n=0; bool overflow=false;
    while(1) {
        char web_command[32];
        if(portable_next(web_command)) command(web_command);
        char key_action[16];
        if(keys_next(key_action)) command(key_action);
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
        if(bonded) { bonded=false; record_bond(); }
        portENTER_CRITICAL(&pair_lock); int64_t until=adv_deadline; portEXIT_CRITICAL(&pair_lock);
        if(advertising && esp_timer_get_time()>=until) {
            bool was_pairing=pairing_profile>=0;
            pairing_profile=-1;
            stop_advertising();
            result(was_pairing?"PAIR_WINDOW expired":"Reconnect timed out; press a key to retry");
        }
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}
