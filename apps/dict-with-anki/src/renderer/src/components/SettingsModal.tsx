// src/components/SettingsModal.tsx
import React, { useState, useEffect, useMemo } from "react";
import type { FullConfig, DictionaryConfig } from "@preload-api";
import styles from "./SettingsModal.module.css";
import { useAppContext } from "@renderer/AppContext";

// 一个小组件，用于渲染单个词典组
const DictionaryGroupItem: React.FC<{
    group: FullConfig["discoveredGroups"][0];
    config: DictionaryConfig;
    onConfigChange: (newConfig: DictionaryConfig) => void;
}> = ({ group, config, onConfigChange }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const handleGroupToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
        onConfigChange({ ...config, enabled: e.target.checked });
    };

    const handleResourceToggle = (resourcePath: string, isEnabled: boolean) => {
        const newResources = {
            ...config.enabledResources,
            [resourcePath]: isEnabled,
        };
        onConfigChange({ ...config, enabledResources: newResources });
    };

    // 按类型分组资源
    const sortedResources = useMemo(() => {
        return [...group.resources].sort((a, b) => {
            if (a.type < b.type) return -1;
            if (a.type > b.type) return 1;
            return a.name.localeCompare(b.name);
        });
    }, [group.resources]);

    return (
        <li className={styles.dictGroup}>
            <div className={styles.dictGroupHeader}>
                <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={handleGroupToggle}
                    id={`group-toggle-${group.id}`}
                />
                <label
                    htmlFor={`group-toggle-${group.id}`}
                    className={styles.dictGroupName}
                >
                    {group.name}
                </label>
                {group.resources.length > 0 && (
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className={styles.expandButton}
                    >
                        {isExpanded ? "Collapse" : "Expand"}
                    </button>
                )}
            </div>
            {isExpanded && (
                <ul className={styles.resourceList}>
                    {sortedResources.map((res) => (
                        <li key={res.path} className={styles.resourceItem}>
                            <input
                                type="checkbox"
                                id={`res-toggle-${res.path}`}
                                checked={
                                    config.enabledResources[res.path] ?? false
                                }
                                onChange={(e) =>
                                    handleResourceToggle(
                                        res.path,
                                        e.target.checked,
                                    )
                                }
                            />
                            <label htmlFor={`res-toggle-${res.path}`}>
                                <span
                                    className={`${styles.resourceTag} ${styles[res.type]}`}
                                >
                                    {res.type}
                                </span>
                                {res.name}
                            </label>
                        </li>
                    ))}
                </ul>
            )}
        </li>
    );
};

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    // 从全局 Context 中获取原始配置
    const { config: globalConfig } = useAppContext();

    // 使用本地状态来管理编辑过程中的配置，避免频繁触发全局重载
    const [localConfig, setLocalConfig] = useState<FullConfig | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // 当模态框打开时，或全局配置更新时，同步本地状态
    useEffect(() => {
        if (isOpen && globalConfig) {
            // 创建一个深拷贝以进行本地编辑
            setLocalConfig(JSON.parse(JSON.stringify(globalConfig)));
        }
    }, [isOpen, globalConfig]);

    const handleConfigChange = (
        dictId: string,
        newDictConfig: DictionaryConfig,
    ) => {
        if (!localConfig) return;
        setLocalConfig({
            ...localConfig,
            configs: {
                ...localConfig.configs,
                [dictId]: newDictConfig,
            },
        });
    };

    const handleSaveChanges = async () => {
        if (!localConfig) return;
        setIsSaving(true);
        try {
            await window.electronAPI.updateConfig(localConfig.configs);
            // 保存成功后，全局的 AppContext 会自动更新，我们只需关闭模态框
            onClose();
        } catch (error) {
            console.error("Failed to save settings:", error);
            // 可以在此显示错误提示
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddScanPath = async () => {
        setIsSaving(true);
        try {
            await window.electronAPI.addScanPath();
            // 添加路径后，AppContext 会自动重载，这里我们不需要做任何事
        } catch (error) {
            console.error("Failed to add scan path:", error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveScanPath = async (pathToRemove: string) => {
        const confirmation = confirm(
            `Are you sure you want to remove this scan path?\n\n${pathToRemove}`,
        );
        if (!confirmation) return;

        setIsSaving(true);
        try {
            await window.electronAPI.removeScanPath(pathToRemove);
        } catch (error) {
            console.error("Failed to remove scan path:", error);
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <div className={styles.modalHeader}>
                    <h2>Settings</h2>
                    <button className={styles.closeButton} onClick={onClose}>
                        &times;
                    </button>
                </div>

                <div className={styles.modalBody}>
                    {isSaving && (
                        <div className={styles.loadingOverlay}>
                            <p>Processing...</p>
                        </div>
                    )}
                    {!localConfig ? (
                        <p>Loading configuration...</p>
                    ) : (
                        <>
                            <section className={styles.settingsSection}>
                                <h3>Dictionary Scan Paths</h3>
                                <ul className={styles.pathList}>
                                    {localConfig.scanPaths.map((path) => (
                                        <li
                                            key={path}
                                            className={styles.pathItem}
                                        >
                                            <span>{path}</span>
                                            <button
                                                onClick={() =>
                                                    handleRemoveScanPath(path)
                                                }
                                                disabled={isSaving}
                                            >
                                                Remove
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                                <button
                                    onClick={handleAddScanPath}
                                    disabled={isSaving}
                                >
                                    Add Scan Path
                                </button>
                                <p className={styles.hint}>
                                    The app will find all .mdx files in these
                                    folders.
                                </p>
                            </section>

                            <section className={styles.settingsSection}>
                                <h3>Available Dictionaries</h3>
                                {localConfig.discoveredGroups.length === 0 ? (
                                    <p>
                                        No dictionaries found in the scan paths.
                                    </p>
                                ) : (
                                    <ul className={styles.dictGroupList}>
                                        {localConfig.discoveredGroups.map(
                                            (group) => (
                                                <DictionaryGroupItem
                                                    key={group.id}
                                                    group={group}
                                                    config={
                                                        localConfig.configs[
                                                            group.id
                                                        ]
                                                    }
                                                    onConfigChange={(
                                                        newConfig,
                                                    ) =>
                                                        handleConfigChange(
                                                            group.id,
                                                            newConfig,
                                                        )
                                                    }
                                                />
                                            ),
                                        )}
                                    </ul>
                                )}
                            </section>
                        </>
                    )}
                </div>

                <div className={styles.modalFooter}>
                    <button onClick={onClose} className={styles.cancelButton}>
                        Cancel
                    </button>
                    <button
                        onClick={handleSaveChanges}
                        disabled={isSaving || !localConfig}
                    >
                        {isSaving ? "Saving..." : "Save and Reload"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
