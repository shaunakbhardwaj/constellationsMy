export interface MindmapNode {
  id: string;
  title: string;
  level: number;
  children: MindmapNode[];
  description?: string;
  notes?: string;
  branchColor?: string;
  collapsed?: boolean;
}

function normalizeLineTitle(line: string): string {
  return line
    .replace(/^[-*•]\s+/, "")
    .replace(/^\d+[\).:\-]\s+/, "")
    .replace(/^#+\s*/, "")
    .replace(/\*\*/g, "")
    .trim();
}

function splitTitleAndDescription(rawTitle: string): {
  title: string;
  description?: string;
} {
  const normalized = normalizeLineTitle(rawTitle);
  const delimiterMatch = normalized.match(/\s+(?:::|--|—)\s+/);
  if (!delimiterMatch || delimiterMatch.index === undefined) {
    return { title: normalized };
  }

  const title = normalized.slice(0, delimiterMatch.index).trim();
  const description = normalized
    .slice(delimiterMatch.index + delimiterMatch[0].length)
    .trim();
  return {
    title: title || normalized,
    description: description || undefined,
  };
}

function extractHeadingLines(markdown: string): string[] {
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^(#{1,6})\s+.+$/.test(line));
}

function fallbackPlainTextToHeadings(markdown: string): string[] {
  const lines = markdown
    .split("\n")
    .map((line) => normalizeLineTitle(line))
    .filter(Boolean)
    .filter((line) => !/^```/.test(line));

  if (lines.length === 0) return [];

  const root = lines[0];
  const remainder = lines.slice(1);
  const branchCandidates =
    remainder.length > 0
      ? remainder
      : root
          .split(/[.!?]/)
          .map((part) => normalizeLineTitle(part))
          .filter(Boolean)
          .slice(1);

  const headings = [`# ${root}`];
  branchCandidates.slice(0, 8).forEach((line) => {
    headings.push(`## ${line}`);
  });

  return headings;
}

/**
 * Parse markdown headings into a tree structure for mindmap visualization.
 * Handles # through #### headings (levels 1-4).
 */
export function parseMarkdownToTree(markdown: string): MindmapNode | null {
  const headingLines = extractHeadingLines(markdown);
  const lines =
    headingLines.length > 0
      ? headingLines
      : fallbackPlainTextToHeadings(markdown);

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
    const { title, description } = splitTitleAndDescription(match[2]);
    if (!title) continue;

    const node: MindmapNode = {
      id: `node-${nodeId++}`,
      title,
      level,
      children: [],
      description,
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
