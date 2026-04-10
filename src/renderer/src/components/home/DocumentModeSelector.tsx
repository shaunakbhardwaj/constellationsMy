'use client';

import type { DocumentMode } from '@/lib/documentModes';
import styles from './DocumentModeSelector.module.css';

interface DocumentModeSelectorProps {
    mode: DocumentMode;
    onChange: (mode: DocumentMode) => void;
}

const MODES: { id: DocumentMode; label: string }[] = [
    { id: 'extract', label: 'Extract' },
    { id: 'brainstorm', label: 'Brainstorm' },
    { id: 'flow', label: 'Flow' },
];

export default function DocumentModeSelector({ mode, onChange }: DocumentModeSelectorProps) {
    return (
        <div className={styles.selector}>
            {MODES.map((m) => (
                <button
                    key={m.id}
                    className={`${styles.modeButton} ${mode === m.id ? styles.active : ''}`}
                    onClick={() => onChange(m.id)}
                >
                    {m.label}
                </button>
            ))}
        </div>
    );
}
