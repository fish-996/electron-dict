// eslint.config.js
import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginPrettier from "eslint-plugin-prettier";
import configPrettier from "eslint-config-prettier";

export default [
    // 全局忽略文件
    {
        ignores: ["node_modules/", "dist/", "out/", "release/", ".vite/"],
    },
    // 基础配置
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    // React 相关配置
    {
        files: ["src/renderer/**/*.{ts,tsx}"], // 只对 renderer 文件应用 React 规则
        plugins: {
            react: pluginReact,
            "react-hooks": pluginReactHooks,
        },
        languageOptions: {
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
            globals: {
                ...globals.browser,
            },
        },
        rules: {
            ...pluginReact.configs.recommended.rules,
            ...pluginReactHooks.configs.recommended.rules,
            "react/react-in-jsx-scope": "off",
            "react/prop-types": "off",
        },
        settings: {
            react: {
                version: "detect",
            },
        },
    },
    // Prettier 配置 (必须是最后一个)
    {
        plugins: {
            prettier: pluginPrettier,
        },
        rules: {
            ...configPrettier.rules, // 应用 prettier 的规则覆盖
            "prettier/prettier": "error",
        },
    },
    // 全局自定义规则
    {
        rules: {
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-unused-vars": "warn"
        },
    },
];
