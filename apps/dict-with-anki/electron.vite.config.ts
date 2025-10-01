import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { resolve } from "path";
import reactPlugin from "@vitejs/plugin-react";

export default defineConfig({
    main: {
        worker: {
            format: "es",
        },
        plugins: [externalizeDepsPlugin({})],
        build: {
            rollupOptions: {
                external: [
                    "@dict/reader", // 明确告诉 vite 不要打包这个模块
                ],
            },
        },
    },
    preload: {
        plugins: [externalizeDepsPlugin()],
    },
    renderer: {
        resolve: {
            alias: {
                "@renderer": resolve("src/renderer/src"),
            },
        },
        plugins: [reactPlugin()],
    },
});
