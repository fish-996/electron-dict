// vite-env.d.ts 或 custom.d.ts

// 从 Node.js 内置模块导入类型，这不会在运行时引入任何代码。

/**
 * 告知 TypeScript 如何处理以 `?modulePath` 结尾的导入。
 * 这种导入的默认导出会返回一个 Node.js Worker 脚本的路径字符串。
 */
declare module "*?modulePath" {
    /**
     * Worker 脚本的模块路径。
     * @example '/dist/assets/worker-node.12345.js'
     */
    const path: string;
    export default path;
}

/**
 * 告知 TypeScript 如何处理以 `?nodeWorker` 结尾的导入。
 * 这种导入的默认导出会返回一个 Worker 构造函数，
 * 调用它会创建一个新的 Node.js Worker 实例。
 */
declare module "*?nodeWorker" {
    /**
     * 一个用于创建 Node.js Worker 实例的构造函数。
     * @param options - 传递给 `new Worker()` 的选项，例如 `workerData`。
     * @returns 一个新的 `Worker` 实例。
     */
    const createWorker: (options?: WorkerOptions) => Worker;
    export default createWorker;
}

declare module "*.xx" {
    const content: number;
    export default content;
}
