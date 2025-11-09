// src/contexts/AppContext.tsx
import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    ReactNode,
} from "react";

// 从 preload 脚本导入类型定义，以确保类型安全
import type { FullConfig } from "@preload-api";

interface AppContextType {
    config: FullConfig | null;
    userScripts: Record<string, string>;
    reloadConfig: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppContextProvider: React.FC<{ children: ReactNode }> = ({
    children,
}) => {
    const [config, setConfig] = useState<FullConfig | null>(null);
    const [userScripts, setUserScripts] = useState<Record<string, string>>({});

    const loadData = async () => {
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
    };

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
    }, []);

    const value = {
        config,
        userScripts,
        reloadConfig: loadData, // 提供一个手动重载的方法
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
