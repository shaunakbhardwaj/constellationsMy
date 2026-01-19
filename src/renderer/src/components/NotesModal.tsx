'use client';

import { useState, useEffect, useRef } from 'react';
import { MindmapNode } from '@/lib/parseMarkdown';
import styles from './NotesModal.module.css';

interface NotesModalProps {
    node: MindmapNode;
    onSave: (notes: string) => void;
    onClose: () => void;
}

export default function NotesModal({ node, onSave, onClose }: NotesModalProps) {
    const [notes, setNotes] = useState(node.notes || '');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Focus textarea on mount
    useEffect(() => {
        textareaRef.current?.focus();
    }, []);

    // Handle keyboard shortcuts
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSave();
        }
        if (e.key === 'Escape') {
            onClose();
        }
    };

    const handleSave = () => {
        onSave(notes.trim());
        onClose();
    };

    // Close on backdrop click
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className={styles.backdrop} onClick={handleBackdropClick}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h2 className={styles.title}>
                        Notes for "{node.title}"
                    </h2>
                    <button className={styles.closeButton} onClick={onClose}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div className={styles.content}>
                    <textarea
                        ref={textareaRef}
                        className={styles.textarea}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Add notes for this node..."
                        maxLength={2000}
                    />
                    <div className={styles.charCount}>
                        {notes.length} / 2000
                    </div>
                </div>

                <div className={styles.footer}>
                    <span className={styles.hint}>
                        <kbd>⌘</kbd> + <kbd>Enter</kbd> to save
                    </span>
                    <div className={styles.actions}>
                        <button className={styles.cancelButton} onClick={onClose}>
                            Cancel
                        </button>
                        <button className={styles.saveButton} onClick={handleSave}>
                            Save Notes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
