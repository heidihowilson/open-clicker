#pragma once
#include <stddef.h>
#include <stdbool.h>
void portable_start(void);
bool portable_next(char *command);
void portable_result(const char *message);
void remote_status(char *buffer, size_t size);
void portable_check(void);
