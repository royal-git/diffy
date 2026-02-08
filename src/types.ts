// ── Core diff types ──────────────────────────────────────────────

export type DiffLineType = 'added' | 'removed' | 'unchanged';

export interface WordSegment {
  text: string;
  type: 'added' | 'removed' | 'unchanged';
}

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
  wordSegments?: WordSegment[];
}

export interface DiffChunk {
  oldStart: number;
  oldLength: number;
  newStart: number;
  newLength: number;
  lines: DiffLine[];
  id: string;
}

export interface FileDiff {
  oldPath: string;
  newPath: string;
  chunks: DiffChunk[];
  type: 'modified' | 'added' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
}

// ── Side-by-side row types ───────────────────────────────────────

export interface SideBySideRow {
  left: DiffLine | null;
  right: DiffLine | null;
  chunkId: string;
  isFirstInChunk: boolean;
  isCollapsedPlaceholder?: boolean;
  collapsedCount?: number;
  collapsedStart?: number;
}

// ── View state ───────────────────────────────────────────────────

export type ViewMode = 'side-by-side' | 'unified';
export type ThemeMode = string;
export type ChunkDecision = 'accepted' | 'rejected' | 'pending';

export interface DiffViewState {
  files: FileDiff[];
  activeFileIndex: number;
  viewMode: ViewMode;
  theme: ThemeMode;
  searchQuery: string;
  searchResults: SearchMatch[];
  activeSearchIndex: number;
  chunkDecisions: Record<string, ChunkDecision>;
  expandedRegions: Set<string>;
  contextLines: number;
  wordWrap: boolean;
  showFileTree: boolean;
  focusedChunkIndex: number;
}

export interface SearchMatch {
  fileIndex: number;
  lineIndex: number;
  columnStart: number;
  columnEnd: number;
}
