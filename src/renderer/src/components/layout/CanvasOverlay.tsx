'use client';

import { useEffect, useCallback, ReactNode } from 'react';
import styles from './CanvasOverlay.module.css';

interface CanvasOverlayProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    onExport?: () => void;
    saveStatus?: 'idle' | 'saving' | 'saved' | 'error';
}

export default function CanvasOverlay({
    isOpen,
    onClose,
    title,
    children,
    onExport,
    saveStatus = 'idle',
}: CanvasOverlayProps) {
    // Handle keyboard shortcuts
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 's' && onExport) {
                e.preventDefault();
                onExport();
            }
        },
        [onClose, onExport]
    );

    useEffect(() => {
        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [isOpen, handleKeyDown]);

    if (!isOpen) return null;

    return (
        <div className={styles.overlay}>
            {/* Dotted grid background */}
            <div className={styles.gridBackground} />

            {/* Header */}
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <button className={styles.closeButton} onClick={onClose} title="Close (Esc)">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                    <h1 className={styles.title}>{title}</h1>
                </div>

                <div className={styles.headerRight}>
                    {saveStatus !== 'idle' && (
                        <div
                            className={`${styles.saveBadge} ${
                                saveStatus === 'saving'
                                    ? styles.saveBadgeSaving
                                    : saveStatus === 'saved'
                                        ? styles.saveBadgeSaved
                                        : styles.saveBadgeError
                            }`}
                            aria-live="polite"
                        >
                            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : 'Save failed'}
                        </div>
                    )}
                    <div className={styles.hint}>
                        <kbd>Esc</kbd> Close
                        {onExport && (
                            <>
                                <span className={styles.separator}>•</span>
                                <kbd>⌘S</kbd> Export
                            </>
                        )}
                    </div>
                    {onExport && (
                        <button className={styles.exportButton} onClick={onExport}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            Export PNG
                        </button>
                    )}
                </div>
            </header>

            {/* Canvas content */}
            <div className={styles.content}>
                {children}
            </div>

            {/* Footer hint */}
            <div className={styles.footer}>
                <span>🖱️ Scroll to zoom</span>
                <span>•</span>
                <span>✋ Drag to pan</span>
                <span>•</span>
                <span>👆 Click node for options</span>
            </div>
        </div>
    );
}
