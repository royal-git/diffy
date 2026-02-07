import { useEffect, useCallback } from 'react';

export interface KeyboardActions {
  nextChunk: () => void;
  prevChunk: () => void;
  nextFile: () => void;
  prevFile: () => void;
  acceptChunk: () => void;
  rejectChunk: () => void;
  toggleView: () => void;
  toggleFileTree: () => void;
  toggleTheme: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  nextSearchResult: () => void;
  prevSearchResult: () => void;
  acceptAll: () => void;
  rejectAll: () => void;
}

export function useKeyboard(actions: KeyboardActions, enabled: boolean = true) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    // Don't intercept when typing in input fields
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      // Still handle Escape in inputs
      if (e.key === 'Escape') {
        actions.closeSearch();
        (target as HTMLInputElement).blur();
        e.preventDefault();
      }
      // Handle Enter / Shift+Enter in search
      if (e.key === 'Enter' && target.classList.contains('search-input')) {
        e.preventDefault();
        if (e.shiftKey) {
          actions.prevSearchResult();
        } else {
          actions.nextSearchResult();
        }
      }
      return;
    }

    // Navigation
    switch (e.key) {
      case 'n':
        e.preventDefault();
        if (e.shiftKey) actions.prevChunk();
        else actions.nextChunk();
        break;
      case 'j':
      case 'ArrowDown':
        if (e.altKey) {
          e.preventDefault();
          actions.nextChunk();
        }
        break;
      case 'k':
      case 'ArrowUp':
        if (e.altKey) {
          e.preventDefault();
          actions.prevChunk();
        }
        break;
      case ']':
        e.preventDefault();
        actions.nextFile();
        break;
      case '[':
        e.preventDefault();
        actions.prevFile();
        break;

      // Chunk actions
      case 'a':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (e.shiftKey) actions.acceptAll();
          else actions.acceptChunk();
        } else {
          e.preventDefault();
          actions.acceptChunk();
        }
        break;
      case 'x':
        e.preventDefault();
        actions.rejectChunk();
        break;

      // View toggles
      case 'v':
        e.preventDefault();
        actions.toggleView();
        break;
      case 'b':
        e.preventDefault();
        actions.toggleFileTree();
        break;
      case 't':
        e.preventDefault();
        actions.toggleTheme();
        break;

      // Search
      case '/':
      case 'f':
        if (e.key === 'f' && !(e.ctrlKey || e.metaKey)) break;
        e.preventDefault();
        actions.openSearch();
        break;
      case 'Escape':
        actions.closeSearch();
        break;
    }
  }, [actions, enabled]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
