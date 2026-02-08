import React, { memo, useCallback, useMemo } from 'react';
import type { DiffChunk, SideBySideRow, DiffLine, WordSegment, ChunkDecision } from '../types';
import { buildSideBySideRows } from '../engine/diff';
import { highlightLine, type SyntaxSpan } from '../engine/syntax';
import { useVirtualScroll } from '../hooks/useVirtualScroll';

const ROW_HEIGHT = 22;

interface Props {
  chunks: DiffChunk[];
  contextLines: number;
  expandedRegions: Set<string>;
  onExpandRegion: (regionKey: string) => void;
  chunkDecisions: Record<string, ChunkDecision>;
  onChunkDecision: (chunkId: string, decision: ChunkDecision) => void;
  focusedChunkIndex: number;
  searchQuery: string;
  activeSearchIndex: number;
  wordWrap: boolean;
}

export const SideBySideView: React.FC<Props> = memo(({
  chunks,
  contextLines,
  expandedRegions,
  onExpandRegion,
  chunkDecisions,
  onChunkDecision,
  focusedChunkIndex,
  searchQuery,
  activeSearchIndex,
  wordWrap,
}) => {
  const rows = useMemo(
    () => buildSideBySideRows(chunks, contextLines, expandedRegions),
    [chunks, contextLines, expandedRegions]
  );
  const useVirtualization = !wordWrap;
  const [horizontalScroll, setHorizontalScroll] = React.useState(0);

  const { visibleRange, totalHeight, offsetY, containerRef, scrollTo } = useVirtualScroll(
    rows.length,
    ROW_HEIGHT,
  );

  // Find chunk boundaries for focused chunk scrolling
  const chunkStartRows = useMemo(() => {
    const starts: number[] = [];
    let lastChunkId = '';
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].chunkId !== lastChunkId) {
        starts.push(i);
        lastChunkId = rows[i].chunkId;
      }
    }
    return starts;
  }, [rows]);

  // Scroll to focused chunk
  React.useEffect(() => {
    if (useVirtualization && focusedChunkIndex >= 0 && focusedChunkIndex < chunkStartRows.length) {
      scrollTo(chunkStartRows[focusedChunkIndex]);
    }
  }, [focusedChunkIndex, chunkStartRows, scrollTo, useVirtualization]);

  const start = useVirtualization ? visibleRange.start : 0;
  const end = useVirtualization ? visibleRange.end : rows.length;
  const visibleRows = rows.slice(start, end);
  const leftScrollWidth = useMemo(() => {
    let maxLen = 0;
    for (const row of rows) {
      const len = row.left?.content?.length ?? 0;
      if (len > maxLen) maxLen = len;
    }
    return Math.max(240, maxLen * 8 + 120);
  }, [rows]);
  const rightScrollWidth = useMemo(() => {
    let maxLen = 0;
    for (const row of rows) {
      const len = row.right?.content?.length ?? 0;
      if (len > maxLen) maxLen = len;
    }
    return Math.max(240, maxLen * 8 + 120);
  }, [rows]);
  const maxHorizontalScroll = Math.max(0, leftScrollWidth, rightScrollWidth);
  React.useEffect(() => {
    setHorizontalScroll(prev => Math.min(prev, maxHorizontalScroll));
  }, [maxHorizontalScroll]);
  const applyHorizontalScroll = useCallback((delta: number) => {
    setHorizontalScroll(prev => Math.max(0, Math.min(maxHorizontalScroll, prev + delta)));
  }, [maxHorizontalScroll]);
  const searchMatchRows = useMemo(() => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    const rowsWithCounts: Array<{ rowIndex: number; count: number }> = [];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      let count = 0;
      if (row.left && row.left.content.toLowerCase().includes(q)) count++;
      if (row.right && row.right !== row.left && row.right.content.toLowerCase().includes(q)) count++;
      if (count > 0) rowsWithCounts.push({ rowIndex, count });
    }
    return rowsWithCounts;
  }, [rows, searchQuery]);
  const activeSearchRowIndex = useMemo(() => {
    if (!searchQuery || searchMatchRows.length === 0) return -1;
    const total = searchMatchRows.reduce((sum, m) => sum + m.count, 0);
    let target = ((activeSearchIndex % total) + total) % total;
    for (const match of searchMatchRows) {
      if (target < match.count) return match.rowIndex;
      target -= match.count;
    }
    return searchMatchRows[0].rowIndex;
  }, [searchQuery, searchMatchRows, activeSearchIndex]);

  React.useEffect(() => {
    if (!searchQuery || searchMatchRows.length === 0 || !useVirtualization) return;
    if (activeSearchRowIndex >= 0) scrollTo(activeSearchRowIndex);
  }, [searchQuery, searchMatchRows, activeSearchRowIndex, useVirtualization, scrollTo]);

  return (
    <div className="side-by-side-shell">
      <div
        ref={containerRef}
        className="diff-scroll-container"
        style={{ overflow: 'auto', height: '100%', position: 'relative' }}
      >
        {useVirtualization ? (
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div style={{ transform: `translateY(${offsetY}px)` }}>
              {visibleRows.map((row, i) => (
                <SideBySideRowComponent
                  key={start + i}
                  row={row}
                  rowIndex={start + i}
                  decision={chunkDecisions[row.chunkId] || 'pending'}
                  onDecision={onChunkDecision}
                  onExpandRegion={onExpandRegion}
                  searchQuery={searchQuery}
                  wordWrap={wordWrap}
                  horizontalScroll={horizontalScroll}
                  onHorizontalScrollDelta={applyHorizontalScroll}
                  isActiveSearchRow={start + i === activeSearchRowIndex}
                  isFocusedChunk={chunkStartRows[focusedChunkIndex] !== undefined &&
                    row.chunkId === rows[chunkStartRows[focusedChunkIndex]]?.chunkId}
                />
              ))}
            </div>
          </div>
        ) : (
          <div>
            {visibleRows.map((row, i) => (
              <SideBySideRowComponent
                key={start + i}
                row={row}
                rowIndex={start + i}
                decision={chunkDecisions[row.chunkId] || 'pending'}
                onDecision={onChunkDecision}
                onExpandRegion={onExpandRegion}
                searchQuery={searchQuery}
                wordWrap={wordWrap}
                horizontalScroll={horizontalScroll}
                onHorizontalScrollDelta={applyHorizontalScroll}
                isActiveSearchRow={start + i === activeSearchRowIndex}
                isFocusedChunk={chunkStartRows[focusedChunkIndex] !== undefined &&
                  row.chunkId === rows[chunkStartRows[focusedChunkIndex]]?.chunkId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

SideBySideView.displayName = 'SideBySideView';

// ── Row component ────────────────────────────────────────────────

interface RowProps {
  row: SideBySideRow;
  rowIndex: number;
  decision: ChunkDecision;
  onDecision: (chunkId: string, decision: ChunkDecision) => void;
  onExpandRegion: (regionKey: string) => void;
  searchQuery: string;
  wordWrap: boolean;
  horizontalScroll: number;
  onHorizontalScrollDelta: (delta: number) => void;
  isActiveSearchRow: boolean;
  isFocusedChunk: boolean;
}

const SideBySideRowComponent: React.FC<RowProps> = memo(({
  row,
  decision,
  onDecision,
  onExpandRegion,
  searchQuery,
  wordWrap,
  horizontalScroll,
  onHorizontalScrollDelta,
  isActiveSearchRow,
  isFocusedChunk,
}) => {
  const handleAccept = useCallback(() => {
    onDecision(row.chunkId, decision === 'accepted' ? 'pending' : 'accepted');
  }, [row.chunkId, decision, onDecision]);

  const handleReject = useCallback(() => {
    onDecision(row.chunkId, decision === 'rejected' ? 'pending' : 'rejected');
  }, [row.chunkId, decision, onDecision]);

  if (row.isCollapsedPlaceholder) {
    return (
      <div className="diff-row collapsed-row" style={{ height: ROW_HEIGHT }}>
        <button
          className="expand-button"
          onClick={() => onExpandRegion(`${row.chunkId}-${row.collapsedStart}`)}
        >
          <span className="expand-icon">&#x25B6;</span>
          {row.collapsedCount} unchanged lines
        </button>
      </div>
    );
  }

  const leftType = row.left?.type || 'empty';
  const rightType = row.right?.type || 'empty';
  const showGutter = row.isFirstInChunk && (leftType !== 'unchanged' || rightType !== 'unchanged');
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (wordWrap) return;
    const horizontal = Math.abs(e.deltaX) > 0 ? e.deltaX : (e.shiftKey ? e.deltaY : 0);
    if (!horizontal) return;
    e.preventDefault();
    onHorizontalScrollDelta(horizontal);
  }, [wordWrap, onHorizontalScrollDelta]);

  return (
    <div
      className={`diff-row side-by-side-row ${wordWrap ? 'word-wrap-row' : ''} ${isFocusedChunk ? 'focused-chunk' : ''} ${decision !== 'pending' ? `decision-${decision}` : ''}`}
      data-search-active={isActiveSearchRow ? 'true' : undefined}
      style={wordWrap ? undefined : { height: ROW_HEIGHT }}
    >
      {/* Chunk action gutter */}
      <div className="chunk-gutter">
        {showGutter && (
          <div className="chunk-actions">
            <button
              className={`chunk-btn accept-btn ${decision === 'accepted' ? 'active' : ''}`}
              onClick={handleAccept}
              title="Accept change (a)"
            >
              &#x2713;
            </button>
            <button
              className={`chunk-btn reject-btn ${decision === 'rejected' ? 'active' : ''}`}
              onClick={handleReject}
              title="Reject change (x)"
            >
              &#x2717;
            </button>
          </div>
        )}
      </div>

      {/* Left side (old) */}
      <div className={`diff-cell left-cell ${leftType}`}>
        <span className="line-number">
          {row.left?.oldLineNumber ?? ''}
        </span>
        <span className={`line-content ${wordWrap ? 'word-wrap' : 'column-scroll'}`} onWheel={handleWheel}>
          <span
            className={!wordWrap ? 'line-content-inner' : undefined}
            style={!wordWrap ? ({ '--column-scroll': `${horizontalScroll}px` } as React.CSSProperties) : undefined}
          >
            {row.left ? (
              <LineContent line={row.left} searchQuery={searchQuery} side="old" />
            ) : null}
          </span>
        </span>
      </div>

      {/* Divider */}
      <div className="side-divider" />

      {/* Right side (new) */}
      <div className={`diff-cell right-cell ${rightType}`}>
        <span className="line-number">
          {row.right?.newLineNumber ?? ''}
        </span>
        <span className={`line-content ${wordWrap ? 'word-wrap' : 'column-scroll'}`} onWheel={handleWheel}>
          <span
            className={!wordWrap ? 'line-content-inner' : undefined}
            style={!wordWrap ? ({ '--column-scroll': `${horizontalScroll}px` } as React.CSSProperties) : undefined}
          >
            {row.right ? (
              <LineContent line={row.right} searchQuery={searchQuery} side="new" />
            ) : null}
          </span>
        </span>
      </div>
    </div>
  );
});

SideBySideRowComponent.displayName = 'SideBySideRowComponent';

// ── Line content with syntax + word-level highlighting ───────────

interface LineContentProps {
  line: DiffLine;
  searchQuery: string;
  side: 'old' | 'new';
}

const LineContent: React.FC<LineContentProps> = memo(({ line, searchQuery, side }) => {
  if (line.wordSegments && line.wordSegments.length > 0) {
    return <WordDiffContent segments={line.wordSegments} searchQuery={searchQuery} side={side} />;
  }

  // Use syntax highlighting for unchanged lines, plain for changed
  if (line.type === 'unchanged') {
    const spans = highlightLine(line.content);
    return <SyntaxContent spans={spans} searchQuery={searchQuery} />;
  }

  // For added/removed without word segments, still apply syntax highlighting
  const spans = highlightLine(line.content);
  return <SyntaxContent spans={spans} searchQuery={searchQuery} />;
});

LineContent.displayName = 'LineContent';

// ── Word diff rendering ──────────────────────────────────────────

interface WordDiffProps {
  segments: WordSegment[];
  searchQuery: string;
  side: 'old' | 'new';
}

const WordDiffContent: React.FC<WordDiffProps> = memo(({ segments, searchQuery, side }) => {
  return (
    <>
      {segments.map((seg, i) => {
        // On old side, show 'removed' and 'unchanged'; on new side, show 'added' and 'unchanged'
        if (side === 'old' && seg.type === 'added') return null;
        if (side === 'new' && seg.type === 'removed') return null;

        const className = seg.type === 'unchanged' ? '' :
          seg.type === 'added' ? 'word-added' : 'word-removed';

        if (searchQuery && seg.text.toLowerCase().includes(searchQuery.toLowerCase())) {
          return (
            <span key={i} className={className}>
              {highlightSearch(seg.text, searchQuery)}
            </span>
          );
        }

        return <span key={i} className={className}>{seg.text}</span>;
      })}
    </>
  );
});

WordDiffContent.displayName = 'WordDiffContent';

// ── Syntax-highlighted content ───────────────────────────────────

interface SyntaxContentProps {
  spans: SyntaxSpan[];
  searchQuery: string;
}

const SyntaxContent: React.FC<SyntaxContentProps> = memo(({ spans, searchQuery }) => {
  return (
    <>
      {spans.map((span, i) => {
        if (searchQuery && span.text.toLowerCase().includes(searchQuery.toLowerCase())) {
          return (
            <span key={i} className={span.className}>
              {highlightSearch(span.text, searchQuery)}
            </span>
          );
        }
        return <span key={i} className={span.className}>{span.text}</span>;
      })}
    </>
  );
});

SyntaxContent.displayName = 'SyntaxContent';

// ── Search highlight helper ──────────────────────────────────────

function highlightSearch(text: string, query: string): React.ReactNode[] {
  if (!query) return [text];
  const parts: React.ReactNode[] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let lastIndex = 0;

  let idx = lowerText.indexOf(lowerQuery, lastIndex);
  while (idx !== -1) {
    if (idx > lastIndex) {
      parts.push(text.slice(lastIndex, idx));
    }
    parts.push(
      <mark key={idx} className="search-highlight">
        {text.slice(idx, idx + query.length)}
      </mark>
    );
    lastIndex = idx + query.length;
    idx = lowerText.indexOf(lowerQuery, lastIndex);
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
