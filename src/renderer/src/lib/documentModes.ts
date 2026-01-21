export type DocumentMode = 'extract' | 'brainstorm' | 'flow';

// Mode-specific color palettes for branch colors
export const MODE_PALETTES: Record<DocumentMode, string[]> = {
  extract: ['#94a3b8', '#64748b', '#475569', '#334155', '#1e293b'], // Slate blues
  brainstorm: ['#f472b6', '#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#fb7185', '#818cf8', '#2dd4bf'], // Rainbow
  flow: ['#22d3ee', '#06b6d4', '#0891b2', '#0e7490', '#155e75', '#164e63'], // Teal gradient
};

// Mode-specific root node colors
export const MODE_ROOT_COLORS: Record<DocumentMode, string> = {
  extract: '#475569', // Slate
  brainstorm: '#8b5cf6', // Purple
  flow: '#0891b2', // Cyan
};
