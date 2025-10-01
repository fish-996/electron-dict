/*
 * speex_config_types.h
 *
 * This is a manual configuration for building with Emscripten/WASM.
 * We know that this environment supports standard integer types.
 */

#ifndef __SPEEX_TYPES_H
#define __SPEEX_TYPES_H

/* Include the standard integer types header */
#include <stdint.h>

/* Define Speex types based on standard C99 types */
typedef int16_t   spx_int16_t;
typedef uint16_t  spx_uint16_t;
typedef int32_t   spx_int32_t;
typedef uint32_t  spx_uint32_t;

#endif /* __SPEEX_TYPES_H */
