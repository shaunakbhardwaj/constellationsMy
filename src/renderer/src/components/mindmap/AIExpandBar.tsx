'use client';

import { useRef, useEffect } from 'react';
import { MindmapNode } from '@/lib/parseMarkdown';
import { ThinkingLens } from '@/lib/contracts';
import styles from './AIExpandBar.module.css';

interface AIExpandBarProps {
    node: MindmapNode;
    position: { x: number; y: number };
    onClose: () => void;
    onExpand: (customInstruction: string, lens: ThinkingLens) => void;
    isExpanding?: boolean;
    selectedLens: ThinkingLens;
    onLensChange: (lens: ThinkingLens) => void;
}

const LENSES: Array<{ id: ThinkingLens; label: string }> = [
    { id: 'default', label: 'Expand' },
    { id: 'deep_dive', label: 'Deep Dive' },
    { id: 'questions', label: 'Questions' },
    { id: 'devils_advocate', label: 'Devil’s Advocate' },
];

export default function AIExpandBar({
    node,
    position,
    onClose,
    onExpand,
    isExpanding = false,
    selectedLens,
    onLensChange,
}: AIExpandBarProps) {
    const barRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();

        const handleClickOutside = (e: PointerEvent) => {
            if (barRef.current && !barRef.current.contains(e.target as Node)) onClose();
        };
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        setTimeout(() => {
            document.addEventListener('pointerdown', handleClickOutside, true);
            document.addEventListener('keydown', handleEscape);
        }, 0);

        return () => {
            document.removeEventListener('pointerdown', handleClickOutside, true);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [onClose]);

    const getPosition = () => {
        const barWidth = 360, barHeight = 60, padding = 16;
        let x = position.x - barWidth / 2;
        let y = position.y + 30;
        if (x + barWidth + padding > window.innerWidth) x = window.innerWidth - barWidth - padding;
        if (y + barHeight + padding > window.innerHeight) y = position.y - barHeight - 30;
        return { x: Math.max(padding, x), y: Math.max(padding, y) };
    };

    const pos = getPosition();

    const handleSubmit = () => {
        if (!isExpanding) onExpand(inputRef.current?.value || '', selectedLens);
    };

    return (
        <div ref={barRef} className={`${styles.bar} ${isExpanding ? styles.expanding : ''}`} style={{ left: pos.x, top: pos.y }}>
            <div className={styles.nodeTag}>
                <span className={styles.nodeTitle}>{node.title}</span>
            </div>
            <div className={styles.modesRow}>
                {LENSES.map((lens) => (
                    <button
                        key={lens.id}
                        className={`${styles.modeButton} ${selectedLens === lens.id ? styles.modeButtonActive : ''}`}
                        onClick={() => onLensChange(lens.id)}
                        type="button"
                        disabled={isExpanding}
                    >
                        <span className={styles.modeLabel}>{lens.label}</span>
                    </button>
                ))}
            </div>
            <div className={styles.inputRow}>
                <input
                    ref={inputRef}
                    type="text"
                    className={styles.customInput}
                    placeholder="Guide the AI (optional)..."
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    disabled={isExpanding}
                />
                <button className={styles.expandButton} onClick={handleSubmit} disabled={isExpanding}>
                    {isExpanding ? '...' : 'Run'}
                </button>
            </div>
            {isExpanding && (
                <div className={styles.loadingOverlay}>
                    <span className={styles.spinner} />
                </div>
            )}
        </div>
    );
}
