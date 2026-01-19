'use client';

import { useEffect } from 'react';
import { MindmapNode } from '@/lib/parseMarkdown';
import styles from './DeleteConfirmDialog.module.css';

interface DeleteConfirmDialogProps {
    node: MindmapNode;
    descendantCount: number;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function DeleteConfirmDialog({
    node,
    descendantCount,
    onConfirm,
    onCancel,
}: DeleteConfirmDialogProps) {
    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCancel();
            }
            if (e.key === 'Enter') {
                onConfirm();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onConfirm, onCancel]);

    // Close on backdrop click
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onCancel();
        }
    };

    return (
        <div className={styles.backdrop} onClick={handleBackdropClick}>
            <div className={styles.dialog}>
                <div className={styles.icon}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                </div>

                <h2 className={styles.title}>Delete Node?</h2>

                <p className={styles.message}>
                    Are you sure you want to delete <strong>"{node.title}"</strong>
                    {descendantCount > 0 && (
                        <>
                            {' '}and <strong>{descendantCount} child node{descendantCount !== 1 ? 's' : ''}</strong>
                        </>
                    )}
                    ?
                </p>

                <p className={styles.warning}>
                    This action cannot be undone.
                </p>

                <div className={styles.actions}>
                    <button className={styles.cancelButton} onClick={onCancel}>
                        Cancel
                    </button>
                    <button className={styles.deleteButton} onClick={onConfirm}>
                        Delete{descendantCount > 0 ? ' All' : ''}
                    </button>
                </div>
            </div>
        </div>
    );
}
