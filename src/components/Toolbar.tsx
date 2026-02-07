import React, { memo, useRef, useEffect } from 'react';
import type { ViewMode, ThemeMode, FileDiff, ChunkDecision } from '../types';

interface Props {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  showFileTree: boolean;
  onToggleFileTree: () => void;
  wordWrap: boolean;
  onToggleWordWrap: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchOpen: boolean;
  onSearchOpen: () => void;
  onSearchClose: () => void;
  onNextSearchResult: () => void;
  onPrevSearchResult: () => void;
  searchResultCount: number;
  activeSearchIndex: number;
  activeFile: FileDiff | null;
  chunkDecisions: Record<string, ChunkDecision>;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onResetAll: () => void;
}

export const Toolbar: React.FC<Props> = memo(({
  viewMode,
  onViewModeChange,
  theme,
  onThemeChange,
  showFileTree,
  onToggleFileTree,
  wordWrap,
  onToggleWordWrap,
  searchQuery,
  onSearchChange,
  searchOpen,
  onSearchOpen,
  onSearchClose,
  onNextSearchResult,
  onPrevSearchResult,
  searchResultCount,
  activeSearchIndex,
  activeFile,
  chunkDecisions,
  onAcceptAll,
  onRejectAll,
  onResetAll,
}) => {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen && searchRef.current) {
      searchRef.current.focus();
      searchRef.current.select();
    }
  }, [searchOpen]);

  const fileStats = activeFile ? {
    additions: activeFile.additions,
    deletions: activeFile.deletions,
    chunks: activeFile.chunks.length,
    decided: activeFile.chunks.filter(c => chunkDecisions[c.id] && chunkDecisions[c.id] !== 'pending').length,
  } : null;

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <button
          className={`toolbar-btn icon-btn ${showFileTree ? 'active' : ''}`}
          onClick={onToggleFileTree}
          title="Toggle file tree (b)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 2h14v2H1zM1 7h10v2H1zM1 12h12v2H1z" />
          </svg>
        </button>

        <div className="toolbar-separator" />

        <div className="view-toggle">
          <button
            className={`toolbar-btn ${viewMode === 'side-by-side' ? 'active' : ''}`}
            onClick={() => onViewModeChange('side-by-side')}
            title="Side-by-side view (v)"
          >
            Side by Side
          </button>
          <button
            className={`toolbar-btn ${viewMode === 'unified' ? 'active' : ''}`}
            onClick={() => onViewModeChange('unified')}
            title="Unified view (v)"
          >
            Unified
          </button>
        </div>

        <div className="toolbar-separator" />

        <button
          className={`toolbar-btn ${wordWrap ? 'active' : ''}`}
          onClick={onToggleWordWrap}
          title="Toggle word wrap"
        >
          Wrap
        </button>
      </div>

      <div className="toolbar-center">
        {activeFile && (
          <div className="file-info">
            <span className="file-path">{activeFile.newPath}</span>
            {fileStats && (
              <span className="file-stats-bar">
                <span className="stat-added">+{fileStats.additions}</span>
                <span className="stat-removed">-{fileStats.deletions}</span>
                <span className="stat-progress-bar">
                  <span
                    className="stat-progress-fill"
                    style={{ width: `${fileStats.chunks > 0 ? (fileStats.decided / fileStats.chunks) * 100 : 0}%` }}
                  />
                </span>
                <span className="stat-reviewed">{fileStats.decided}/{fileStats.chunks}</span>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="toolbar-right">
        {searchOpen ? (
          <div className="search-bar">
            <input
              ref={searchRef}
              className="search-input"
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') onSearchClose();
                if (e.key === 'Enter') {
                  e.shiftKey ? onPrevSearchResult() : onNextSearchResult();
                }
              }}
            />
            {searchQuery && (
              <span className="search-count">
                {searchResultCount > 0 ? `${activeSearchIndex + 1}/${searchResultCount}` : 'No results'}
              </span>
            )}
            <button className="toolbar-btn icon-btn" onClick={onPrevSearchResult} title="Previous (Shift+Enter)">
              &#x25B2;
            </button>
            <button className="toolbar-btn icon-btn" onClick={onNextSearchResult} title="Next (Enter)">
              &#x25BC;
            </button>
            <button className="toolbar-btn icon-btn" onClick={onSearchClose} title="Close (Escape)">
              &#x2715;
            </button>
          </div>
        ) : (
          <button className="toolbar-btn icon-btn" onClick={onSearchOpen} title="Search (Ctrl+F)">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85zm-5.442.156a5 5 0 110-10 5 5 0 010 10z" />
            </svg>
          </button>
        )}

        <div className="toolbar-separator" />

        <div className="bulk-actions">
          <button className="toolbar-btn accept-all-btn" onClick={onAcceptAll} title="Accept all changes">
            &#x2713; All
          </button>
          <button className="toolbar-btn reject-all-btn" onClick={onRejectAll} title="Reject all changes">
            &#x2717; All
          </button>
          <button className="toolbar-btn" onClick={onResetAll} title="Reset all decisions">
            Reset
          </button>
        </div>

        <div className="toolbar-separator" />

        <button
          className="toolbar-btn icon-btn"
          onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
          title="Toggle theme (t)"
        >
          {theme === 'dark' ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a.5.5 0 01.5.5v1a.5.5 0 01-1 0v-1A.5.5 0 018 1zm0 10a3 3 0 100-6 3 3 0 000 6zm6.5-2.5a.5.5 0 010-1h1a.5.5 0 010 1h-1zm-13 0a.5.5 0 010-1h1a.5.5 0 010 1h-1z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M6 .278a.768.768 0 01.08.858 7.208 7.208 0 00-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 01.81.316.733.733 0 01-.031.893A8.349 8.349 0 018.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 016 .278z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
});

Toolbar.displayName = 'Toolbar';
