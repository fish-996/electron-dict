/**
 * @file Speex/Ogg WASM Decoder Module
 * @description Provides a high-level API to decode Speex audio data (in an Ogg container) into WAV format.
 * This module handles loading the WebAssembly binary, managing memory, and wrapping the low-level C functions.
 */

import path from "path";
// 导入由 Emscripten 生成的胶水代码。
// @ts-expect-error - TypeScript 不知道这个 JS 文件的具体类型，我们将在下面定义它。
import createSpeexModule from "./speex-decoder.js";

/**
 * 定义 Emscripten 模块的 TypeScript 接口，以便获得类型提示和安全。
 * 这对应于我们在 C 代码中导出的函数和 Emscripten 提供的内存管理工具。
 */
interface SpeexModule extends EmscriptenModule {
    // 从 C 导出的内存分配/释放函数
    _malloc(size: number): number;
    _free(ptr: number): void;
    _free_wav_buffer(wavPtr: number): void;

    // 我们核心的 C 解码函数
    _decode_spx_to_wav(
        spxPtr: number,
        spxSize: number,
        wavSizePtr: number,
    ): number;
}

// 使用单例模式确保 WASM 模块只被加载和初始化一次。
let wasmModule: SpeexModule | null = null;

/**
 * 异步加载并初始化 WASM 模块。
 * 如果模块已加载，则直接返回，避免重复加载。
 * @returns {Promise<SpeexModule>} 返回已初始化的 WASM 模块实例。
 */
async function getModule(): Promise<SpeexModule> {
    if (wasmModule) {
        return wasmModule;
    }

    // Emscripten 模块加载器需要一个配置对象。
    const moduleLoader = createSpeexModule({
        /**
         * 在 Node.js/Electron 环境中，必须提供 locateFile 函数，
         * 以便胶水代码能找到 .wasm 二进制文件。
         * @param {string} filePath - Emscripten 正在寻找的文件名，例如 "speex-decoder.wasm"。
         * @returns {string} 文件的绝对路径。
         */
        locateFile: (filePath: string) => {
            if (filePath.endsWith(".wasm")) {
                // 假设 .wasm 文件与最终编译出的 index.js 在同一个目录下 (dist/)
                return path.resolve(__dirname, "speex-decoder.wasm");
            }
            return filePath;
        },
    });

    // 等待模块完全加载和编译完成
    wasmModule = await moduleLoader;
    return wasmModule as SpeexModule;
}

/**
 * 将包含 Ogg/Speex 音频数据的 Buffer 转换为包含 WAV 音频数据的 Buffer。
 * 这是本包提供的核心功能。
 *
 * @param {Buffer} spxBuffer - 包含 Ogg/Speex 音频数据的 Node.js Buffer。
 * @returns {Promise<Buffer>} 返回一个包含标准 WAV 格式音频数据的 Node.js Buffer。
 * @throws {Error} 如果内存分配失败或 WASM 内部解码失败，将抛出错误。
 */
export async function convertSpxToWav(spxBuffer: Buffer): Promise<Buffer> {
    const module = await getModule();

    // 在 WASM 内存中为输入和输出指针分配空间
    let spxPtr = 0;
    let wavSizePtr = 0;
    let wavPtr = 0;

    try {
        // 1. 为输入的 SPX 数据在 WASM 堆上分配内存
        spxPtr = module._malloc(spxBuffer.length);
        if (spxPtr === 0) {
            throw new Error(
                "Failed to allocate memory for SPX data in WASM heap.",
            );
        }

        // 2. 将 Node.js Buffer 的数据复制到 WASM 内存中
        module.HEAPU8.set(spxBuffer, spxPtr);

        // 3. 为一个指向 int 的指针分配内存，C 函数将通过它返回输出的 WAV 数据大小
        wavSizePtr = module._malloc(4); // sizeof(int) is 4 bytes
        if (wavSizePtr === 0) {
            throw new Error(
                "Failed to allocate memory for WAV size pointer in WASM heap.",
            );
        }

        // 4. 调用核心的 C 函数进行解码
        wavPtr = module._decode_spx_to_wav(
            spxPtr,
            spxBuffer.length,
            wavSizePtr,
        );

        // 如果 C 函数返回 0 (空指针)，说明内部发生了错误
        if (wavPtr === 0) {
            throw new Error(
                "SPX to WAV conversion failed inside WASM module. Input might be invalid.",
            );
        }

        // 5. 从 WASM 内存中读取 C 函数写入的 WAV 数据大小
        const wavSize = module.HEAP32[wavSizePtr / 4];

        // 6. 从 WASM 内存中复制出解码后的 WAV 数据，创建一个新的、安全的 Node.js Buffer
        const wavBuffer = Buffer.from(
            module.HEAPU8.subarray(wavPtr, wavPtr + wavSize),
        );

        return wavBuffer;
    } finally {
        // 7. 无论成功与否，都必须释放所有在 WASM 中分配的内存，防止内存泄漏
        if (spxPtr !== 0) module._free(spxPtr);
        if (wavSizePtr !== 0) module._free(wavSizePtr);
        // 调用我们自定义的释放函数来释放由 C 代码内部 malloc 的 WAV 缓冲区
        if (wavPtr !== 0) module._free_wav_buffer(wavPtr);
    }
}

/**
 * (可选) 清理并卸载 WASM 模块。
 * 在某些需要热重载或应用退出的场景下可能有用。
 */
export function cleanupModule() {
    wasmModule = null;
    // Emscripten 模块没有标准的销毁方法，将其设为 null 有助于垃圾回收。
}
