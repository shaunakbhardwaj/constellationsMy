'use client';

import { useState, useRef, useEffect } from 'react';
import { MindmapNode } from '@/lib/parseMarkdown';
import styles from './AIExpandBar.module.css';

export type ExpansionMode = 'standard' | 'deep_dive' | 'devils_advocate' | 'creative' | 'questions';

interface ModeOption {
    id: ExpansionMode;
    emoji: string;
    label: string;
    shortcut: string;
}

const MODES: ModeOption[] = [
    { id: 'standard', emoji: '✨', label: 'Standard', shortcut: '1' },
    { id: 'deep_dive', emoji: '🔬', label: 'Deep', shortcut: '2' },
    { id: 'devils_advocate', emoji: '😈', label: 'Devil', shortcut: '3' },
    { id: 'creative', emoji: '🎨', label: 'Creative', shortcut: '4' },
    { id: 'questions', emoji: '❓', label: 'Questions', shortcut: '5' },
];

interface AIExpandBarProps {
    node: MindmapNode;
    position: { x: number; y: number };
    onClose: () => void;
    onExpand: (mode: ExpansionMode, customInstruction: string) => void;
    isExpanding?: boolean;
}

export default function AIExpandBar({
    node,
    position,
    onClose,
    onExpand,
    isExpanding = false,
}: AIExpandBarProps) {
    const barRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [showInput, setShowInput] = useState(false);
    const [customInstruction, setCustomInstruction] = useState('');

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: PointerEvent) => {
            if (barRef.current && !barRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        // Keyboard shortcuts for modes
        const handleKeyPress = (e: KeyboardEvent) => {
            if (isExpanding) return;

            const modeIndex = parseInt(e.key) - 1;
            if (modeIndex >= 0 && modeIndex < MODES.length) {
                onExpand(MODES[modeIndex].id, customInstruction);
            }
        };

        setTimeout(() => {
            document.addEventListener('pointerdown', handleClickOutside, true);
            document.addEventListener('keydown', handleEscape);
            document.addEventListener('keydown', handleKeyPress);
        }, 0);

        return () => {
            document.removeEventListener('pointerdown', handleClickOutside, true);
            document.removeEventListener('keydown', handleEscape);
            document.removeEventListener('keydown', handleKeyPress);
        };
    }, [onClose, onExpand, customInstruction, isExpanding]);

    // Focus input when shown
    useEffect(() => {
        if (showInput && inputRef.current) {
            inputRef.current.focus();
        }
    }, [showInput]);

    // Calculate position to keep bar in viewport
    const getAdjustedPosition = () => {
        const barWidth = showInput ? 500 : 360;
        const barHeight = showInput ? 90 : 48;
        const padding = 16;

        let x = position.x - barWidth / 2;
        let y = position.y + 30; // Position below the click point

        if (x + barWidth + padding > window.innerWidth) {
            x = window.innerWidth - barWidth - padding;
        }
        if (y + barHeight + padding > window.innerHeight) {
            y = position.y - barHeight - 30; // Position above instead
        }

        x = Math.max(padding, x);
        y = Math.max(padding, y);

        return { x, y };
    };

    const adjustedPosition = getAdjustedPosition();

    const handleModeClick = (mode: ExpansionMode) => {
        if (!isExpanding) {
            onExpand(mode, customInstruction);
        }
    };

    const handleInputKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onExpand('standard', customInstruction);
        }
    };

    return (
        <div
            ref={barRef}
            className={`${styles.bar} ${isExpanding ? styles.expanding : ''}`}
            style={{
                left: adjustedPosition.x,
                top: adjustedPosition.y,
            }}
        >
            <div className={styles.nodeTag}>
                <span className={styles.nodeTitle}>{node.title}</span>
            </div>

            <div className={styles.modesRow}>
                {MODES.map((mode) => (
                    <button
                        key={mode.id}
                        className={styles.modeButton}
                        onClick={() => handleModeClick(mode.id)}
                        disabled={isExpanding}
                        title={`${mode.label} (Press ${mode.shortcut})`}
                    >
                        <span className={styles.modeEmoji}>{mode.emoji}</span>
                        <span className={styles.modeLabel}>{mode.label}</span>
                    </button>
                ))}

                <button
                    className={`${styles.toggleInput} ${showInput ? styles.toggleInputActive : ''}`}
                    onClick={() => setShowInput(!showInput)}
                    disabled={isExpanding}
                    title="Add custom instructions"
                >
                    <span>{showInput ? '−' : '+'}</span>
                </button>
            </div>

            {showInput && (
                <div className={styles.inputRow}>
                    <input
                        ref={inputRef}
                        type="text"
                        className={styles.customInput}
                        placeholder="Custom instructions... (Enter to generate)"
                        value={customInstruction}
                        onChange={(e) => setCustomInstruction(e.target.value)}
                        onKeyDown={handleInputKeyDown}
                        disabled={isExpanding}
                    />
                </div>
            )}

            {isExpanding && (
                <div className={styles.loadingOverlay}>
                    <span className={styles.spinner} />
                    <span>Expanding...</span>
                </div>
            )}
        </div>
    );
}
