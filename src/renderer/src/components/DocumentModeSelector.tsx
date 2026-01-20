'use client';

import styles from './DocumentModeSelector.module.css';

export type DocumentMode = 'extract' | 'brainstorm' | 'flow';

// Mode-specific color palettes for branch colors
export const MODE_PALETTES: Record<DocumentMode, string[]> = {
    extract: ['#94a3b8', '#64748b', '#475569', '#334155', '#1e293b'], // Slate blues
    brainstorm: ['#f472b6', '#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#fb7185', '#818cf8', '#2dd4bf'], // Rainbow
    flow: ['#22d3ee', '#06b6d4', '#0891b2', '#0e7490', '#155e75', '#164e63'], // Teal gradient
};

// Mode-specific root node colors
export const MODE_ROOT_COLORS: Record<DocumentMode, string> = {
    extract: '#475569',   // Slate
    brainstorm: '#8b5cf6', // Purple
    flow: '#0891b2',       // Cyan
};

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
