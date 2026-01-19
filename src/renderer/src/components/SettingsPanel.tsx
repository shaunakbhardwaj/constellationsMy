'use client';

import { useState, useEffect, useRef } from 'react';
import { AVAILABLE_MODELS } from '@/lib/openrouter';
import { useTheme } from './ThemeProvider';
import styles from './SettingsPanel.module.css';

interface SettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    apiKey: string;
    onApiKeyChange: (key: string) => void;
    model: string;
    onModelChange: (model: string) => void;
}

export default function SettingsPanel({
    isOpen,
    onClose,
    apiKey,
    onApiKeyChange,
    model,
    onModelChange,
}: SettingsPanelProps) {
    const [showApiKey, setShowApiKey] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const { theme, setTheme } = useTheme();

    // Close on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            return () => document.removeEventListener('keydown', handleEscape);
        }
    }, [isOpen, onClose]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className={styles.overlay}>
            <div ref={panelRef} className={styles.panel}>
                <div className={styles.header}>
                    <h2>Settings</h2>
                    <button className={styles.closeButton} onClick={onClose} aria-label="Close settings">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div className={styles.content}>
                    {/* Theme Selection */}
                    <div className={styles.field}>
                        <label htmlFor="settingsTheme">Appearance</label>
                        <select
                            id="settingsTheme"
                            value={theme}
                            onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
                            className={styles.select}
                        >
                            <option value="dark">Dark</option>
                            <option value="light">Light</option>
                            <option value="system">System</option>
                        </select>
                    </div>

                    {/* API Key */}
                    <div className={styles.field}>
                        <label htmlFor="settingsApiKey">OpenRouter API Key</label>
                        <div className={styles.inputWrapper}>
                            <input
                                id="settingsApiKey"
                                type={showApiKey ? 'text' : 'password'}
                                placeholder="sk-or-v1-..."
                                value={apiKey}
                                onChange={(e) => onApiKeyChange(e.target.value)}
                                className={styles.input}
                            />
                            <button
                                type="button"
                                className={styles.toggleButton}
                                onClick={() => setShowApiKey(!showApiKey)}
                                aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                            >
                                {showApiKey ? (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                        <line x1="1" y1="1" x2="23" y2="23" />
                                    </svg>
                                ) : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                        <circle cx="12" cy="12" r="3" />
                                    </svg>
                                )}
                            </button>
                        </div>
                        <a
                            href="https://openrouter.ai/keys"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.helpLink}
                        >
                            Get your API key from OpenRouter →
                        </a>
                    </div>

                    {/* Model Selection */}
                    <div className={styles.field}>
                        <label htmlFor="settingsModel">AI Model</label>
                        <select
                            id="settingsModel"
                            value={model}
                            onChange={(e) => onModelChange(e.target.value)}
                            className={styles.select}
                        >
                            {AVAILABLE_MODELS.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.name} ({m.provider})
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className={styles.footer}>
                    <p className={styles.note}>
                        Your API key is stored locally in your browser and never sent to our servers.
                    </p>
                </div>
            </div>
        </div>
    );
}

