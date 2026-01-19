import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { parseMarkdownToTree, MindmapNode } from '@/lib/parseMarkdown';
import { useMindmapState } from '@/lib/useMindmapState';
import { DEFAULT_MODEL } from '@/lib/openrouter';
import CanvasOverlay from '@/components/CanvasOverlay';
import NodeContextMenu from '@/components/NodeContextMenu';
import NotesModal from '@/components/NotesModal';
import DeleteConfirmDialog from '@/components/DeleteConfirmDialog';
import SettingsPanel from '@/components/SettingsPanel';
import AIExpandBar, { ExpansionMode } from '@/components/AIExpandBar';
// import styles from './page.module.css'; // We should verify if we want to keep CSS modules or move to Tailwind/global. For now keeping it if file exists.
// Actually standard Vite doesn't support .module.css behavior interchangeably without setup, but usually works.
// However, the import style 'styles.container' implies modules.
import styles from './page.module.css';

// Dynamic import replacement -> React.lazy
const MindmapCanvas = lazy(() => import('@/components/MindmapCanvas'));

// Storage keys
const STORAGE_KEYS = {
  API_KEY: 'mindmap_openrouter_api_key',
  MODEL: 'mindmap_selected_model',
};

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const storedApiKey = localStorage.getItem(STORAGE_KEYS.API_KEY)
      || import.meta.env.VITE_OPENROUTER_API_KEY
      || '';
    const storedModel = localStorage.getItem(STORAGE_KEYS.MODEL) || DEFAULT_MODEL;
    setApiKey(storedApiKey);
    setModel(storedModel);
    setIsHydrated(true);
  }, []);

  // Persist API key to localStorage
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(STORAGE_KEYS.API_KEY, apiKey);
    }
  }, [apiKey, isHydrated]);

  // Persist model to localStorage
  useEffect(() => {
    if (isHydrated && model) {
      localStorage.setItem(STORAGE_KEYS.MODEL, model);
    }
  }, [model, isHydrated]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedMarkdown, setGeneratedMarkdown] = useState<string>('');

  // Settings panel state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Navigation state
  const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate');

  // Canvas overlay state
  const [isCanvasOpen, setIsCanvasOpen] = useState(false);
  const [viewKey, setViewKey] = useState(0);

  // Mindmap state management
  const mindmapState = useMindmapState(null);
  const {
    root,
    selectedNodeId,
    editingNodeId,
    expandingNodeId,
    focusedNodeId,
    setData,
    setSelectedNodeId,
    setEditingNodeId,
    setExpandingNodeId,
    setFocusedNodeId,
    addChild,
    updateNode,
    deleteNode,
    setNodeColor,
    resetNodeStyle,
    setNodeNotes,
    expandNode,
    toggleCollapse,
    collapseSiblings,
    getNodePath,
    getDescendantCount,
    isNodeInFocus,
  } = mindmapState;

  // Context menu state
  const [menuState, setMenuState] = useState<{
    node: MindmapNode;
    position: { x: number; y: number };
  } | null>(null);

  // Modal states
  const [notesModalNode, setNotesModalNode] = useState<MindmapNode | null>(null);
  const [deleteConfirmNode, setDeleteConfirmNode] = useState<MindmapNode | null>(null);
  const [aiExpandModalState, setAiExpandModalState] = useState<{
    node: MindmapNode;
    position: { x: number; y: number };
  } | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setError('Please enter a topic for your mindmap');
      return;
    }

    if (!apiKey.trim()) {
      setError('Please add your OpenRouter API key in Settings');
      setIsSettingsOpen(true);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // IPC Call
      const result = await window.api.generateMindmap({
        prompt: prompt.trim(),
        apiKey: apiKey.trim(),
        model,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate mindmap');
      }

      const parsed = parseMarkdownToTree(result.markdown);
      if (!parsed) {
        throw new Error('Failed to parse generated content');
      }

      setData(parsed);
      setViewKey((prev) => prev + 1);
      setGeneratedMarkdown(result.markdown);
      // Auto-open fullscreen canvas after successful generation
      setIsCanvasOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [prompt, apiKey, model, setData, setViewKey]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const copyMarkdown = () => {
    navigator.clipboard.writeText(generatedMarkdown);
  };

  // Open canvas overlay
  const handleOpenCanvas = () => {
    setIsCanvasOpen(true);
  };

  // Close canvas overlay
  const handleCloseCanvas = () => {
    setIsCanvasOpen(false);
    setMenuState(null);
    setSelectedNodeId(null);
    setEditingNodeId(null);
  };

  // Handle node click
  const handleNodeClick = useCallback((node: MindmapNode, position: { x: number; y: number }) => {
    setSelectedNodeId(node.id);
    setMenuState({ node, position });
  }, [setSelectedNodeId, setMenuState]);

  // Close context menu
  const handleCloseMenu = () => {
    setMenuState(null);
    setSelectedNodeId(null);
  };

  // Menu action handlers
  const handleColorChange = (color: string) => {
    if (menuState) {
      setNodeColor(menuState.node.id, color);
      handleCloseMenu();
    }
  };

  const handleAddBranch = () => {
    if (menuState) {
      const newNode = addChild(menuState.node.id, 'New Branch');
      if (newNode) {
        setEditingNodeId(newNode.id);
      }
      handleCloseMenu();
    }
  };

  const handleAddNotes = () => {
    if (menuState) {
      setNotesModalNode(menuState.node);
      handleCloseMenu();
    }
  };

  // Open AI Expand modal (called from context menu)
  const handleOpenAIExpand = () => {
    if (menuState) {
      setAiExpandModalState({
        node: menuState.node,
        position: menuState.position,
      });
      handleCloseMenu();
    }
  };

  // Close AI Expand modal
  const handleCloseAIExpandModal = () => {
    setAiExpandModalState(null);
  };

  // Helper to get sibling titles for a node
  const getSiblingTitles = useCallback((nodeId: string): string[] => {
    if (!root) return [];

    // Find parent of this node
    const findParent = (node: MindmapNode, targetId: string): MindmapNode | null => {
      for (const child of node.children) {
        if (child.id === targetId) return node;
        const found = findParent(child, targetId);
        if (found) return found;
      }
      return null;
    };

    const parent = root.id === nodeId ? null : findParent(root, nodeId);
    if (!parent) return [];

    return parent.children
      .filter(child => child.id !== nodeId)
      .map(child => child.title);
  }, [root]);

  // Handle AI Expand with mode and custom instruction
  const handleAIExpand = async (mode: ExpansionMode, customInstruction: string) => {
    if (!aiExpandModalState || !apiKey.trim()) return;

    const nodeId = aiExpandModalState.node.id;
    const nodeTopic = aiExpandModalState.node.title;
    handleCloseAIExpandModal();
    setExpandingNodeId(nodeId);

    try {
      // IPC Call
      const result = await window.api.expandNode({
        topic: nodeTopic,
        context: getNodePath(nodeId),
        apiKey: apiKey.trim(),
        model,
        mode,
        rootTopic: root?.title || '',
        siblings: getSiblingTitles(nodeId),
        customInstruction,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to expand node');
      }

      // Smart auto-collapse: collapse siblings when expanding
      collapseSiblings(nodeId);

      // Parse children if not returned directly (IPC handler returns markdown, parsing logic usually in frontend unless moved)
      // Wait, api/generate/expand/route.ts did parsing on server.
      // My IPC handler (src/main/ipc.ts) returns markdown. I need to parse it here?
      // Wait, let's check ipc.ts. It returned { success: true, markdown, mode }.
      // The original route DID parse it: `const children = parseExpandedContent(markdown, 1);`
      // I missed copying `parseExpandedContent` to main/ipc.ts or I should do it here.
      // Since `parseMarkdownToTree` is in `@/lib/parseMarkdown`, I can use that or similar logic here.
      // Actually `parseExpandedContent` was a specific helper in the route file.
      // I should implement `parseExpandedContent` here or in `lib/parseMarkdown`.

      // I will assume I need to parse it here for now.
      const children = parseExpandedContent(result.markdown, 1);

      expandNode(nodeId, children);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to expand node');
    } finally {
      setExpandingNodeId(null);
    }
  };

  // Toggle collapse handler
  const handleToggleCollapse = useCallback((nodeId: string) => {
    toggleCollapse(nodeId);
  }, [toggleCollapse]);

  // Focus on branch (double-click)
  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    if (focusedNodeId === nodeId) {
      setFocusedNodeId(null);
    } else {
      setFocusedNodeId(nodeId);
    }
  }, [focusedNodeId, setFocusedNodeId]);

  const handleEditNode = () => {
    if (menuState) {
      setEditingNodeId(menuState.node.id);
      handleCloseMenu();
    }
  };

  const handleRemoveStyles = () => {
    if (menuState) {
      resetNodeStyle(menuState.node.id);
      handleCloseMenu();
    }
  };

  const handleDeleteNode = () => {
    if (menuState) {
      const descendantCount = getDescendantCount(menuState.node.id);
      if (descendantCount > 0) {
        setDeleteConfirmNode(menuState.node);
      } else {
        deleteNode(menuState.node.id);
      }
      handleCloseMenu();
    }
  };

  // Notes modal handlers
  const handleSaveNotes = (notes: string) => {
    if (notesModalNode) {
      setNodeNotes(notesModalNode.id, notes);
    }
  };

  // Delete confirm handlers
  const handleConfirmDelete = () => {
    if (deleteConfirmNode) {
      deleteNode(deleteConfirmNode.id);
      setDeleteConfirmNode(null);
    }
  };

  // Handle node title change from inline edit
  const handleNodeTitleChange = useCallback((nodeId: string, newTitle: string) => {
    updateNode(nodeId, { title: newTitle });
  }, [updateNode]);

  // Handle edit complete
  const handleEditComplete = useCallback(() => {
    setEditingNodeId(null);
  }, [setEditingNodeId]);

  // Export handler
  const handleExport = () => {
    window.dispatchEvent(new CustomEvent('export-mindmap'));
  };

  // Keyboard shortcuts when canvas is open and a node is selected
  useEffect(() => {
    if (!isCanvasOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts if we're in an input/textarea or editing
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || editingNodeId) {
        return;
      }

      // Only handle shortcuts when we have a selected node (from menu state)
      if (!menuState?.node) return;

      switch (e.key.toLowerCase()) {
        case 'e':
          e.preventDefault();
          handleEditNode();
          break;
        case 'a':
          e.preventDefault();
          handleAddBranch();
          break;
        case 'x':
          e.preventDefault();
          handleOpenAIExpand();
          break;
        case 'delete':
        case 'backspace':
          if (root?.id !== menuState.node.id) {
            e.preventDefault();
            handleDeleteNode();
          }
          break;
        case 'escape':
          e.preventDefault();
          handleCloseMenu();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCanvasOpen, menuState, editingNodeId, root]);

  return (
    <div className={styles.container}>
      <div className={styles.ambientGlow} />

      <div className={styles.floatingNodes}>
        <div className={styles.floatingNode} style={{ top: '12%', left: '6%' }}>Brainstorm</div>
        <div className={styles.floatingNode} style={{ top: '20%', right: '10%' }}>Explore</div>
        <div className={styles.floatingNode} style={{ top: '45%', left: '3%' }}>Connect</div>
        <div className={styles.floatingNode} style={{ bottom: '25%', right: '5%' }}>Visualize</div>
        <div className={styles.floatingNode} style={{ bottom: '15%', left: '12%' }}>Discover</div>
        <div className={styles.nodeOrbit} style={{ top: '5%', left: '50%', transform: 'translateX(-50%)' }} />
        <div className={styles.nodeOrbit} style={{ bottom: '10%', right: '10%', width: '200px', height: '200px' }} />
      </div>

      <header className={styles.header}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5">
              <circle cx="12" cy="12" r="3" />
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
            </svg>
          </div>
          <span>Flows</span>
        </div>

        <nav className={styles.headerNav}>
          <span
            className={`${styles.navLink} ${activeTab === 'generate' ? styles.navLinkActive : ''}`}
            onClick={() => setActiveTab('generate')}
          >
            Generate
          </span>
          <span
            className={`${styles.navLink} ${activeTab === 'history' ? styles.navLinkActive : ''}`}
            onClick={() => setActiveTab('history')}
          >
            History
          </span>
        </nav>

        <div className={styles.headerActions}>
          <button
            className={styles.settingsButton}
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Open settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {activeTab === 'generate' && (
        <section className={styles.heroSection}>
          <h1 className={styles.welcomeText}>
            Hey there, <span className={styles.welcomeName}>explorer</span> ✨
          </h1>

          <p className={styles.heroSubtitle}>
            Yesterday we mapped the cosmos of machine learning. Last week, we explored the depths of sustainable energy.
            What rabbit hole are we diving into today?
          </p>

          <div className={styles.inputArea}>
            <div className={styles.inputWrapper}>
              <input
                type="text"
                placeholder="Type any topic and watch the magic unfold..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyPress={handleKeyPress}
                className={styles.promptInput}
                disabled={isLoading}
              />
              <button
                onClick={handleGenerate}
                disabled={isLoading || !prompt.trim()}
                className={styles.generateButton}
              >
                {isLoading ? (
                  <>
                    <span className={styles.spinner} />
                    Creating...
                  </>
                ) : (
                  "Let's Go"
                )}
              </button>
            </div>

            {error && (
              <div className={styles.error}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}
          </div>

          <div className={styles.buttonGroup}>
            <button className={styles.secondaryButton} onClick={() => setIsSettingsOpen(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
              </svg>
              Settings
            </button>
          </div>
        </section>
      )}

      {activeTab === 'history' && (
        <section className={styles.historySection}>
          <div className={styles.historyEmpty}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5" style={{ marginBottom: '20px' }}>
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <h3>Your journey begins here</h3>
            <p>
              Once you start creating mindmaps, they'll appear here like chapters in your exploration diary.
              Each map tells a story of curiosity and discovery.
            </p>
            <button
              className={styles.secondaryButton}
              onClick={() => setActiveTab('generate')}
              style={{ marginTop: '24px' }}
            >
              Create your first mindmap →
            </button>
          </div>
        </section>
      )}

      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        model={model}
        onModelChange={setModel}
      />

      <CanvasOverlay
        isOpen={isCanvasOpen}
        onClose={handleCloseCanvas}
        title={root?.title || 'Mindmap'}
        onExport={handleExport}
      >
        {root && (
          <Suspense fallback={<div className={styles.loadingCanvas}>Loading visualization...</div>}>
            <MindmapCanvas
              data={root}
              viewKey={viewKey}
              selectedNodeId={selectedNodeId}
              editingNodeId={editingNodeId}
              expandingNodeId={expandingNodeId}
              focusedNodeId={focusedNodeId}
              onNodeClick={handleNodeClick}
              onNodeTitleChange={handleNodeTitleChange}
              onEditComplete={handleEditComplete}
              onToggleCollapse={handleToggleCollapse}
              onNodeDoubleClick={handleNodeDoubleClick}
              isNodeInFocus={isNodeInFocus}
            />
          </Suspense>
        )}
      </CanvasOverlay>

      {menuState && isCanvasOpen && (
        <NodeContextMenu
          node={menuState.node}
          position={menuState.position}
          isRoot={root?.id === menuState.node.id}
          onClose={handleCloseMenu}
          onColorChange={handleColorChange}
          onAddBranch={handleAddBranch}
          onAddNotes={handleAddNotes}
          onOpenAIExpand={handleOpenAIExpand}
          onEditNode={handleEditNode}
          onRemoveStyles={handleRemoveStyles}
          onDeleteNode={handleDeleteNode}
        />
      )}

      {aiExpandModalState && isCanvasOpen && (
        <AIExpandBar
          node={aiExpandModalState.node}
          position={aiExpandModalState.position}
          onClose={handleCloseAIExpandModal}
          onExpand={handleAIExpand}
          isExpanding={expandingNodeId === aiExpandModalState.node.id}
        />
      )}

      {notesModalNode && (
        <NotesModal
          node={notesModalNode}
          onSave={handleSaveNotes}
          onClose={() => setNotesModalNode(null)}
        />
      )}

      {deleteConfirmNode && (
        <DeleteConfirmDialog
          node={deleteConfirmNode}
          descendantCount={getDescendantCount(deleteConfirmNode.id)}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteConfirmNode(null)}
        />
      )}
    </div>
  );
}

// Add this helper function at the end of the file or import it
function parseExpandedContent(markdown: string, parentLevel: number): MindmapNode[] {
  const lines = markdown.split('\n').filter(line => line.trim());
  const children: MindmapNode[] = [];
  let currentNode: MindmapNode | null = null;
  let nodeId = Date.now();

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (!match) continue;

    const hashes = match[1].length;
    const title = match[2].trim();

    if (hashes === 3) {
      // Sub-topic - direct child
      currentNode = {
        id: `expand-${nodeId++}`,
        title,
        level: parentLevel + 1,
        children: [],
      };
      children.push(currentNode);
    } else if (hashes === 4 && currentNode) {
      // Detail - grandchild
      currentNode.children.push({
        id: `expand-${nodeId++}`,
        title,
        level: parentLevel + 2,
        children: [],
      });
    }
  }

  return children;
}
