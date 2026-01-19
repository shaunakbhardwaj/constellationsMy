export interface MindmapNode {
  id: string;
  title: string;
  level: number;
  children: MindmapNode[];
  notes?: string;
  branchColor?: string;
  collapsed?: boolean;
}

/**
 * Parse markdown headings into a tree structure for mindmap visualization.
 * Handles # through #### headings (levels 1-4).
 */
export function parseMarkdownToTree(markdown: string): MindmapNode | null {
  const lines = markdown.split('\n').filter(line => line.trim());

  if (lines.length === 0) {
    return null;
  }

  let root: MindmapNode | null = null;
  const stack: MindmapNode[] = [];
  let nodeId = 0;

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (!match) continue;

    const level = match[1].length;
    const title = match[2].trim();

    const node: MindmapNode = {
      id: `node-${nodeId++}`,
      title,
      level,
      children: [],
    };

    if (level === 1) {
      // Root node
      root = node;
      stack.length = 0;
      stack.push(node);
    } else {
      // Find parent - go up the stack until we find a node with lower level
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      if (stack.length > 0) {
        stack[stack.length - 1].children.push(node);
      } else if (root) {
        // If somehow we don't have a proper parent, attach to root
        root.children.push(node);
      }

      stack.push(node);
    }
  }

  return root;
}

/**
 * Flatten tree to array for easier iteration
 */
export function flattenTree(node: MindmapNode): MindmapNode[] {
  const result: MindmapNode[] = [node];
  for (const child of node.children) {
    result.push(...flattenTree(child));
  }
  return result;
}

/**
 * Get maximum depth of tree
 */
export function getTreeDepth(node: MindmapNode): number {
  if (node.children.length === 0) {
    return 1;
  }
  return 1 + Math.max(...node.children.map(getTreeDepth));
}
