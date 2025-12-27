import React, { useMemo, useState, useCallback } from "react";
import styles from "./AnkiCardModal.module.css";

export type CardSourceDictionaryBlock = {
    dictionaryId: string;
    dictionaryName: string;
    htmlContent: string;
    // audioCandidates?: Array<{ label: string; key: string }>; // TODO
};

export type AnkiCardDraftContext = {
    searchWord: string;
    blocks: CardSourceDictionaryBlock[];
};

type FieldType = "text" | "audio";

type AnkiFieldSpec = {
    name: string;
    type: FieldType;
    multiline?: boolean;
};

const FIELD_SPECS: AnkiFieldSpec[] = [
    { name: "Front", type: "text", multiline: false },
    { name: "Back", type: "text", multiline: true },
    { name: "Audio", type: "audio" },
];

interface AnkiCardModalProps {
    isOpen: boolean;
    onClose: () => void;
    context: AnkiCardDraftContext;
}

const AnkiCardModal: React.FC<AnkiCardModalProps> = ({
    isOpen,
    onClose,
    context,
}) => {
    const initialFieldValues = useMemo(() => {
        // Per requirements: default empty, user chooses a dictionary as starting value.
        const values: Record<string, string> = {};
        for (const spec of FIELD_SPECS) {
            if (spec.type === "text") values[spec.name] = "";
        }
        return values;
    }, []);

    const [fieldValues, setFieldValues] =
        useState<Record<string, string>>(initialFieldValues);

    const updateField = useCallback((fieldName: string, value: string) => {
        setFieldValues((prev) => ({ ...prev, [fieldName]: value }));
    }, []);

    const fillFieldFromDictionary = useCallback(
        (fieldName: string, block: CardSourceDictionaryBlock) => {
            const header = `<h3>${block.dictionaryName}</h3>`;
            const combined = `${header}\n${block.htmlContent}`;
            updateField(fieldName, combined);
        },
        [updateField],
    );

    const handleSubmit = useCallback(() => {
        const payload = {
            searchWord: context.searchWord,
            fields: fieldValues,
            sourceDictionaries: context.blocks.map((b) => ({
                dictionaryId: b.dictionaryId,
                dictionaryName: b.dictionaryName,
            })),
        };

        // MVP stub: later we will send this to main process / AnkiConnect.
        console.log("[AnkiCardModal] Draft submit:", payload);
        onClose();
    }, [context.blocks, context.searchWord, fieldValues, onClose]);

    const handleOverlayMouseDown = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (e.target === e.currentTarget) onClose();
        },
        [onClose],
    );

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onMouseDown={handleOverlayMouseDown}>
            <div className={styles.modal} role="dialog" aria-modal="true">
                <div className={styles.header}>
                    <div className={styles.title}>
                        Create Anki Card — “{context.searchWord}”
                    </div>
                    <button className={styles.footerBtn} onClick={onClose}>
                        Close
                    </button>
                </div>

                <div className={styles.body}>
                    <div className={styles.left}>
                        <p className={styles.sectionTitle}>
                            Fields (hard-coded)
                        </p>

                        {FIELD_SPECS.map((spec) => {
                            if (spec.type === "audio") {
                                return (
                                    <div
                                        key={spec.name}
                                        className={styles.field}
                                    >
                                        <div className={styles.fieldLabelRow}>
                                            <div className={styles.fieldLabel}>
                                                {spec.name} (audio)
                                            </div>
                                        </div>
                                        <select
                                            className={styles.select}
                                            disabled
                                            value={""}
                                        >
                                            <option value="">
                                                TODO: audio selection not
                                                implemented
                                            </option>
                                        </select>
                                    </div>
                                );
                            }

                            const value = fieldValues[spec.name] ?? "";
                            return (
                                <div key={spec.name} className={styles.field}>
                                    <div className={styles.fieldLabelRow}>
                                        <div className={styles.fieldLabel}>
                                            {spec.name}
                                        </div>
                                    </div>

                                    {spec.multiline ? (
                                        <textarea
                                            className={styles.textarea}
                                            value={value}
                                            onChange={(e) =>
                                                updateField(
                                                    spec.name,
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="Empty by default. Use the right panel to choose a dictionary as starting value."
                                        />
                                    ) : (
                                        <input
                                            className={styles.input}
                                            value={value}
                                            onChange={(e) =>
                                                updateField(
                                                    spec.name,
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="Empty by default"
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className={styles.right}>
                        <p className={styles.sectionTitle}>
                            Dictionary contents (expanded)
                        </p>

                        {context.blocks.length === 0 ? (
                            <div style={{ color: "#a0a0a0" }}>
                                No dictionary content available for this search.
                            </div>
                        ) : (
                            context.blocks.map((block) => (
                                <div
                                    key={block.dictionaryId}
                                    className={styles.dictBlock}
                                >
                                    <div className={styles.dictHeader}>
                                        <div className={styles.dictName}>
                                            {block.dictionaryName}
                                        </div>
                                        <div className={styles.dictActions}>
                                            <button
                                                className={styles.dictActionBtn}
                                                onClick={() =>
                                                    fillFieldFromDictionary(
                                                        "Back",
                                                        block,
                                                    )
                                                }
                                                title="Use this dictionary as Back field starting value"
                                            >
                                                Use as Back
                                            </button>
                                            <button
                                                className={styles.dictActionBtn}
                                                onClick={() =>
                                                    updateField(
                                                        "Front",
                                                        context.searchWord,
                                                    )
                                                }
                                                title="Fill Front with search word"
                                            >
                                                Use as Front
                                            </button>
                                        </div>
                                    </div>

                                    <div
                                        className={styles.dictContent}
                                        dangerouslySetInnerHTML={{
                                            __html:
                                                block.htmlContent ||
                                                "<i>(empty)</i>",
                                        }}
                                    />
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className={styles.footer}>
                    <button className={styles.footerBtn} onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        className={`${styles.footerBtn} ${styles.primaryBtn}`}
                        onClick={handleSubmit}
                    >
                        Create (stub)
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AnkiCardModal;
