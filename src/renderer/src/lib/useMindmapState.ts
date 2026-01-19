'use client';

import { useState, useCallback } from 'react';
import { MindmapNode } from './parseMarkdown';

export interface MindmapState {
    root: MindmapNode | null;
    selectedNodeId: string | null;
    editingNodeId: string | null;
    expandingNodeId: string | null;
    focusedNodeId: string | null;
}

// Helper to generate unique IDs
let nodeIdCounter = 1000;
const generateNodeId = () => `node-${nodeIdCounter++}`;

// Deep clone a node tree
const cloneTree = (node: MindmapNode): MindmapNode => ({
    ...node,
    children: node.children.map(cloneTree),
});

// Find a node by ID in the tree
const findNode = (root: MindmapNode, id: string): MindmapNode | null => {
    if (root.id === id) return root;
    for (const child of root.children) {
        const found = findNode(child, id);
        if (found) return found;
    }
    return null;
};

// Find parent of a node
const findParent = (root: MindmapNode, id: string): MindmapNode | null => {
    for (const child of root.children) {
        if (child.id === id) return root;
        const found = findParent(child, id);
        if (found) return found;
    }
    return null;
};

// Update a node in the tree immutably
const updateNodeInTree = (
    root: MindmapNode,
    id: string,
    updater: (node: MindmapNode) => MindmapNode
): MindmapNode => {
    if (root.id === id) {
        return updater(root);
    }
    return {
        ...root,
        children: root.children.map((child) => updateNodeInTree(child, id, updater)),
    };
};

// Delete a node from the tree immutably
const deleteNodeFromTree = (root: MindmapNode, id: string): MindmapNode => {
    return {
        ...root,
        children: root.children
            .filter((child) => child.id !== id)
            .map((child) => deleteNodeFromTree(child, id)),
    };
};

// Set color on node and all descendants
const setColorRecursive = (node: MindmapNode, color: string): MindmapNode => ({
    ...node,
    branchColor: color,
    children: node.children.map((child) => setColorRecursive(child, color)),
});

// Check if a node is an ancestor of another node
const isAncestor = (root: MindmapNode, ancestorId: string, descendantId: string): boolean => {
    const ancestor = findNode(root, ancestorId);
    if (!ancestor) return false;
    return findNode(ancestor, descendantId) !== null && ancestorId !== descendantId;
};

// Get all ancestor IDs of a node
const getAncestorIds = (root: MindmapNode, nodeId: string): string[] => {
    const ancestors: string[] = [];
    let current = findParent(root, nodeId);
    while (current) {
        ancestors.push(current.id);
        current = findParent(root, current.id);
    }
    return ancestors;
};

export function useMindmapState(initialData: MindmapNode | null) {
    const [root, setRoot] = useState<MindmapNode | null>(initialData ? cloneTree(initialData) : null);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
    const [expandingNodeId, setExpandingNodeId] = useState<string | null>(null);
    const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

    // Reset state with new data
    const setData = useCallback((data: MindmapNode | null) => {
        setRoot(data ? cloneTree(data) : null);
        setSelectedNodeId(null);
        setEditingNodeId(null);
        setExpandingNodeId(null);
        setFocusedNodeId(null);
    }, []);

    // Add child node
    const addChild = useCallback((parentId: string, title: string = 'New Branch'): MindmapNode | null => {
        if (!root) return null;

        const parent = findNode(root, parentId);
        if (!parent) return null;

        const newNode: MindmapNode = {
            id: generateNodeId(),
            title,
            level: parent.level + 1,
            children: [],
            branchColor: parent.branchColor, // Inherit parent color
        };

        setRoot((prevRoot) => {
            if (!prevRoot) return null;
            return updateNodeInTree(prevRoot, parentId, (node) => ({
                ...node,
                children: [...node.children, newNode],
            }));
        });

        return newNode;
    }, [root]);

    // Update node properties
    const updateNode = useCallback((nodeId: string, updates: Partial<MindmapNode>) => {
        setRoot((prevRoot) => {
            if (!prevRoot) return null;
            return updateNodeInTree(prevRoot, nodeId, (node) => ({
                ...node,
                ...updates,
            }));
        });
    }, []);

    // Delete a node
    const deleteNode = useCallback((nodeId: string) => {
        if (!root) return;

        // Cannot delete root
        if (root.id === nodeId) return;

        setRoot((prevRoot) => {
            if (!prevRoot) return null;
            return deleteNodeFromTree(prevRoot, nodeId);
        });

        // Clear selection if deleted node was selected
        if (selectedNodeId === nodeId) {
            setSelectedNodeId(null);
        }
    }, [root, selectedNodeId]);

    // Set color for node and descendants
    const setNodeColor = useCallback((nodeId: string, color: string) => {
        setRoot((prevRoot) => {
            if (!prevRoot) return null;
            return updateNodeInTree(prevRoot, nodeId, (node) => setColorRecursive(node, color));
        });
    }, []);

    // Reset node style (remove custom color)
    const resetNodeStyle = useCallback((nodeId: string) => {
        if (!root) return;

        // Find parent to get inherited color
        const parent = findParent(root, nodeId);
        const inheritedColor = parent?.branchColor;

        setRoot((prevRoot) => {
            if (!prevRoot) return null;
            return updateNodeInTree(prevRoot, nodeId, (node) => ({
                ...node,
                branchColor: inheritedColor,
            }));
        });
    }, [root]);

    // Set notes for a node
    const setNodeNotes = useCallback((nodeId: string, notes: string) => {
        setRoot((prevRoot) => {
            if (!prevRoot) return null;
            return updateNodeInTree(prevRoot, nodeId, (node) => ({
                ...node,
                notes: notes || undefined, // Remove if empty
            }));
        });
    }, []);

    // Expand node with new children (from AI)
    const expandNode = useCallback((nodeId: string, newChildren: MindmapNode[]) => {
        setRoot((prevRoot) => {
            if (!prevRoot) return null;
            const parent = findNode(prevRoot, nodeId);
            if (!parent) return prevRoot;

            // Ensure children have correct levels and inherit parent color
            const processedChildren = newChildren.map((child, index) => ({
                ...child,
                id: generateNodeId(),
                level: parent.level + 1,
                branchColor: parent.branchColor,
                children: child.children.map((grandchild, gIndex) => ({
                    ...grandchild,
                    id: generateNodeId(),
                    level: parent.level + 2,
                    branchColor: parent.branchColor,
                })),
            }));

            return updateNodeInTree(prevRoot, nodeId, (node) => ({
                ...node,
                children: [...node.children, ...processedChildren],
            }));
        });
    }, []);

    // Get node by ID
    const getNode = useCallback((nodeId: string): MindmapNode | null => {
        if (!root) return null;
        return findNode(root, nodeId);
    }, [root]);

    // Get path from root to node (for context)
    const getNodePath = useCallback((nodeId: string): string => {
        if (!root) return '';

        const path: string[] = [];
        const buildPath = (node: MindmapNode, target: string): boolean => {
            if (node.id === target) {
                path.push(node.title);
                return true;
            }
            for (const child of node.children) {
                if (buildPath(child, target)) {
                    path.unshift(node.title);
                    return true;
                }
            }
            return false;
        };

        buildPath(root, nodeId);
        return path.join(' > ');
    }, [root]);

    // Count descendants
    const getDescendantCount = useCallback((nodeId: string): number => {
        const node = root ? findNode(root, nodeId) : null;
        if (!node) return 0;

        const count = (n: MindmapNode): number => {
            return n.children.reduce((sum, child) => sum + 1 + count(child), 0);
        };

        return count(node);
    }, [root]);

    // Toggle collapse state of a node
    const toggleCollapse = useCallback((nodeId: string) => {
        setRoot((prevRoot) => {
            if (!prevRoot) return null;
            return updateNodeInTree(prevRoot, nodeId, (node) => ({
                ...node,
                collapsed: !node.collapsed,
            }));
        });
    }, []);

    // Collapse all sibling nodes (for smart auto-collapse on AI expand)
    const collapseSiblings = useCallback((nodeId: string) => {
        if (!root) return;

        const parent = findParent(root, nodeId);
        if (!parent) return;

        setRoot((prevRoot) => {
            if (!prevRoot) return null;
            let updated = prevRoot;
            for (const sibling of parent.children) {
                if (sibling.id !== nodeId && sibling.children.length > 0) {
                    updated = updateNodeInTree(updated, sibling.id, (node) => ({
                        ...node,
                        collapsed: true,
                    }));
                }
            }
            return updated;
        });
    }, [root]);

    // Check if a node is in focus (part of the focused branch or its ancestors)
    const isNodeInFocus = useCallback((nodeId: string): boolean => {
        if (!focusedNodeId || !root) return true; // No focus means all visible

        // Check if this node is the focused node
        if (nodeId === focusedNodeId) return true;

        // Check if this node is an ancestor of the focused node
        const ancestors = getAncestorIds(root, focusedNodeId);
        if (ancestors.includes(nodeId)) return true;

        // Check if this node is a descendant of the focused node
        if (isAncestor(root, focusedNodeId, nodeId)) return true;

        return false;
    }, [focusedNodeId, root]);

    // Get main branch ID for a node (the direct child of root that this node belongs to)
    const getMainBranchId = useCallback((nodeId: string): string | null => {
        if (!root) return null;
        if (root.id === nodeId) return null;

        const ancestors = getAncestorIds(root, nodeId);
        // The last ancestor before root is the main branch
        if (ancestors.length >= 1) {
            // ancestors[0] is immediate parent, last one is root
            // We want the child of root - which is second to last (or first if only root is parent)
            if (ancestors[ancestors.length - 1] === root.id && ancestors.length > 1) {
                return ancestors[ancestors.length - 2];
            } else if (ancestors.length === 1 && ancestors[0] === root.id) {
                return nodeId; // This node IS a main branch
            }
        }
        return null;
    }, [root]);

    return {
        // State
        root,
        selectedNodeId,
        editingNodeId,
        expandingNodeId,
        focusedNodeId,

        // Setters
        setData,
        setSelectedNodeId,
        setEditingNodeId,
        setExpandingNodeId,
        setFocusedNodeId,

        // CRUD Operations
        addChild,
        updateNode,
        deleteNode,

        // Color Operations
        setNodeColor,
        resetNodeStyle,

        // Notes
        setNodeNotes,

        // AI Expand
        expandNode,

        // Collapse
        toggleCollapse,
        collapseSiblings,

        // Focus
        isNodeInFocus,
        getMainBranchId,

        // Helpers
        getNode,
        getNodePath,
        getDescendantCount,
    };
}
