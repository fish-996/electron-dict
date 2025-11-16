// src/contexts/AppContext.tsx
import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    ReactNode,
    useCallback, // 引入 useCallback
} from "react";

// 从 preload 脚本导入类型定义，以确保类型安全
import type { FullConfig, DictionaryConfig } from "@preload-api"; // 确保导入 DictionaryConfig

interface AppContextType {
    config: FullConfig | null;
    userScripts: Record<string, string>;
    reloadConfig: () => void;
    // 新增：用于更新单个词典配置的方法
    updateDictionaryConfig: (
        dictId: string,
        newDictConfig: DictionaryConfig,
    ) => Promise<void>;
    // 新增：用于更新所有词典配置的方法 (供 SettingsModal 使用)
    updateAllDictionaryConfigs: (
        newConfigs: FullConfig["configs"],
    ) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppContextProvider: React.FC<{ children: ReactNode }> = ({
    children,
}) => {
    const [config, setConfig] = useState<FullConfig | null>(null);
    const [userScripts, setUserScripts] = useState<Record<string, string>>({});

    // 使用 useCallback 包装 loadData，防止不必要的重新创建
    const loadData = useCallback(async () => {
        console.log("Fetching config and scripts...");
        try {
            const fullConfig = await window.electronAPI.getFullConfig();
            const scripts = await window.electronAPI.getAllUserScripts();
            setConfig(fullConfig);
            setUserScripts(scripts);
            console.log("Config and scripts loaded.", { fullConfig, scripts });
        } catch (error) {
            console.error("Failed to load initial app data:", error);
        }
    }, []); // 依赖项为空，因为它不依赖于外部状态

    useEffect(() => {
        // 初始加载
        loadData();

        // 监听来自主进程的更新通知
        const cleanup = window.electronAPI.onConfigUpdated(() => {
            console.log("Config updated event received. Reloading data...");
            loadData();
        });

        // 组件卸载时清理监听器
        return () => {
            cleanup();
        };
    }, [loadData]); // 依赖 loadData

    // 新增：用于更新单个词典配置的方法
    const updateDictionaryConfig = useCallback(
        async (dictId: string, newDictConfig: DictionaryConfig) => {
            if (!config) {
                console.warn(
                    "Attempted to update dictionary config before config was loaded.",
                );
                return;
            }
            const updatedConfigs = {
                ...config.configs,
                [dictId]: newDictConfig,
            };
            try {
                await window.electronAPI.updateConfig(updatedConfigs);
                // 成功更新后，Electron 的 onConfigUpdated 事件会触发 loadData，
                // 所以这里不需要手动调用 loadData。
                // 如果 onConfigUpdated 机制不可靠，可以手动调用 loadData()。
                console.log(`Dictionary config updated for ${dictId}.`);
            } catch (error) {
                console.error(`Failed to update config for ${dictId}:`, error);
                throw error; // 抛出错误以便调用方处理
            }
        },
        [config], // 依赖 config
    );

    // 新增：用于更新所有词典配置的方法 (供 SettingsModal 使用)
    const updateAllDictionaryConfigs = useCallback(
        async (newConfigs: FullConfig["configs"]) => {
            try {
                await window.electronAPI.updateConfig(newConfigs);
                // 同上，onConfigUpdated 会处理后续的 loadData
                console.log("All dictionary configs updated.");
            } catch (error) {
                console.error("Failed to update all configs:", error);
                throw error;
            }
        },
        [], // 不依赖config，因为传入的是完整的newConfigs
    );

    const value = {
        config,
        userScripts,
        reloadConfig: loadData, // 提供一个手动重载的方法
        updateDictionaryConfig,
        updateAllDictionaryConfigs,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = (): AppContextType => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error(
            "useAppContext must be used within an AppContextProvider",
        );
    }
    return context;
};
