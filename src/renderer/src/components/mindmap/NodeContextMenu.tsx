"use client";

import { useEffect, useRef } from "react";
import { MindmapNode } from "@/lib/parseMarkdown";
import styles from "./NodeContextMenu.module.css";

// Menu colors matching the reference image
const MENU_COLORS = [
  "#FF8C42", // Orange
  "#4ECB71", // Green
  "#3B82F6", // Blue
  "#EC4899", // Pink
  "#14B8A6", // Teal
  "#F59E0B", // Amber
  "#8B5CF6", // Purple
  "#06B6D4", // Cyan
];

interface NodeContextMenuProps {
  node: MindmapNode;
  position: { x: number; y: number };
  isRoot: boolean;
  onClose: () => void;
  onColorChange: (color: string) => void;
  onAddBranch: () => void;
  onViewDetails: () => void;
  onAddNotes: () => void;
  onOpenAIExpand: () => void; // Changed: now opens modal instead of triggering directly
  onEditNode: () => void;
  onRemoveStyles: () => void;
  onDeleteNode: () => void;
}

export default function NodeContextMenu({
  node,
  position,
  isRoot,
  onClose,
  onColorChange,
  onAddBranch,
  onViewDetails,
  onAddNotes,
  onOpenAIExpand,
  onEditNode,
  onRemoveStyles,
  onDeleteNode,
}: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    // Use setTimeout to avoid closing immediately on the click that opened it
    setTimeout(() => {
      document.addEventListener("pointerdown", handleClickOutside, true);
      document.addEventListener("keydown", handleEscape);
    }, 0);

    return () => {
      document.removeEventListener("pointerdown", handleClickOutside, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // Calculate position to keep menu in viewport
  const getAdjustedPosition = () => {
    const menuWidth = 220;
    const menuHeight = 390;
    const padding = 16;

    let x = position.x;
    let y = position.y;

    // Adjust X if too close to right edge
    if (x + menuWidth + padding > window.innerWidth) {
      x = window.innerWidth - menuWidth - padding;
    }

    // Adjust Y if too close to bottom edge
    if (y + menuHeight + padding > window.innerHeight) {
      y = window.innerHeight - menuHeight - padding;
    }

    // Ensure minimum positions
    x = Math.max(padding, x);
    y = Math.max(padding, y);

    return { x, y };
  };

  const adjustedPosition = getAdjustedPosition();

  return (
    <div
      ref={menuRef}
      className={styles.menu}
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
    >
      {/* Color picker row */}
      <div className={styles.colorRow}>
        {MENU_COLORS.map((color) => (
          <button
            key={color}
            className={styles.colorButton}
            style={{ backgroundColor: color }}
            onClick={() => onColorChange(color)}
            title={`Set color to ${color}`}
          />
        ))}
      </div>

      <div className={styles.divider} />

      {/* Menu items */}
      <button className={styles.menuItem} onClick={onAddBranch}>
        <span className={styles.menuIcon}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </span>
        <span className={styles.menuLabel}>Add Branch</span>
        <span className={styles.shortcut}>A</span>
      </button>

      <button className={styles.menuItem} onClick={onAddNotes}>
        <span className={styles.menuIcon}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="10" x2="20" y2="10" />
            <line x1="4" y1="14" x2="16" y2="14" />
          </svg>
        </span>
        <span className={styles.menuLabel}>Add Notes</span>
        {node.notes && <span className={styles.badge}>✓</span>}
      </button>

      <button className={styles.menuItem} onClick={onViewDetails}>
        <span className={styles.menuIcon}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 1 4 17.5" />
            <path d="M8 7h8" />
            <path d="M8 11h8" />
          </svg>
        </span>
        <span className={styles.menuLabel}>View Details</span>
      </button>

      <button className={styles.menuItem} onClick={onOpenAIExpand}>
        <span className={styles.menuIcon}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 3L14.5 8.5L20 9.5L16 14L17 20L12 17L7 20L8 14L4 9.5L9.5 8.5L12 3Z" />
          </svg>
        </span>
        <span className={styles.menuLabel}>AI Expand</span>
        <span className={styles.shortcut}>X</span>
      </button>

      <div className={styles.divider} />

      <button className={styles.menuItem} onClick={onEditNode}>
        <span className={styles.menuIcon}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </span>
        <span className={styles.menuLabel}>Edit Node</span>
        <span className={styles.shortcut}>E</span>
      </button>

      <button className={styles.menuItem} onClick={onRemoveStyles}>
        <span className={styles.menuIcon}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M4 7V4h16v3" />
            <path d="M9 20h6" />
            <path d="M12 4v16" />
            <line x1="4" y1="4" x2="20" y2="20" strokeWidth="2.5" />
          </svg>
        </span>
        <span className={styles.menuLabel}>Remove Styles</span>
      </button>

      <div className={styles.divider} />

      <button
        className={`${styles.menuItem} ${styles.deleteItem} ${isRoot ? styles.disabled : ""}`}
        onClick={isRoot ? undefined : onDeleteNode}
        disabled={isRoot}
        title={isRoot ? "Cannot delete root node" : "Delete this node"}
      >
        <span className={styles.menuIcon}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </span>
        <span className={styles.menuLabel}>Delete Node</span>
      </button>
    </div>
  );
}
