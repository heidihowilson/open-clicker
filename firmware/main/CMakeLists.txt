idf_component_register(SRCS "main.c" "portable.c" INCLUDE_DIRS "." REQUIRES esp_hid bt nvs_flash esp_timer esp_wifi esp_netif esp_http_server esp_event esp_hw_support EMBED_TXTFILES "remote.html")
