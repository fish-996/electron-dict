// src/components/SettingsModal.tsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import type { FullConfig, DictionaryConfig } from "@preload-api";
import styles from "./SettingsModal.module.css";
import { FolderOpenIcon } from "./Icons";
import { useAppContext } from "@renderer/AppContext"; // 假设你有一个 FolderOpenIcon 组件

// 一个小组件，用于渲染单个词典组
const DictionaryGroupItem: React.FC<{
    group: FullConfig["discoveredGroups"][0];
    config: DictionaryConfig;
    onConfigChange: (newConfig: DictionaryConfig) => void;
}> = ({ group, config, onConfigChange }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [customNameInput, setCustomNameInput] = useState(
        config.customName || group.name,
    );

    useEffect(() => {
        setCustomNameInput(config.customName || group.name);
    }, [config.customName, group.name]);

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

    const handleCustomNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newName = e.target.value.trim();
        setCustomNameInput(newName);
        onConfigChange({ ...config, customName: newName || undefined });
    };

    // 新增：打开路径的处理器，现在它会智能地处理文件和目录
    const handleOpenPath = useCallback(async (path: string) => {
        try {
            await window.electronAPI.openPathInExplorer(path);
        } catch (error) {
            console.error("Failed to open path:", error);
        }
    }, []);

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
                    {config.customName || group.name}
                </label>
                <button
                    onClick={() => handleOpenPath(group.mdxPath)} // 打开词典根目录
                    className={styles.openPathButton}
                    title="Open dictionary folder"
                >
                    <FolderOpenIcon />
                </button>
                {group.resources.length > 0 && (
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className={styles.expandButton}
                    >
                        {isExpanded ? "Collapse" : "Expand"}
                    </button>
                )}
            </div>
            <div className={styles.customNameEditor}>
                <label htmlFor={`custom-name-${group.id}`}>Custom Name:</label>
                <input
                    id={`custom-name-${group.id}`}
                    type="text"
                    value={customNameInput}
                    onChange={handleCustomNameChange}
                    placeholder={`Default: ${group.name}`}
                />
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
                            {/* 新增：打开资源文件所在目录的按钮 */}
                            <button
                                onClick={() => handleOpenPath(group.mdxPath)} // 打开该资源所属词典的根目录
                                className={`${styles.openPathButton} ${styles.resourceOpenPathButton}`}
                                title="Open dictionary folder"
                            >
                                <FolderOpenIcon />
                            </button>
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
    const { config: globalConfig, updateAllDictionaryConfigs } =
        useAppContext();
    const [localConfig, setLocalConfig] = useState<FullConfig | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen && globalConfig) {
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
            await updateAllDictionaryConfigs(localConfig.configs);
            onClose();
        } catch (error) {
            console.error("Failed to save settings:", error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddScanPath = async () => {
        setIsSaving(true);
        try {
            await window.electronAPI.addScanPath();
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

    // 统一的打开路径处理器
    const handleOpenPath = useCallback(async (path: string) => {
        try {
            await window.electronAPI.openPathInExplorer(path);
        } catch (error) {
            console.error("Failed to open path:", error);
        }
    }, []);

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
                                            <span className={styles.pathText}>
                                                {path}
                                            </span>
                                            <div className={styles.pathActions}>
                                                <button
                                                    onClick={() =>
                                                        handleOpenPath(path)
                                                    }
                                                    className={
                                                        styles.openPathButton
                                                    }
                                                    title="Open folder"
                                                    disabled={isSaving}
                                                >
                                                    <FolderOpenIcon />
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        handleRemoveScanPath(
                                                            path,
                                                        )
                                                    }
                                                    className={
                                                        styles.removeButton
                                                    }
                                                    disabled={isSaving}
                                                >
                                                    Remove
                                                </button>
                                            </div>
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
                                    <p className={styles.noDictionaries}>
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
                                                        ] || {
                                                            enabled: false,
                                                            enabledResources:
                                                                {},
                                                        }
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
