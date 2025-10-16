// src/components/Header.tsx
import React from "react";
import { SettingsIcon } from "./Icons";
import styles from "./Header.module.css";

interface HeaderProps {
    onSettingsClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onSettingsClick }) => {
    return (
        <header className={styles.header}>
            <h1 className={styles.title}>MDict Reader</h1>
            <button
                className={styles.settingsButton}
                onClick={onSettingsClick}
                aria-label="Open Settings"
            >
                <SettingsIcon />
            </button>
        </header>
    );
};

export default Header;
