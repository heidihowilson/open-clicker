/* Physical switches: independent active-low inputs, internal pull-ups, common ground.
 * Pins come from the Waveshare ESP32-C6-DEV-KIT-N8 schematic; strapping (4, 5, 8, 9, 15),
 * native USB (12, 13) and console UART (16, 17) pins are deliberately unused. */
#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "driver/gpio.h"
#include "nvs.h"
#include "keys.h"

#define POLL_MS 10  /* one FreeRTOS tick at the default 100 Hz; a shorter delay rounds to zero */
#define STABLE_SAMPLES 2  /* 20 ms debounce */
#define REPEAT_DELAY_MS 400
#define REPEAT_EVERY_MS 150
#define PAIR_HOLD_MS 3000

typedef struct {
    const char *name; gpio_num_t gpio; const char *header; bool repeat;
    char action[16];
    bool down; int count; int held_ms;
} button_t;
/* Directions, OK and Back share header P2 with GND at P2-1 and P2-12. */
static button_t keys[]={
    {.name="ok",.gpio=GPIO_NUM_18,.header="P2-10",.repeat=false,.action="ok"},
    {.name="up",.gpio=GPIO_NUM_19,.header="P2-9",.repeat=true,.action="up"},
    {.name="down",.gpio=GPIO_NUM_20,.header="P2-8",.repeat=true,.action="down"},
    {.name="left",.gpio=GPIO_NUM_21,.header="P2-7",.repeat=true,.action="left"},
    {.name="right",.gpio=GPIO_NUM_22,.header="P2-6",.repeat=true,.action="right"},
    {.name="back",.gpio=GPIO_NUM_23,.header="P2-5",.repeat=false,.action="back"},
    {.name="home",.gpio=GPIO_NUM_10,.header="P1-10",.repeat=false,.action="home"},
    {.name="play",.gpio=GPIO_NUM_11,.header="P1-11",.repeat=false,.action="play"},
    {.name="a",.gpio=GPIO_NUM_2,.header="P1-12",.repeat=false,.action=""},
    {.name="b",.gpio=GPIO_NUM_3,.header="P1-13",.repeat=false,.action=""}
};
#define KEY_COUNT (sizeof(keys)/sizeof(keys[0]))
static QueueHandle_t pressed;
static portMUX_TYPE map_lock = portMUX_INITIALIZER_UNLOCKED;
static keys_action_check_t action_known;

static void emit(button_t *k) {
    char action[16];
    portENTER_CRITICAL(&map_lock); strlcpy(action,k->action,sizeof(action)); portEXIT_CRITICAL(&map_lock);
    if(!action[0]) { printf("KEY %s unassigned; use: map %s <action>\n",k->name,k->name); return; }
    /* Drop rather than queue: a backlog would replay stale navigation. */
    if(xQueueSend(pressed,action,0)!=pdTRUE) printf("KEY %s dropped; previous action still sending\n",k->name);
}
static void send(const char *action) {
    if(xQueueSend(pressed,action,0)!=pdTRUE) printf("KEY %s dropped; previous action still sending\n",action);
}
/* Home doubles as the profile modifier: Home + Up/Right/Down/Left selects profile 1-4, and
 * holding the pair for 3 s re-pairs that profile. Plain Home is sent on release. */
static button_t *home;
static bool home_chorded;
static int chord_profile, chord_ms;
static int arrow_profile(const button_t *k) {
    if(!strcmp(k->name,"up")) return 1;
    if(!strcmp(k->name,"right")) return 2;
    if(!strcmp(k->name,"down")) return 3;
    if(!strcmp(k->name,"left")) return 4;
    return 0;
}
static void poll(void *arg) {
    TickType_t wake=xTaskGetTickCount();
    while(1) {
        for(size_t i=0;i<KEY_COUNT;i++) {
            button_t *k=&keys[i];
            bool raw=gpio_get_level(k->gpio)==0;
            if(raw==k->down) k->count=0;
            else if(++k->count>=STABLE_SAMPLES) {
                k->down=raw; k->count=0; k->held_ms=0;
                printf("KEY %s %s\n",k->name,raw?"pressed":"released");
                int profile=arrow_profile(k);
                if(k==home) {
                    if(raw) home_chorded=false;
                    else if(!home_chorded) emit(k);
                    chord_profile=0;
                } else if(raw && home->down && profile) {
                    char action[16]; snprintf(action,sizeof(action),"profile %d",profile);
                    home_chorded=true; chord_profile=profile; chord_ms=0;
                    send(action);
                } else if(!raw && profile==chord_profile) chord_profile=0;
                else if(raw && !home->down) emit(k);
            }
            if(k->down && k->repeat && !home->down) {
                k->held_ms+=POLL_MS;
                if(k->held_ms>=REPEAT_DELAY_MS && (k->held_ms-REPEAT_DELAY_MS)%REPEAT_EVERY_MS==0) emit(k);
            }
        }
        if(chord_profile && home->down && (chord_ms+=POLL_MS)==PAIR_HOLD_MS) {
            char action[16]; snprintf(action,sizeof(action),"profile pair %d",chord_profile);
            send(action);
        }
        vTaskDelayUntil(&wake,pdMS_TO_TICKS(POLL_MS));
    }
}
static button_t *configurable(const char *name) {
    for(size_t i=0;i<KEY_COUNT;i++)
        if(!strcmp(keys[i].name,name) && (!strcmp(name,"a") || !strcmp(name,"b"))) return &keys[i];
    return NULL;
}
void keys_start(keys_action_check_t check) {
    action_known=check;
    pressed=xQueueCreate(1,16);
    if(!pressed) abort();
    nvs_handle_t nvs;
    if(nvs_open("keys",NVS_READONLY,&nvs)==ESP_OK) {
        for(size_t i=0;i<KEY_COUNT;i++) {
            if(!configurable(keys[i].name)) continue;
            char saved[16]; size_t length=sizeof(saved);
            if(nvs_get_str(nvs,keys[i].name,saved,&length)==ESP_OK && action_known(saved)) strlcpy(keys[i].action,saved,sizeof(saved));
        }
        nvs_close(nvs);
    }
    for(size_t i=0;i<KEY_COUNT;i++) if(!strcmp(keys[i].name,"home")) home=&keys[i];
    uint64_t mask=0;
    for(size_t i=0;i<KEY_COUNT;i++) mask|=1ULL<<keys[i].gpio;
    gpio_config_t config={.pin_bit_mask=mask,.mode=GPIO_MODE_INPUT,.pull_up_en=GPIO_PULLUP_ENABLE,.pull_down_en=GPIO_PULLDOWN_DISABLE,.intr_type=GPIO_INTR_DISABLE};
    ESP_ERROR_CHECK(gpio_config(&config));
    /* A key held or shorted at boot must not fire until it is released first. */
    for(size_t i=0;i<KEY_COUNT;i++) keys[i].down=gpio_get_level(keys[i].gpio)==0;
    if(xTaskCreate(poll,"keys",3072,NULL,5,NULL)!=pdPASS) abort();
}
bool keys_next(char *action) { return xQueueReceive(pressed,action,0)==pdTRUE; }
void keys_map(const char *line) {
    char name[4],action[24];
    if(sscanf(line,"map %3s %23s",name,action)!=2 || !configurable(name)) { puts("ERR usage: map a|b <action>|none"); return; }
    if(strcmp(action,"none") && !action_known(action)) { puts("ERR unknown action; type help"); return; }
    button_t *k=configurable(name);
    const char *value=strcmp(action,"none")?action:"";
    nvs_handle_t nvs;
    esp_err_t saved=nvs_open("keys",NVS_READWRITE,&nvs);
    if(saved==ESP_OK) {
        saved=nvs_set_str(nvs,name,value);
        if(saved==ESP_OK) saved=nvs_commit(nvs);
        nvs_close(nvs);
    }
    if(saved!=ESP_OK) { printf("ERR map not saved: %s\n",esp_err_to_name(saved)); return; }
    portENTER_CRITICAL(&map_lock); strlcpy(k->action,value,sizeof(k->action)); portEXIT_CRITICAL(&map_lock);
    printf("MAP %s=%s (saved)\n",name,value[0]?value:"none");
}
void keys_report(void) {
    for(size_t i=0;i<KEY_COUNT;i++) {
        char action[16];
        portENTER_CRITICAL(&map_lock); strlcpy(action,keys[i].action,sizeof(action)); portEXIT_CRITICAL(&map_lock);
        printf("KEYMAP %s gpio=%d header=%s action=%s repeat=%d state=%s\n",keys[i].name,keys[i].gpio,keys[i].header,
            action[0]?action:"none",(int)keys[i].repeat,keys[i].down?"pressed":"released");
    }
}
