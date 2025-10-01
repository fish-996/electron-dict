/*
 * config_types.h (for libogg)
 *
 * This is a manual configuration for building with Emscripten/WASM.
 * We are defining the types based on the standard C99 <stdint.h> header,
 * which is available in the WASM environment.
 */

#ifndef __CONFIG_TYPES_H__
#define __CONFIG_TYPES_H__

/* We know stdint.h is available in Emscripten/WASM */
#define INCLUDE_STDINT_H 1
#define INCLUDE_INTTYPES_H 0
#define INCLUDE_SYS_TYPES_H 0

#if INCLUDE_STDINT_H
#  include <stdint.h>
#endif

/* Define Ogg types based on standard C99 types */
typedef int16_t   ogg_int16_t;
typedef uint16_t  ogg_uint16_t;
typedef int32_t   ogg_int32_t;
typedef uint32_t  ogg_uint32_t;
typedef int64_t   ogg_int64_t;
typedef uint64_t  ogg_uint64_t;

#endif /* __CONFIG_TYPES_H__ */

