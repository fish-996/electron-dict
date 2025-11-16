// src/components/Header.tsx
import React, { useMemo, useCallback } from "react";
import { SettingsIcon } from "./Icons";
import styles from "./Header.module.css";
import { useAppContext } from "../AppContext";

interface HeaderProps {
    onSettingsClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onSettingsClick }) => {
    const { config, updateDictionaryConfig } = useAppContext();

    const allDictionaries = useMemo(() => {
        if (!config) return [];
        return config.discoveredGroups
            .map((group) => ({
                id: group.id,
                // <--- 关键修改：优先使用 customName
                name: config.configs[group.id]?.customName || group.name,
                enabled: config.configs[group.id]?.enabled ?? false,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [config]);

    const handleToggleDictionary = useCallback(
        async (dictId: string, currentEnabled: boolean) => {
            if (!config) return;
            const currentDictConfig = config.configs[dictId];
            const newDictConfig = currentDictConfig
                ? { ...currentDictConfig, enabled: !currentEnabled }
                : { enabled: !currentEnabled, enabledResources: {} };

            await updateDictionaryConfig(dictId, newDictConfig);
        },
        [config, updateDictionaryConfig],
    );

    return (
        <header className={styles.header}>
            <h1 className={styles.title}>MDict Reader</h1>
            <div className={styles.controls}>
                <div className={styles.dictionaryButtonsContainer}>
                    {allDictionaries.length === 0 ? (
                        <span className={styles.noDictionariesText}>
                            No dictionaries found.
                        </span>
                    ) : (
                        allDictionaries.map((dict) => (
                            <button
                                key={dict.id}
                                className={`${styles.dictionaryToggleBtn} ${dict.enabled ? styles.enabled : styles.disabled}`}
                                onClick={() =>
                                    handleToggleDictionary(
                                        dict.id,
                                        dict.enabled,
                                    )
                                }
                                title={
                                    dict.enabled
                                        ? `Disable ${dict.name}`
                                        : `Enable ${dict.name}`
                                }
                            >
                                {dict.name}
                            </button>
                        ))
                    )}
                </div>

                <button
                    className={styles.settingsButton}
                    onClick={onSettingsClick}
                    aria-label="Open Settings"
                >
                    <SettingsIcon />
                </button>
            </div>
        </header>
    );
};

export default Header;
