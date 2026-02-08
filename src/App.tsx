import React, { useState, useCallback, useMemo } from 'react';
import type { FileDiff, ViewMode, ThemeMode, ChunkDecision } from './types';
import { parseUnifiedDiff } from './engine/diff';
import { Toolbar } from './components/Toolbar';
import { FileTree } from './components/FileTree';
import { DiffViewer } from './components/DiffViewer';
import { useKeyboard } from './hooks/useKeyboard';
import { allowedThemes } from './themes';

export default function App() {
  const getInitialTheme = (): ThemeMode => {
    if (typeof window === 'undefined') return 'dark';

    const fromDom = document.documentElement.getAttribute('data-theme');
    if (allowedThemes.includes(fromDom as ThemeMode)) {
      return fromDom as ThemeMode;
    }

    try {
      const stored = window.localStorage.getItem('diffy-theme');
      return allowedThemes.includes(stored as ThemeMode) ? (stored as ThemeMode) : 'dark';
    } catch {
      return 'dark';
    }
  };

  // ── Core state ───────────────────────────────────────────────
  const [files, setFiles] = useState<FileDiff[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [themeHydrated, setThemeHydrated] = useState<boolean>(() => !Boolean(window.desktopBridge?.getThemePreference));
  const [showFileTree, setShowFileTree] = useState(true);
  const [wordWrap, setWordWrap] = useState(false);
  const [contextLines] = useState(3);

  // ── Search state ─────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);

  // ── Chunk decisions ──────────────────────────────────────────
  const [chunkDecisions, setChunkDecisions] = useState<Record<string, ChunkDecision>>({});
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
  const [focusedChunkIndex, setFocusedChunkIndex] = useState(0);
  const [currentRepoTarget, setCurrentRepoTarget] = useState<{ repoPath: string; baseRef?: string | null; headRef?: string | null } | null>(null);
  const [emptyStateMessage, setEmptyStateMessage] = useState('No diff loaded.');

  const logEvent = useCallback((level: string, message: string, meta?: unknown) => {
    if (!window.desktopBridge?.logEvent) return;
    void window.desktopBridge.logEvent(level, message, meta);
  }, []);

  // ── Derived state ────────────────────────────────────────────
  const activeFile = files[activeFileIndex] || null;
  const hasFiles = files.length > 0;

  const allChunkIds = useMemo(() => {
    if (!activeFile) return [];
    return activeFile.chunks.map(c => c.id);
  }, [activeFile]);
  const activeChunkCount = allChunkIds.length;

  // Search results count (simple: count lines matching query in active file)
  const searchResultCount = useMemo(() => {
    if (!searchQuery || !activeFile) return 0;
    const q = searchQuery.toLowerCase();
    let count = 0;
    for (const chunk of activeFile.chunks) {
      for (const line of chunk.lines) {
        if (line.content.toLowerCase().includes(q)) count++;
      }
    }
    return count;
  }, [searchQuery, activeFile]);

  // ── Load handlers ───────────────────────────────────────────
  const applyParsedFiles = useCallback((parsed: FileDiff[]) => {
    if (parsed.length === 0) return;
    setFiles(parsed);
    setActiveFileIndex(0);
    setChunkDecisions({});
    setExpandedRegions(new Set());
    setFocusedChunkIndex(0);
  }, []);

  const loadRepositoryDiff = useCallback(async (
    repoPath: string,
    baseRef?: string | null,
    headRef?: string | null
  ) => {
    if (!window.desktopBridge) {
      setEmptyStateMessage('Desktop bridge is unavailable.');
      return;
    }
    try {
      const diffText = await window.desktopBridge.getRepositoryDiff(repoPath, baseRef, headRef);
      setCurrentRepoTarget({ repoPath, baseRef: baseRef || null, headRef: headRef || null });
      if (!diffText.trim()) {
        setFiles([]);
        setEmptyStateMessage('No tracked changes found for this repository/ref.');
        return;
      }

      const parsed = parseUnifiedDiff(diffText);
      if (parsed.length === 0) {
        setFiles([]);
        setEmptyStateMessage('Git returned diff text, but it could not be parsed.');
        return;
      }
      setEmptyStateMessage('');
      applyParsedFiles(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load git diff.';
      setFiles([]);
      setEmptyStateMessage(message);
    }
  }, [applyParsedFiles]);

  const handlePickRepository = useCallback(async () => {
    if (!window.desktopBridge) return;
    const repoPath = await window.desktopBridge.pickRepository();
    if (!repoPath) return;
    await loadRepositoryDiff(repoPath);
  }, [loadRepositoryDiff]);

  React.useEffect(() => {
    if (!window.desktopBridge) return;
    window.desktopBridge.getInitialRepository().then(async initial => {
      if (!initial?.repoPath) {
        setEmptyStateMessage('Run `diffy` from inside a git repository.');
        return;
      }
      try {
        await loadRepositoryDiff(initial.repoPath, initial.baseRef, initial.headRef);
      } catch (error) {
        const details = initial.baseRef && initial.headRef
          ? ` (${initial.baseRef}...${initial.headRef})`
          : '';
        const message = error instanceof Error ? error.message : 'Unknown error';
        setEmptyStateMessage(`Failed to load repository diff${details}: ${message}`);
      }
    });
  }, [loadRepositoryDiff]);

  // ── Chunk decision handlers ──────────────────────────────────
  const handleChunkDecision = useCallback((chunkId: string, decision: ChunkDecision) => {
    setChunkDecisions(prev => ({ ...prev, [chunkId]: decision }));
  }, []);

  const handleAcceptAll = useCallback(() => {
    if (!activeFile) return;
    setChunkDecisions(prev => {
      const next = { ...prev };
      for (const chunk of activeFile.chunks) {
        next[chunk.id] = 'accepted';
      }
      return next;
    });
  }, [activeFile]);

  const handleRejectAll = useCallback(() => {
    if (!activeFile) return;
    setChunkDecisions(prev => {
      const next = { ...prev };
      for (const chunk of activeFile.chunks) {
        next[chunk.id] = 'rejected';
      }
      return next;
    });
  }, [activeFile]);

  const handleResetAll = useCallback(() => {
    if (!activeFile) return;
    setChunkDecisions(prev => {
      const next = { ...prev };
      for (const chunk of activeFile.chunks) {
        delete next[chunk.id];
      }
      return next;
    });
  }, [activeFile]);

  const handleExpandRegion = useCallback((regionKey: string) => {
    setExpandedRegions(prev => {
      const next = new Set(prev);
      next.add(regionKey);
      return next;
    });
  }, []);

  // ── Navigation ───────────────────────────────────────────────
  const nextChunk = useCallback(() => {
    setFocusedChunkIndex(prev => Math.min(prev + 1, allChunkIds.length - 1));
  }, [allChunkIds.length]);

  const prevChunk = useCallback(() => {
    setFocusedChunkIndex(prev => Math.max(prev - 1, 0));
  }, []);

  const nextFile = useCallback(() => {
    setActiveFileIndex(prev => {
      const next = Math.min(prev + 1, files.length - 1);
      setFocusedChunkIndex(0);
      return next;
    });
  }, [files.length]);

  const prevFile = useCallback(() => {
    setActiveFileIndex(prev => {
      const next = Math.max(prev - 1, 0);
      setFocusedChunkIndex(0);
      return next;
    });
  }, []);

  const acceptCurrentChunk = useCallback(() => {
    const chunkId = allChunkIds[focusedChunkIndex];
    if (chunkId) {
      const current = chunkDecisions[chunkId] || 'pending';
      handleChunkDecision(chunkId, current === 'accepted' ? 'pending' : 'accepted');
    }
  }, [allChunkIds, focusedChunkIndex, chunkDecisions, handleChunkDecision]);

  const rejectCurrentChunk = useCallback(() => {
    const chunkId = allChunkIds[focusedChunkIndex];
    if (chunkId) {
      const current = chunkDecisions[chunkId] || 'pending';
      handleChunkDecision(chunkId, current === 'rejected' ? 'pending' : 'rejected');
    }
  }, [allChunkIds, focusedChunkIndex, chunkDecisions, handleChunkDecision]);

  // ── Keyboard shortcuts ───────────────────────────────────────
  useKeyboard({
    nextChunk,
    prevChunk,
    nextFile,
    prevFile,
    acceptChunk: acceptCurrentChunk,
    rejectChunk: rejectCurrentChunk,
    toggleView: () => setViewMode(v => v === 'side-by-side' ? 'unified' : 'side-by-side'),
    toggleFileTree: () => setShowFileTree(v => !v),
    toggleTheme: () => setTheme(t => t === 'dark' ? 'light' : 'dark'),
    openSearch: () => setSearchOpen(true),
    closeSearch: () => { setSearchOpen(false); setSearchQuery(''); },
    nextSearchResult: () => setActiveSearchIndex(prev => (prev + 1) % Math.max(1, searchResultCount)),
    prevSearchResult: () => setActiveSearchIndex(prev => (prev - 1 + Math.max(1, searchResultCount)) % Math.max(1, searchResultCount)),
    acceptAll: handleAcceptAll,
    rejectAll: handleRejectAll,
  }, hasFiles);

  // ── Apply theme ──────────────────────────────────────────────
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (!themeHydrated) return;
    try {
      window.localStorage.setItem('diffy-theme', theme);
    } catch {
      // Ignore storage failures; theme still applies to current window.
    }
    if (window.desktopBridge?.setThemePreference) {
      void window.desktopBridge.setThemePreference(theme);
    }
    logEvent('info', 'Theme applied', { theme });
  }, [theme, themeHydrated, logEvent]);

  React.useEffect(() => {
    if (!window.desktopBridge?.getThemePreference) {
      setThemeHydrated(true);
      return;
    }
    window.desktopBridge.getThemePreference().then(storedTheme => {
      if (storedTheme && allowedThemes.includes(storedTheme as ThemeMode)) {
        setTheme(storedTheme as ThemeMode);
      }
    }).catch(() => {
      // Ignore preference lookup errors.
    }).finally(() => {
      setThemeHydrated(true);
    });
  }, []);

  React.useEffect(() => {
    const onError = (event: ErrorEvent) => {
      logEvent('error', 'Renderer window error', {
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      logEvent('error', 'Renderer unhandled rejection', {
        reason: String(event.reason),
      });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    logEvent('info', 'Renderer mounted');
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [logEvent]);

  const handleReload = useCallback(() => {
    if (currentRepoTarget) {
      void loadRepositoryDiff(
        currentRepoTarget.repoPath,
        currentRepoTarget.baseRef || null,
        currentRepoTarget.headRef || null
      );
      return;
    }
    void handlePickRepository();
  }, [currentRepoTarget, loadRepositoryDiff, handlePickRepository]);

  // ── Render ───────────────────────────────────────────────────
  if (!hasFiles) {
    return (
      <div className="app" data-theme={theme}>
        <div className="diff-empty">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            <p>{emptyStateMessage}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="toolbar-btn" onClick={handleReload}>
                Reload
              </button>
              {window.desktopBridge && (
                <button className="toolbar-btn" onClick={handlePickRepository}>
                  Open Repository
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app" data-theme={theme}>
      <Toolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        theme={theme}
        onThemeChange={setTheme}
        showFileTree={showFileTree}
        onToggleFileTree={() => setShowFileTree(v => !v)}
        wordWrap={wordWrap}
        onToggleWordWrap={() => setWordWrap(v => !v)}
        searchQuery={searchQuery}
        onSearchChange={q => { setSearchQuery(q); setActiveSearchIndex(0); }}
        searchOpen={searchOpen}
        onSearchOpen={() => setSearchOpen(true)}
        onSearchClose={() => { setSearchOpen(false); setSearchQuery(''); }}
        onNextSearchResult={() => setActiveSearchIndex(prev => (prev + 1) % Math.max(1, searchResultCount))}
        onPrevSearchResult={() => setActiveSearchIndex(prev => (prev - 1 + Math.max(1, searchResultCount)) % Math.max(1, searchResultCount))}
        searchResultCount={searchResultCount}
        activeSearchIndex={activeSearchIndex}
        activeFile={activeFile}
        chunkDecisions={chunkDecisions}
        onAcceptAll={handleAcceptAll}
        onRejectAll={handleRejectAll}
        onResetAll={handleResetAll}
      />

      <div className="main-content">
        {showFileTree && files.length > 0 && (
          <FileTree
            files={files}
            activeIndex={activeFileIndex}
            onSelectFile={idx => { setActiveFileIndex(idx); setFocusedChunkIndex(0); }}
            chunkDecisions={chunkDecisions}
          />
        )}

        <div className="diff-panel">
          <div className="diff-panel-header">
            <button className="back-btn" onClick={handleReload} title="Reload current diff">
              &#x21BB; Reload
            </button>
            {files.length > 1 && (
              <div className="file-nav">
                <button
                  className="toolbar-btn icon-btn"
                  onClick={prevFile}
                  disabled={activeFileIndex === 0}
                >
                  &#x25C0;
                </button>
                <span className="file-nav-label">
                  {activeFileIndex + 1} / {files.length}
                </span>
                <button
                  className="toolbar-btn icon-btn"
                  onClick={nextFile}
                  disabled={activeFileIndex === files.length - 1}
                >
                  &#x25B6;
                </button>
              </div>
            )}
            {activeChunkCount > 0 ? (
              <div className="chunk-nav">
                <button
                  className="toolbar-btn"
                  onClick={prevChunk}
                  disabled={focusedChunkIndex === 0}
                  title="Previous change (N)"
                >
                  &#x25B2; Prev
                </button>
                <span className="chunk-nav-label">
                  Change {focusedChunkIndex + 1} / {activeChunkCount}
                </span>
                <button
                  className="toolbar-btn"
                  onClick={nextChunk}
                  disabled={focusedChunkIndex >= activeChunkCount - 1}
                  title="Next change (n)"
                >
                  Next &#x25BC;
                </button>
              </div>
            ) : (
              <div className="chunk-nav">
                <span className="chunk-nav-label">No text hunks</span>
              </div>
            )}
          </div>

          {activeFile && (
            <DiffViewer
              file={activeFile}
              repoPath={currentRepoTarget?.repoPath ?? null}
              baseRef={currentRepoTarget?.baseRef ?? null}
              headRef={currentRepoTarget?.headRef ?? null}
              viewMode={viewMode}
              contextLines={contextLines}
              expandedRegions={expandedRegions}
              onExpandRegion={handleExpandRegion}
              chunkDecisions={chunkDecisions}
              onChunkDecision={handleChunkDecision}
              focusedChunkIndex={focusedChunkIndex}
              searchQuery={searchQuery}
              activeSearchIndex={activeSearchIndex}
              wordWrap={wordWrap}
            />
          )}
        </div>
      </div>
    </div>
  );
}
