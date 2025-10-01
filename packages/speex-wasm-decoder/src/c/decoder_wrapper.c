#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <speex/speex.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// 包含 Speex 的主头文件
#include <speex/speex.h>

// 包含 Ogg 的主头文件 (!!! 这就是缺失的那一行 !!!)
#include <ogg/ogg.h>

// 包含 Emscripten 的头文件
#include <emscripten.h>

// 定义 WAV 文件头结构
typedef struct {
    char     chunk_id[4];
    int32_t  chunk_size;
    char     format[4];
    char     subchunk1_id[4];
    int32_t  subchunk1_size;
    int16_t  audio_format;
    int16_t  num_channels;
    int32_t  sample_rate;
    int32_t  byte_rate;
    int16_t  block_align;
    int16_t  bits_per_sample;
    char     subchunk2_id[4];
    int32_t  subchunk2_size;
} WavHeader;

void write_wav_header(FILE *file, int32_t sample_rate, int32_t pcm_data_size) {
    WavHeader header;
    int16_t num_channels = 1; // 单声道
    int16_t bits_per_sample = 16; // 16-bit PCM

    strncpy(header.chunk_id, "RIFF", 4);
    strncpy(header.format, "WAVE", 4);
    strncpy(header.subchunk1_id, "fmt ", 4);
    strncpy(header.subchunk2_id, "data", 4);

    header.subchunk1_size = 16;
    header.audio_format = 1; // PCM
    header.num_channels = num_channels;
    header.sample_rate = sample_rate;
    header.bits_per_sample = bits_per_sample;
    header.byte_rate = sample_rate * num_channels * bits_per_sample / 8;
    header.block_align = num_channels * bits_per_sample / 8;
    header.subchunk2_size = pcm_data_size;
    header.chunk_size = 36 + pcm_data_size;

    fwrite(&header, 1, sizeof(WavHeader), file);
}

EMSCRIPTEN_KEEPALIVE
unsigned char* decode_spx_to_wav(const unsigned char* ogg_spx_data, int ogg_spx_size, int* wav_size) {
    // --- Ogg & Speex 初始化 ---
    ogg_sync_state   oy;
    ogg_stream_state os;
    ogg_page         og;
    ogg_packet       op;

    void *decoder_state;
    SpeexBits bits;
    int frame_size;

    // 初始化 Speex
    decoder_state = speex_decoder_init(&speex_wb_mode); // 宽带
    int enh = 1; // 开启增强
    speex_decoder_ctl(decoder_state, SPEEX_SET_ENH, &enh);
    speex_decoder_ctl(decoder_state, SPEEX_GET_FRAME_SIZE, &frame_size);
    speex_bits_init(&bits);

    // 初始化 Ogg
    ogg_sync_init(&oy);

    // 内存文件用于存储解码后的 PCM 数据
    char *pcm_buffer = NULL;
    size_t pcm_buffer_size = 0;
    FILE *pcm_stream = open_memstream(&pcm_buffer, &pcm_buffer_size);

    int stream_init = 0;
    int bytes_read = 0;

    // --- 主解码循环 ---
    while (1) {
        int buffer_size = 4096;
        char *buffer = ogg_sync_buffer(&oy, buffer_size);

        // 从输入 buffer 中读取数据块
        int bytes_to_copy = (ogg_spx_size - bytes_read < buffer_size) ? (ogg_spx_size - bytes_read) : buffer_size;
        if (bytes_to_copy > 0) {
            memcpy(buffer, ogg_spx_data + bytes_read, bytes_to_copy);
            bytes_read += bytes_to_copy;
        }
        ogg_sync_wrote(&oy, bytes_to_copy);

        // 如果没有更多数据，跳出
        if (bytes_to_copy == 0 && ogg_sync_pageout(&oy, &og) != 1) {
            break;
        }

        // 从 Ogg 同步层提取页面 (Page)
        while (ogg_sync_pageout(&oy, &og) == 1) {
            if (!stream_init) {
                ogg_stream_init(&os, ogg_page_serialno(&og));
                stream_init = 1;
            }

            // 将页面提交到逻辑流
            ogg_stream_pagein(&os, &og);

            // 从流中提取数据包 (Packet)
            while (ogg_stream_packetout(&os, &op) == 1) {
                // op.packet 是纯净的 Speex 数据
                speex_bits_read_from(&bits, (char*)op.packet, op.bytes);

                short *output_frame = (short*)malloc(sizeof(short) * frame_size);
                if (speex_decode_int(decoder_state, &bits, output_frame) == 0) {
                    fwrite(output_frame, sizeof(short), frame_size, pcm_stream);
                }
                free(output_frame);
            }
        }
    }

    fclose(pcm_stream);

    // --- 创建 WAV 文件头并合并 ---
    char *wav_buffer = NULL;
    size_t final_wav_size = 0;
    FILE *wav_stream = open_memstream(&wav_buffer, &final_wav_size);

    int sample_rate;
    speex_decoder_ctl(decoder_state, SPEEX_GET_SAMPLING_RATE, &sample_rate);
    write_wav_header(wav_stream, sample_rate, pcm_buffer_size);
    fwrite(pcm_buffer, 1, pcm_buffer_size, wav_stream);
    fclose(wav_stream);

    // --- 清理资源 ---
    free(pcm_buffer);
    if (stream_init) ogg_stream_clear(&os);
    ogg_sync_clear(&oy);
    speex_decoder_destroy(decoder_state);
    speex_bits_destroy(&bits);

    *wav_size = final_wav_size;
    return (unsigned char*)wav_buffer;
}
// 提供一个释放内存的函数，让 JS 可以调用
EMSCRIPTEN_KEEPALIVE
void free_wav_buffer(void* buffer) {
    free(buffer);
}
