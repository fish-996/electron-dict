// src/SettingsModal.tsx

import React, { useState, useEffect } from "react";
import styles from "./SettingsModal.module.css";

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const [dictionaryPaths, setDictionaryPaths] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsLoading(true);
            window.electronAPI
                .getDictionaryPaths()
                .then((paths) => {
                    setDictionaryPaths(paths);
                    setIsLoading(false);
                })
                .catch((err) => {
                    console.error("Failed to get dictionary paths:", err);
                    setIsLoading(false);
                });
        }
    }, [isOpen]);

    const handleAddDictionaries = async () => {
        setIsLoading(true);
        try {
            const newPaths = await window.electronAPI.addDictionaries();
            setDictionaryPaths(newPaths);
        } catch (error) {
            console.error("Failed to add dictionaries:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRemoveDictionary = async (pathToRemove: string) => {
        setIsLoading(true);
        try {
            const newPaths =
                await window.electronAPI.removeDictionary(pathToRemove);
            setDictionaryPaths(newPaths);
        } catch (error) {
            console.error("Failed to remove dictionary:", error);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div
                className={styles.modalContent}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={styles.modalHeader}>
                    <h2>Manage Dictionaries</h2>
                    <button className={styles.closeButton} onClick={onClose}>
                        &times;
                    </button>
                </div>
                <div className={styles.modalBody}>
                    {isLoading && <p>Loading...</p>}
                    {!isLoading && dictionaryPaths.length === 0 && (
                        <p>No dictionaries added yet.</p>
                    )}
                    <ul className={styles.dictList}>
                        {dictionaryPaths.map((path) => (
                            <li key={path} className={styles.dictItem}>
                                <span className={styles.dictPath}>{path}</span>
                                <button
                                    className={styles.removeButton}
                                    onClick={() => handleRemoveDictionary(path)}
                                    disabled={isLoading}
                                >
                                    Remove
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className={styles.modalFooter}>
                    <button
                        onClick={handleAddDictionaries}
                        disabled={isLoading}
                    >
                        Add Dictionaries (.mdx)
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
