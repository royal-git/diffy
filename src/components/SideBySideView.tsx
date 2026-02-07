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
  wordWrap,
}) => {
  const rows = useMemo(
    () => buildSideBySideRows(chunks, contextLines, expandedRegions),
    [chunks, contextLines, expandedRegions]
  );

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
    if (focusedChunkIndex >= 0 && focusedChunkIndex < chunkStartRows.length) {
      scrollTo(chunkStartRows[focusedChunkIndex]);
    }
  }, [focusedChunkIndex, chunkStartRows, scrollTo]);

  const visibleRows = rows.slice(visibleRange.start, visibleRange.end);

  return (
    <div
      ref={containerRef}
      className="diff-scroll-container"
      style={{ overflow: 'auto', height: '100%', position: 'relative' }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleRows.map((row, i) => (
            <SideBySideRowComponent
              key={visibleRange.start + i}
              row={row}
              rowIndex={visibleRange.start + i}
              decision={chunkDecisions[row.chunkId] || 'pending'}
              onDecision={onChunkDecision}
              onExpandRegion={onExpandRegion}
              searchQuery={searchQuery}
              wordWrap={wordWrap}
              isFocusedChunk={chunkStartRows[focusedChunkIndex] !== undefined &&
                row.chunkId === rows[chunkStartRows[focusedChunkIndex]]?.chunkId}
            />
          ))}
        </div>
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
  isFocusedChunk: boolean;
}

const SideBySideRowComponent: React.FC<RowProps> = memo(({
  row,
  decision,
  onDecision,
  onExpandRegion,
  searchQuery,
  wordWrap,
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

  return (
    <div
      className={`diff-row side-by-side-row ${isFocusedChunk ? 'focused-chunk' : ''} ${decision !== 'pending' ? `decision-${decision}` : ''}`}
      style={{ height: ROW_HEIGHT }}
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
        <span className={`line-content ${wordWrap ? 'word-wrap' : ''}`}>
          {row.left ? (
            <LineContent line={row.left} searchQuery={searchQuery} side="old" />
          ) : null}
        </span>
      </div>

      {/* Divider */}
      <div className="side-divider" />

      {/* Right side (new) */}
      <div className={`diff-cell right-cell ${rightType}`}>
        <span className="line-number">
          {row.right?.newLineNumber ?? ''}
        </span>
        <span className={`line-content ${wordWrap ? 'word-wrap' : ''}`}>
          {row.right ? (
            <LineContent line={row.right} searchQuery={searchQuery} side="new" />
          ) : null}
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
