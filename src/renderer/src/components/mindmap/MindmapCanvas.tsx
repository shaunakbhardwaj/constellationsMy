'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { MindmapNode } from '@/lib/parseMarkdown';
import styles from './MindmapCanvas.module.css';

// Max children per side before alternating
const MAX_PER_SIDE = 3;
const HORIZONTAL_GAP = 70;
const VERTICAL_GAP = 24;
const DEFAULT_PALETTE = ['#f97316', '#f43f5e', '#8b5cf6', '#0ea5e9', '#14b8a6', '#84cc16', '#eab308'];
const ROOT_COLOR = '#0f172a';

const NODE_STYLES = {
    root: {
        maxWidth: 320,
        minWidth: 140,
        fontSize: 16,
        lineHeight: 20,
        paddingX: 24,
        paddingY: 10,
        charWidth: 8.5,
        fontWeight: 600,
    },
    branch: {
        maxWidth: 220,
        minWidth: 90,
        fontSize: 12,
        lineHeight: 16,
        paddingX: 14,
        paddingY: 8,
        charWidth: 6.5,
        fontWeight: 500,
    },
};

const animatedViews = new Set<number>();

interface NodeMetrics {
    width: number;
    height: number;
    lines: string[];
    lineHeight: number;
    fontSize: number;
    fontWeight: number;
    paddingX: number;
    paddingY: number;
}

const wrapText = (text: string, maxChars: number): string[] => {
    const trimmed = text.trim();
    if (!trimmed) return [''];

    const words = trimmed.split(/\s+/);
    const lines: string[] = [];
    let current = '';

    const pushCurrent = () => {
        if (current) {
            lines.push(current);
            current = '';
        }
    };

    words.forEach((word) => {
        if (word.length > maxChars) {
            pushCurrent();
            for (let i = 0; i < word.length; i += maxChars) {
                lines.push(word.slice(i, i + maxChars));
            }
            return;
        }

        const next = current ? `${current} ${word}` : word;
        if (next.length <= maxChars) {
            current = next;
        } else {
            pushCurrent();
            current = word;
        }
    });

    pushCurrent();
    return lines.length ? lines : [''];
};

const buildNodeMetrics = (text: string, depth: number): NodeMetrics => {
    const style = depth === 0 ? NODE_STYLES.root : NODE_STYLES.branch;
    const maxChars = Math.max(8, Math.floor((style.maxWidth - style.paddingX * 2) / style.charWidth));
    const lines = wrapText(text, maxChars);
    const maxLineLength = Math.max(...lines.map((line) => line.length), 0);
    const textWidth = maxLineLength * style.charWidth;
    const width = Math.max(style.minWidth, Math.min(style.maxWidth, textWidth + style.paddingX * 2));
    const height = lines.length * style.lineHeight + style.paddingY * 2;

    return {
        width,
        height,
        lines,
        lineHeight: style.lineHeight,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        paddingX: style.paddingX,
        paddingY: style.paddingY,
    };
};

interface MindmapCanvasProps {
    data: MindmapNode;
    viewKey?: number;
    selectedNodeId?: string | null;
    selectedNodeIds?: string[];
    selectionMode?: boolean;
    editingNodeId?: string | null;
    expandingNodeId?: string | null;
    focusedNodeId?: string | null;
    onNodeClick?: (node: MindmapNode, position: { x: number; y: number }) => void;
    onNodeTitleChange?: (nodeId: string, newTitle: string) => void;
    onEditComplete?: () => void;
    onToggleCollapse?: (nodeId: string) => void;
    onNodeDoubleClick?: (nodeId: string) => void;
    isNodeInFocus?: (nodeId: string) => boolean;
    onExport?: () => void;
}

interface LayoutNode {
    data: MindmapNode;
    x: number;
    y: number;
    depth: number;
    branchColor: string;
    isLeft: boolean;
    mainBranchIndex: number;
    parent?: LayoutNode;
    children: LayoutNode[];
    width: number;
    height: number;
    lines: string[];
    lineHeight: number;
    fontSize: number;
    fontWeight: number;
    paddingX: number;
    paddingY: number;
}

export default function MindmapCanvas({
    data,
    viewKey,
    selectedNodeId,
    selectedNodeIds = [],
    selectionMode = false,
    editingNodeId,
    expandingNodeId,
    focusedNodeId: _focusedNodeId,
    onNodeClick,
    onNodeTitleChange,
    onEditComplete,
    onToggleCollapse,
    onNodeDoubleClick,
    isNodeInFocus,
}: MindmapCanvasProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const minimapRef = useRef<SVGSVGElement>(null);
    const [editValue, setEditValue] = useState('');
    const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
    const zoomTransformRef = useRef<d3.ZoomTransform | null>(null);
    const shouldAutoFitRef = useRef(true);
    const hasAnimatedRef = useRef(false);
    // Store layout nodes for zoom-to-node functionality
    const layoutNodesRef = useRef<LayoutNode[]>([]);
    const lastViewKeyRef = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (viewKey === undefined) return;
        if (lastViewKeyRef.current === viewKey) return;
        lastViewKeyRef.current = viewKey;
        shouldAutoFitRef.current = true;
        zoomTransformRef.current = null;
        hasAnimatedRef.current = animatedViews.has(viewKey);
    }, [viewKey]);

    // Custom bilateral layout algorithm
    const createBilateralLayout = useCallback((
        root: MindmapNode,
        centerX: number,
        centerY: number,
        metricsById: Map<string, NodeMetrics>
    ): LayoutNode[] => {
        const nodes: LayoutNode[] = [];

        const getMetrics = (node: MindmapNode, depth: number) => {
            return metricsById.get(node.id) ?? buildNodeMetrics(node.title, depth);
        };

        // Helper to calculate subtree height
        const getSubtreeHeight = (node: MindmapNode, depth: number): number => {
            const metrics = getMetrics(node, depth);
            if (node.collapsed || node.children.length === 0) return metrics.height;

            const childHeights = node.children.map((child) => getSubtreeHeight(child, depth + 1));
            const totalChildHeight = childHeights.reduce((sum, h) => sum + h, 0)
                + Math.max(0, childHeights.length - 1) * VERTICAL_GAP;

            return Math.max(metrics.height, totalChildHeight);
        };

        // Build layout recursively
        const layoutNode = (
            node: MindmapNode,
            x: number,
            y: number,
            depth: number,
            isLeft: boolean,
            mainBranchIndex: number,
            branchColor: string,
            parent?: LayoutNode
        ): LayoutNode => {
            const metrics = getMetrics(node, depth);
            const layoutNode_: LayoutNode = {
                data: node,
                x,
                y,
                depth,
                branchColor: node.branchColor || branchColor,
                isLeft,
                mainBranchIndex,
                parent,
                children: [],
                width: metrics.width,
                height: metrics.height,
                lines: metrics.lines,
                lineHeight: metrics.lineHeight,
                fontSize: metrics.fontSize,
                fontWeight: metrics.fontWeight,
                paddingX: metrics.paddingX,
                paddingY: metrics.paddingY,
            };
            nodes.push(layoutNode_);

            // If collapsed, don't layout children
            if (node.collapsed) return layoutNode_;

            // Layout children
            const childrenCount = node.children.length;
            if (childrenCount === 0) return layoutNode_;

            // Calculate total height needed for all children
            const childHeights = node.children.map((child) => getSubtreeHeight(child, depth + 1));
            const totalHeight = childHeights.reduce((a, b) => a + b, 0)
                + Math.max(0, childHeights.length - 1) * VERTICAL_GAP;
            let currentY = y - totalHeight / 2;

            node.children.forEach((child, i) => {
                const childHeight = childHeights[i];
                const childY = currentY + childHeight / 2;
                const childMetrics = getMetrics(child, depth + 1);
                const childX = isLeft
                    ? x - (metrics.width / 2 + childMetrics.width / 2 + HORIZONTAL_GAP)
                    : x + (metrics.width / 2 + childMetrics.width / 2 + HORIZONTAL_GAP);

                const childLayout = layoutNode(
                    child,
                    childX,
                    childY,
                    depth + 1,
                    isLeft,
                    mainBranchIndex,
                    layoutNode_.branchColor,
                    layoutNode_
                );
                layoutNode_.children.push(childLayout);

                currentY += childHeight + VERTICAL_GAP;
            });

            return layoutNode_;
        };

        const rootMetrics = getMetrics(root, 0);

        // Layout root at center
        const rootLayout: LayoutNode = {
            data: root,
            x: centerX,
            y: centerY,
            depth: 0,
            branchColor: ROOT_COLOR,
            isLeft: false,
            mainBranchIndex: -1,
            children: [],
            width: rootMetrics.width,
            height: rootMetrics.height,
            lines: rootMetrics.lines,
            lineHeight: rootMetrics.lineHeight,
            fontSize: rootMetrics.fontSize,
            fontWeight: rootMetrics.fontWeight,
            paddingX: rootMetrics.paddingX,
            paddingY: rootMetrics.paddingY,
        };
        nodes.push(rootLayout);

        // Distribute main branches: alternating left/right with max 3 per side
        if (!root.collapsed) {
            const mainChildren = root.children;
            let leftCount = 0;
            let rightCount = 0;
            const leftChildren: { node: MindmapNode; idx: number }[] = [];
            const rightChildren: { node: MindmapNode; idx: number }[] = [];

            mainChildren.forEach((child, idx) => {
                // Alternate sides, but max 3 per side before forced switch
                if (rightCount < MAX_PER_SIDE && (idx % 2 === 0 || leftCount >= MAX_PER_SIDE)) {
                    rightChildren.push({ node: child, idx });
                    rightCount++;
                } else {
                    leftChildren.push({ node: child, idx });
                    leftCount++;
                }
            });

            // Layout right side children
            const rightHeights = rightChildren.map((child) => getSubtreeHeight(child.node, 1));
            const rightTotalHeight = rightHeights.reduce((a, b) => a + b, 0)
                + Math.max(0, rightHeights.length - 1) * VERTICAL_GAP;
            let rightY = centerY - rightTotalHeight / 2;

            rightChildren.forEach((item, i) => {
                const childY = rightY + rightHeights[i] / 2;
                const childMetrics = getMetrics(item.node, 1);
                const childX = centerX + (rootMetrics.width / 2 + childMetrics.width / 2 + HORIZONTAL_GAP);
                const palette = DEFAULT_PALETTE;
                const color = item.node.branchColor || palette[item.idx % palette.length];

                const childLayout = layoutNode(
                    item.node,
                    childX,
                    childY,
                    1,
                    false,
                    item.idx,
                    color,
                    rootLayout
                );
                rootLayout.children.push(childLayout);
                rightY += rightHeights[i] + VERTICAL_GAP;
            });

            // Layout left side children
            const leftHeights = leftChildren.map((child) => getSubtreeHeight(child.node, 1));
            const leftTotalHeight = leftHeights.reduce((a, b) => a + b, 0)
                + Math.max(0, leftHeights.length - 1) * VERTICAL_GAP;
            let leftY = centerY - leftTotalHeight / 2;

            leftChildren.forEach((item, i) => {
                const childY = leftY + leftHeights[i] / 2;
                const childMetrics = getMetrics(item.node, 1);
                const childX = centerX - (rootMetrics.width / 2 + childMetrics.width / 2 + HORIZONTAL_GAP);
                const palette = DEFAULT_PALETTE;
                const color = item.node.branchColor || palette[item.idx % palette.length];

                const childLayout = layoutNode(
                    item.node,
                    childX,
                    childY,
                    1,
                    true,
                    item.idx,
                    color,
                    rootLayout
                );
                rootLayout.children.push(childLayout);
                leftY += leftHeights[i] + VERTICAL_GAP;
            });
        }

        return nodes;
    }, []);

    const renderMindmap = useCallback(() => {
        if (!svgRef.current || !containerRef.current || !data) return;

        // Clear previous content
        d3.select(svgRef.current).selectAll('*').remove();

        const container = containerRef.current;
        const width = container.clientWidth || 1200;
        const height = container.clientHeight || 800;

        const svg = d3.select(svgRef.current)
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`);

        // Create defs for filters and gradients
        const defs = svg.append('defs');

        // Glow filter for selected nodes
        const glowFilter = defs.append('filter')
            .attr('id', 'selectedGlow')
            .attr('x', '-50%')
            .attr('y', '-50%')
            .attr('width', '200%')
            .attr('height', '200%');
        glowFilter.append('feGaussianBlur')
            .attr('stdDeviation', '4')
            .attr('result', 'coloredBlur');
        const feMerge = glowFilter.append('feMerge');
        feMerge.append('feMergeNode').attr('in', 'coloredBlur');
        feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

        // Create main group for zoom/pan
        const g = svg.append('g');
        gRef.current = g;

        // Add zoom behavior
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.2, 4])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
                zoomTransformRef.current = event.transform;
                updateMinimap();
            });

        zoomRef.current = zoom;
        svg.call(zoom);

        // Precompute node metrics for sizing and layout
        const metricsById = new Map<string, NodeMetrics>();
        const buildMetrics = (node: MindmapNode, depth: number) => {
            metricsById.set(node.id, buildNodeMetrics(node.title, depth));
            node.children.forEach((child) => buildMetrics(child, depth + 1));
        };
        buildMetrics(data, 0);

        // Create bilateral layout
        const centerX = width / 2;
        const centerY = height / 2;
        const nodes = createBilateralLayout(data, centerX, centerY, metricsById);
        // Store layout nodes for zoom-to-node
        layoutNodesRef.current = nodes;

        // Draw links
        const links: { source: LayoutNode; target: LayoutNode }[] = [];
        nodes.forEach(node => {
            node.children.forEach(child => {
                links.push({ source: node, target: child });
            });
        });

        const linkSelection = g.selectAll('.link')
            .data(links)
            .enter()
            .append('path')
            .attr('class', styles.link)
            .attr('d', (d) => {
                const midX = (d.source.x + d.target.x) / 2;
                return `M${d.source.x},${d.source.y} C${midX},${d.source.y} ${midX},${d.target.y} ${d.target.x},${d.target.y}`;
            })
            .attr('stroke', (d) => d.target.branchColor)
            .attr('stroke-width', (d) => Math.max(1.5, 4 - d.target.depth))
            .attr('fill', 'none')
            .attr('opacity', (d) => {
                // Visual depth indicator: fade deeper nodes
                const baseOpacity = 0.7 - (d.target.depth - 1) * 0.1;
                if (selectionMode && selectedNodeIds.length > 0 && !selectedNodeIds.includes(d.target.data.id)) {
                    return Math.max(0.08, baseOpacity * 0.2);
                }
                // Focus mode: dim non-focused branches
                if (isNodeInFocus && !isNodeInFocus(d.target.data.id)) {
                    return baseOpacity * 0.2;
                }
                return Math.max(0.3, baseOpacity);
            });

        if (!hasAnimatedRef.current) {
            linkSelection
                .attr('opacity', 0)
                .transition()
                .duration(500)
                .delay((_, i) => i * 15)
                .attr('opacity', (d) => {
                    const baseOpacity = 0.7 - (d.target.depth - 1) * 0.1;
                    if (isNodeInFocus && !isNodeInFocus(d.target.data.id)) {
                        return baseOpacity * 0.2;
                    }
                    return Math.max(0.3, baseOpacity);
                });
        }

        // Draw nodes
        const nodeGroups = g.selectAll('.node')
            .data(nodes)
            .enter()
            .append('g')
            .attr('class', (d) => {
                let classes = styles.node;
                if (selectedNodeIds.includes(d.data.id) || selectedNodeId === d.data.id) classes += ` ${styles.selected}`;
                if (expandingNodeId === d.data.id) classes += ` ${styles.expanding}`;
                return classes;
            })
            .attr('transform', (d) => `translate(${d.x},${d.y})`)
            .style('cursor', 'pointer')
            .style('opacity', (d) => {
                // Visual depth indicator: fade deeper nodes
                const baseOpacity = 1 - (d.depth - 1) * 0.08;
                if (selectionMode && selectedNodeIds.length > 0 && !selectedNodeIds.includes(d.data.id)) {
                    return Math.max(0.14, baseOpacity * 0.22);
                }
                // Focus mode: dim non-focused branches
                if (isNodeInFocus && !isNodeInFocus(d.data.id)) {
                    return baseOpacity * 0.25;
                }
                return Math.max(0.5, baseOpacity);
            })
            .on('click', (event, d) => {
                event.stopPropagation();
                if (editingNodeId !== d.data.id) {
                    // Zoom to and center the clicked node first
                    zoomToNode(d);
                    // Then trigger the node click callback after zoom starts
                    if (onNodeClick) {
                        // Small delay to let zoom animation begin
                        setTimeout(() => {
                            onNodeClick(d.data, {
                                x: event.clientX,
                                y: event.clientY,
                            });
                        }, 150);
                    }
                }
            })
            .on('dblclick', (event, d) => {
                event.stopPropagation();
                if (onNodeDoubleClick) {
                    onNodeDoubleClick(d.data.id);
                    // Zoom to fit this branch
                    zoomToBranch(d);
                }
            });

        // Node backgrounds
        nodeGroups.each(function (d) {
            const node = d3.select(this);
            const isRoot = d.depth === 0;
            const isSelected = selectedNodeIds.includes(d.data.id) || selectedNodeId === d.data.id;
            const isExpanding = expandingNodeId === d.data.id;
            const hasChildren = d.data.children.length > 0;
            const isCollapsed = d.data.collapsed;
            const rectWidth = d.width;
            const rectHeight = d.height;
            const radius = rectHeight / 2;

            const rect = node.append('rect')
                .attr('x', -rectWidth / 2)
                .attr('y', -rectHeight / 2)
                .attr('width', rectWidth)
                .attr('height', rectHeight)
                .attr('rx', radius)
                .attr('ry', radius)
                .attr('fill', isRoot ? ROOT_COLOR : d.branchColor)
                .attr('opacity', isRoot ? 1 : 0.9)
                .attr('class', styles.nodeRect);

            if (isSelected) {
                rect.attr('filter', 'url(#selectedGlow)')
                    .attr('stroke', '#fff')
                    .attr('stroke-width', 2);
            }

            // Collapsed indicator (dotted border + count badge)
            if (isCollapsed && hasChildren) {
                node.append('rect')
                    .attr('x', -rectWidth / 2 - 2)
                    .attr('y', -rectHeight / 2 - 2)
                    .attr('width', rectWidth + 4)
                    .attr('height', rectHeight + 4)
                    .attr('rx', radius + 2)
                    .attr('ry', radius + 2)
                    .attr('fill', 'none')
                    .attr('stroke', d.branchColor)
                    .attr('stroke-width', 2)
                    .attr('stroke-dasharray', '4 2')
                    .attr('opacity', 0.6);

                // Badge showing hidden count
                const hiddenCount = countDescendants(d.data);
                node.append('circle')
                    .attr('cx', rectWidth / 2 + 4)
                    .attr('cy', 0)
                    .attr('r', 10)
                    .attr('fill', d.branchColor)
                    .attr('stroke', '#1a1a2e')
                    .attr('stroke-width', 1);

                node.append('text')
                    .attr('x', rectWidth / 2 + 4)
                    .attr('y', 4)
                    .attr('text-anchor', 'middle')
                    .attr('fill', '#1a1a2e')
                    .attr('font-size', '9px')
                    .attr('font-weight', 'bold')
                    .text(hiddenCount);
            }

            // Collapse toggle button (only for nodes with children)
            if (hasChildren && !isRoot) {
                const toggleX = d.isLeft ? -rectWidth / 2 - 14 : rectWidth / 2 + 14;

                node.append('circle')
                    .attr('class', styles.collapseToggle)
                    .attr('cx', toggleX)
                    .attr('cy', 0)
                    .attr('r', 10)
                    .attr('fill', 'rgba(255,255,255,0.15)')
                    .attr('stroke', d.branchColor)
                    .attr('stroke-width', 1.5)
                    .style('cursor', 'pointer')
                    .on('click', (event) => {
                        event.stopPropagation();
                        if (onToggleCollapse) {
                            onToggleCollapse(d.data.id);
                        }
                    });

                node.append('text')
                    .attr('x', toggleX)
                    .attr('y', 4)
                    .attr('text-anchor', 'middle')
                    .attr('fill', d.branchColor)
                    .attr('font-size', '14px')
                    .attr('font-weight', 'bold')
                    .attr('pointer-events', 'none')
                    .text(isCollapsed ? '+' : '−');
            }

            // Expanding spinner overlay
            if (isExpanding) {
                node.append('circle')
                    .attr('r', rectHeight / 2 + 4)
                    .attr('fill', 'none')
                    .attr('stroke', '#fff')
                    .attr('stroke-width', 2)
                    .attr('stroke-dasharray', '8 8')
                    .attr('class', styles.spinnerCircle);
            }

            // Notes indicator
            if (d.data.notes) {
                node.append('circle')
                    .attr('cx', rectWidth / 2 - 6)
                    .attr('cy', -rectHeight / 2 + 6)
                    .attr('r', 6)
                    .attr('fill', ROOT_COLOR)
                    .attr('stroke', '#fff')
                    .attr('stroke-width', 1.5);

                node.append('text')
                    .attr('x', rectWidth / 2 - 6)
                    .attr('y', -rectHeight / 2 + 10)
                    .attr('text-anchor', 'middle')
                    .attr('fill', '#fff')
                    .attr('font-size', '8px')
                    .attr('font-weight', 'bold')
                    .text('📝');
            }
        });

        // Node text (skip if editing)
        nodeGroups.filter((d) => editingNodeId !== d.data.id)
            .each(function (d) {
                const node = d3.select(this);
                const text = node.append('text')
                    .attr('class', styles.nodeText)
                    .attr('text-anchor', 'middle')
                    .attr('dominant-baseline', 'middle')
                    .attr('fill', d.depth === 0 ? '#fff' : '#1a1a2e')
                    .attr('font-size', `${d.fontSize}px`)
                    .attr('font-weight', d.fontWeight);

                const lineCount = d.lines.length;
                const lineOffset = (lineCount - 1) * d.lineHeight / 2;
                d.lines.forEach((line, index) => {
                    text.append('tspan')
                        .attr('x', 0)
                        .attr('dy', index === 0 ? -lineOffset : d.lineHeight)
                        .text(line);
                });
            });

        // Handle inline editing
        if (editingNodeId) {
            const editingNode = nodes.find((n) => n.data.id === editingNodeId);
            if (editingNode) {
                const isRoot = editingNode.depth === 0;
                const editingText = editValue || editingNode.data.title;
                const metrics = buildNodeMetrics(editingText, editingNode.depth);
                const rectWidth = Math.max(100, metrics.width);
                const rectHeight = metrics.height;

                const foreignObject = g.append('foreignObject')
                    .attr('x', editingNode.x - rectWidth / 2)
                    .attr('y', editingNode.y - rectHeight / 2)
                    .attr('width', rectWidth)
                    .attr('height', rectHeight);

                foreignObject.append('xhtml:input')
                    .attr('type', 'text')
                    .attr('value', editValue || editingNode.data.title)
                    .attr('class', styles.inlineInput)
                    .style('width', '100%')
                    .style('height', '100%')
                    .style('padding', '0 12px')
                    .style('background', isRoot ? ROOT_COLOR : editingNode.branchColor)
                    .style('border', '2px solid #fff')
                    .style('border-radius', `${rectHeight / 2}px`)
                    .style('color', isRoot ? '#fff' : '#1a1a2e')
                    .style('font-size', `${metrics.fontSize}px`)
                    .style('font-weight', `${metrics.fontWeight}`)
                    .style('line-height', `${metrics.lineHeight}px`)
                    .style('text-align', 'center')
                    .style('outline', 'none')
                    .on('input', function () {
                        setEditValue((this as HTMLInputElement).value);
                    })
                    .on('keydown', function (event: KeyboardEvent) {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            const newTitle = (this as HTMLInputElement).value.trim();
                            if (newTitle && onNodeTitleChange) {
                                onNodeTitleChange(editingNodeId, newTitle);
                            }
                            if (onEditComplete) onEditComplete();
                        } else if (event.key === 'Escape') {
                            if (onEditComplete) onEditComplete();
                        }
                    })
                    .on('blur', function () {
                        const newTitle = (this as HTMLInputElement).value.trim();
                        if (newTitle && onNodeTitleChange) {
                            onNodeTitleChange(editingNodeId, newTitle);
                        }
                        if (onEditComplete) onEditComplete();
                    });

                setTimeout(() => {
                    const input = foreignObject.select('input').node() as HTMLInputElement;
                    if (input) {
                        input.focus();
                        input.select();
                    }
                }, 50);
            }
        }

        const getNodeOpacity = (d: LayoutNode) => {
            const baseOpacity = 1 - (d.depth - 1) * 0.08;
            if (isNodeInFocus && !isNodeInFocus(d.data.id)) {
                return baseOpacity * 0.25;
            }
            return Math.max(0.5, baseOpacity);
        };

        // Animate nodes only on first load
        if (!hasAnimatedRef.current) {
            nodeGroups
                .attr('opacity', 0)
                .attr('transform', (d) => `translate(${d.x},${d.y}) scale(0.5)`)
                .transition()
                .duration(400)
                .delay((_, i) => i * 20)
                .attr('opacity', (d) => getNodeOpacity(d))
                .attr('transform', (d) => `translate(${d.x},${d.y}) scale(1)`);
        } else {
            nodeGroups
                .attr('opacity', (d) => getNodeOpacity(d))
                .attr('transform', (d) => `translate(${d.x},${d.y}) scale(1)`);
        }

        // Preserve current zoom if possible, otherwise fit to view
        const bounds = g.node()?.getBBox();
        if (bounds) {
            if (zoomTransformRef.current && !shouldAutoFitRef.current) {
                svg.call(zoom.transform, zoomTransformRef.current);
            } else {
                const fullWidth = bounds.width + 120;
                const fullHeight = bounds.height + 120;
                const fittedScale = Math.min(
                    width / fullWidth,
                    height / fullHeight,
                    1
                ) * 0.9;

                const translateX = width / 2 - (bounds.x + bounds.width / 2) * fittedScale;
                const translateY = height / 2 - (bounds.y + bounds.height / 2) * fittedScale;

                svg.call(
                    zoom.transform,
                    d3.zoomIdentity.translate(translateX, translateY).scale(fittedScale)
                );
            }
            shouldAutoFitRef.current = false;
        }

        // Update minimap
        updateMinimap();

        if (!hasAnimatedRef.current) {
            hasAnimatedRef.current = true;
            if (viewKey !== undefined) {
                animatedViews.add(viewKey);
            }
        }

        // Zoom to single node function - centers and zooms into a specific node
        function zoomToNode(targetNode: LayoutNode) {
            // Calculate a comfortable zoom scale - higher for focused viewing
            const targetScale = 1.8;

            // Center the node on screen
            const translateX = width / 2 - targetNode.x * targetScale;
            const translateY = height / 2 - targetNode.y * targetScale;

            svg.transition()
                .duration(400)
                .ease(d3.easeCubicOut)
                .call(
                    zoom.transform,
                    d3.zoomIdentity.translate(translateX, translateY).scale(targetScale)
                );
        }

        // Zoom to branch function
        function zoomToBranch(targetNode: LayoutNode) {
            // Find all descendants
            const getAllDescendants = (node: LayoutNode): LayoutNode[] => {
                const result = [node];
                node.children.forEach(child => {
                    result.push(...getAllDescendants(child));
                });
                return result;
            };

            const branchNodes = getAllDescendants(targetNode);
            if (branchNodes.length === 0) return;

            const minX = Math.min(...branchNodes.map((n) => n.x - n.width / 2)) - 100;
            const maxX = Math.max(...branchNodes.map((n) => n.x + n.width / 2)) + 100;
            const minY = Math.min(...branchNodes.map((n) => n.y - n.height / 2)) - 60;
            const maxY = Math.max(...branchNodes.map((n) => n.y + n.height / 2)) + 60;

            const branchWidth = maxX - minX;
            const branchHeight = maxY - minY;

            const scale = Math.min(
                width / branchWidth,
                height / branchHeight,
                1.5
            ) * 0.9;

            const centerBranchX = (minX + maxX) / 2;
            const centerBranchY = (minY + maxY) / 2;

            const translateX = width / 2 - centerBranchX * scale;
            const translateY = height / 2 - centerBranchY * scale;

            svg.transition()
                .duration(500)
                .call(
                    zoom.transform,
                    d3.zoomIdentity.translate(translateX, translateY).scale(scale)
                );
        }

        // Minimap update function
        function updateMinimap() {
            if (!minimapRef.current || !gRef.current) return;

            const minimapSvg = d3.select(minimapRef.current);
            minimapSvg.selectAll('*').remove();

            const minimapWidth = 150;
            const minimapHeight = 100;
            const mainBounds = gRef.current.node()?.getBBox();

            if (!mainBounds) return;

            const scaleX = minimapWidth / (mainBounds.width + 100);
            const scaleY = minimapHeight / (mainBounds.height + 100);
            const minimapScale = Math.min(scaleX, scaleY);

            const offsetX = -mainBounds.x * minimapScale + (minimapWidth - mainBounds.width * minimapScale) / 2;
            const offsetY = -mainBounds.y * minimapScale + (minimapHeight - mainBounds.height * minimapScale) / 2;

            // Draw simplified nodes on minimap
            const minimapG = minimapSvg.append('g')
                .attr('transform', `translate(${offsetX},${offsetY}) scale(${minimapScale})`);

            nodes.forEach(node => {
                minimapG.append('circle')
                    .attr('cx', node.x)
                    .attr('cy', node.y)
                    .attr('r', node.depth === 0 ? 8 : 4)
                    .attr('fill', node.branchColor)
                    .attr('opacity', 0.8);
            });

            // Draw viewport rectangle
            const transform = d3.zoomTransform(svgRef.current!);
            const viewportX = -transform.x / transform.k;
            const viewportY = -transform.y / transform.k;
            const viewportWidth = width / transform.k;
            const viewportHeight = height / transform.k;

            minimapG.append('rect')
                .attr('x', viewportX)
                .attr('y', viewportY)
                .attr('width', viewportWidth)
                .attr('height', viewportHeight)
                .attr('fill', 'none')
                .attr('stroke', ROOT_COLOR)
                .attr('stroke-width', 2 / minimapScale);
        }

    }, [data, editingNodeId, editValue, onNodeClick, onNodeTitleChange, onEditComplete, onToggleCollapse, onNodeDoubleClick, isNodeInFocus, createBilateralLayout, selectedNodeId, selectedNodeIds, selectionMode, expandingNodeId]);

    // Separate effect for selection visual updates (no full re-render)
    useEffect(() => {
        if (!gRef.current || !svgRef.current) return;

        // Update node selection styles in-place
        gRef.current.selectAll('.' + styles.node)
            .classed(styles.selected, (d: unknown) => {
                const node = d as LayoutNode;
                return selectedNodeIds.includes(node.data.id) || selectedNodeId === node.data.id;
            });

        // Update glow filter for selected node
        gRef.current.selectAll('.' + styles.nodeRect)
            .attr('filter', (d: unknown) => {
                const node = d as LayoutNode;
                return selectedNodeIds.includes(node.data.id) || selectedNodeId === node.data.id ? 'url(#selectedGlow)' : null;
            })
            .attr('stroke', (d: unknown) => {
                const node = d as LayoutNode;
                return selectedNodeIds.includes(node.data.id) || selectedNodeId === node.data.id ? '#fff' : null;
            })
            .attr('stroke-width', (d: unknown) => {
                const node = d as LayoutNode;
                return selectedNodeIds.includes(node.data.id) || selectedNodeId === node.data.id ? 2 : 0;
            });

        // Pan to selected node only if it's outside the viewport
        if (selectedNodeId && zoomRef.current && containerRef.current && svgRef.current) {
            const selectedLayout = layoutNodesRef.current.find(n => n.data.id === selectedNodeId);
            if (selectedLayout) {
                const container = containerRef.current;
                const width = container.clientWidth || 1200;
                const height = container.clientHeight || 800;
                const transform = d3.zoomTransform(svgRef.current);
                const scale = transform.k || 1;

                const nodeX = selectedLayout.x * scale + transform.x;
                const nodeY = selectedLayout.y * scale + transform.y;
                const nodeWidth = selectedLayout.width * scale;
                const nodeHeight = selectedLayout.height * scale;
                const margin = 80;

                const left = nodeX - nodeWidth / 2;
                const right = nodeX + nodeWidth / 2;
                const top = nodeY - nodeHeight / 2;
                const bottom = nodeY + nodeHeight / 2;
                const isVisible = left >= margin
                    && right <= width - margin
                    && top >= margin
                    && bottom <= height - margin;

                if (!isVisible) {
                    const translateX = width / 2 - selectedLayout.x * scale;
                    const translateY = height / 2 - selectedLayout.y * scale;

                    d3.select(svgRef.current)
                        .transition()
                        .duration(300)
                        .ease(d3.easeCubicOut)
                        .call(
                            zoomRef.current.transform as unknown as (transition: d3.Transition<SVGSVGElement, unknown, null, undefined>, transform: d3.ZoomTransform) => void,
                            d3.zoomIdentity.translate(translateX, translateY).scale(scale)
                        );
                }
            }
        }
    }, [selectedNodeId]);

    // Separate effect for expanding visual updates
    useEffect(() => {
        if (!gRef.current) return;

        // Update expanding animation state
        gRef.current.selectAll('.' + styles.node)
            .classed(styles.expanding, (d: unknown) => {
                const node = d as LayoutNode;
                return expandingNodeId === node.data.id;
            });
    }, [expandingNodeId]);

    // Count descendants helper
    const countDescendants = (node: MindmapNode): number => {
        let count = node.children.length;
        node.children.forEach(child => {
            count += countDescendants(child);
        });
        return count;
    };

    // Initialize edit value when editing starts
    useEffect(() => {
        if (editingNodeId) {
            const findNode = (node: MindmapNode): MindmapNode | null => {
                if (node.id === editingNodeId) return node;
                for (const child of node.children) {
                    const found = findNode(child);
                    if (found) return found;
                }
                return null;
            };
            const node = findNode(data);
            if (node) {
                setEditValue(node.title);
            }
        }
    }, [editingNodeId, data]);

    useEffect(() => {
        renderMindmap();

        const handleResize = () => {
            renderMindmap();
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [renderMindmap]);

    // Export function for PNG
    const exportToPNG = useCallback(() => {
        if (!svgRef.current) return;

        const svg = svgRef.current;
        const svgData = new XMLSerializer().serializeToString(svg);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = svg.clientWidth * 2;
            canvas.height = svg.clientHeight * 2;

            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = '#0a0a0f';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.scale(2, 2);
                ctx.drawImage(img, 0, 0);

                const pngUrl = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.download = 'mindmap.png';
                link.href = pngUrl;
                link.click();
            }
            URL.revokeObjectURL(url);
        };
        img.src = url;
    }, []);

    // Expose export function via window event
    useEffect(() => {
        const handleExport = () => exportToPNG();
        window.addEventListener('export-mindmap', handleExport);
        return () => window.removeEventListener('export-mindmap', handleExport);
    }, [exportToPNG]);

    return (
        <div ref={containerRef} className={styles.container}>
            <svg ref={svgRef} className={styles.svg} />
            {/* Minimap */}
            <div className={styles.minimapContainer}>
                <svg ref={minimapRef} className={styles.minimap} width="150" height="100" />
            </div>
        </div>
    );
}
