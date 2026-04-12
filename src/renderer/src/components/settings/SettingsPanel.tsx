"use client";

import { useState, useEffect, useRef } from "react";
import type { AiProvider } from "@/lib/contracts";
import { AVAILABLE_MODELS, OLLAMA_MODELS } from "@/lib/openrouter";
import { useTheme } from "./ThemeProvider";
import styles from "./SettingsPanel.module.css";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  provider: AiProvider;
  onProviderChange: (provider: AiProvider) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  openRouterModel: string;
  onOpenRouterModelChange: (model: string) => void;
  ollamaModel: string;
  onOllamaModelChange: (model: string) => void;
  ollamaBaseUrl: string;
  onOllamaBaseUrlChange: (value: string) => void;
  ollamaModels: string[];
  ollamaStatus: "idle" | "loading" | "ok" | "error";
  ollamaError: string | null;
  onRefreshOllamaModels: () => void;
}

export default function SettingsPanel({
  isOpen,
  onClose,
  provider,
  onProviderChange,
  apiKey,
  onApiKeyChange,
  openRouterModel,
  onOpenRouterModelChange,
  ollamaModel,
  onOllamaModelChange,
  ollamaBaseUrl,
  onOllamaBaseUrlChange,
  ollamaModels,
  ollamaStatus,
  ollamaError,
  onRefreshOllamaModels,
}: SettingsPanelProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div ref={panelRef} className={styles.panel}>
        <div className={styles.header}>
          <h2>Settings</h2>
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close settings"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
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
              onChange={(e) =>
                setTheme(e.target.value as "light" | "dark" | "system")
              }
              className={styles.select}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="settingsProvider">Model Provider</label>
            <select
              id="settingsProvider"
              value={provider}
              onChange={(e) => onProviderChange(e.target.value as AiProvider)}
              className={styles.select}
            >
              <option value="ollama">Ollama Local</option>
              <option value="openrouter">OpenRouter API</option>
            </select>
            <p className={styles.helpText}>
              Ollama runs locally and does not require an API key. OpenRouter
              stays available for hosted models.
            </p>
          </div>

          {provider === "ollama" && (
            <>
              <div className={styles.field}>
                <label htmlFor="settingsOllamaBaseUrl">Ollama URL</label>
                <div className={styles.inputWrapper}>
                  <input
                    id="settingsOllamaBaseUrl"
                    type="text"
                    placeholder="http://localhost:11434"
                    value={ollamaBaseUrl}
                    onChange={(e) => onOllamaBaseUrlChange(e.target.value)}
                    className={styles.input}
                  />
                </div>
                <button
                  type="button"
                  className={styles.inlineButton}
                  onClick={onRefreshOllamaModels}
                  disabled={ollamaStatus === "loading"}
                >
                  {ollamaStatus === "loading"
                    ? "Checking Ollama..."
                    : "Refresh Local Models"}
                </button>
                {ollamaError && (
                  <p className={styles.errorText}>{ollamaError}</p>
                )}
              </div>

              <div className={styles.field}>
                <label htmlFor="settingsOllamaModel">Local Model</label>
                <input
                  id="settingsOllamaModel"
                  list="settingsOllamaModels"
                  value={ollamaModel}
                  onChange={(e) => onOllamaModelChange(e.target.value)}
                  className={styles.input}
                  placeholder="gpt-oss:20b"
                />
                <datalist id="settingsOllamaModels">
                  {[
                    ...new Set([
                      ...ollamaModels,
                      ...OLLAMA_MODELS.map((m) => m.id),
                    ]),
                  ].map((id) => (
                    <option key={id} value={id} />
                  ))}
                </datalist>
              </div>
            </>
          )}

          {provider === "openrouter" && (
            <>
              {/* API Key */}
              <div className={styles.field}>
                <label htmlFor="settingsApiKey">OpenRouter API Key</label>
                <div className={styles.inputWrapper}>
                  <input
                    id="settingsApiKey"
                    type={showApiKey ? "text" : "password"}
                    placeholder="sk-or-v1-..."
                    value={apiKey}
                    onChange={(e) => onApiKeyChange(e.target.value)}
                    className={styles.input}
                  />
                  <button
                    type="button"
                    className={styles.toggleButton}
                    onClick={() => setShowApiKey(!showApiKey)}
                    aria-label={showApiKey ? "Hide API key" : "Show API key"}
                  >
                    {showApiKey ? (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
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
                  value={openRouterModel}
                  onChange={(e) => onOpenRouterModelChange(e.target.value)}
                  className={styles.select}
                >
                  {AVAILABLE_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.provider})
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        <div className={styles.footer}>
          <p className={styles.note}>
            Settings are stored locally on this device. OpenRouter keys are only
            used for OpenRouter requests.
          </p>
        </div>
      </div>
    </div>
  );
}
