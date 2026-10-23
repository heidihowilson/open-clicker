#pragma once
#include <stdbool.h>
#include <stddef.h>
typedef bool (*keys_action_check_t)(const char *action);
void keys_start(keys_action_check_t check);
bool keys_next(char *action);
void keys_map(const char *line);
void keys_report(void);
