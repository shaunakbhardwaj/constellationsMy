# Components

Folder layout for renderer UI:

- `home/`: Landing page and entry UI (hero, selectors, etc.).
- `mindmap/`: Canvas, node UI, expand/notes dialogs, and mindmap-specific controls.
- `layout/`: Shared layout wrappers (overlays, shells).
- `settings/`: Settings UI and theme provider.

Guideline: keep feature-specific components in their folder; only promote to `layout/` if reused across features.
