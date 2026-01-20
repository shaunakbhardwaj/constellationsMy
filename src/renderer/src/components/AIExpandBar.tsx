'use client';

import { useRef, useEffect } from 'react';
import { MindmapNode } from '@/lib/parseMarkdown';
import styles from './AIExpandBar.module.css';

interface AIExpandBarProps {
    node: MindmapNode;
    position: { x: number; y: number };
    onClose: () => void;
    onExpand: (customInstruction: string) => void;
    isExpanding?: boolean;
}

export default function AIExpandBar({ node, position, onClose, onExpand, isExpanding = false }: AIExpandBarProps) {
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
        if (!isExpanding) onExpand(inputRef.current?.value || '');
    };

    return (
        <div ref={barRef} className={`${styles.bar} ${isExpanding ? styles.expanding : ''}`} style={{ left: pos.x, top: pos.y }}>
            <div className={styles.nodeTag}>
                <span className={styles.nodeTitle}>{node.title}</span>
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
                    {isExpanding ? '...' : '✨ Expand'}
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
