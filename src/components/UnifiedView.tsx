import React, { memo, useMemo } from 'react';
import type { DiffChunk, DiffLine, WordSegment, ChunkDecision } from '../types';
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

interface UnifiedRow {
  line: DiffLine | null;
  chunkId: string;
  isFirstInChunk: boolean;
  isCollapsedPlaceholder?: boolean;
  collapsedCount?: number;
  collapsedStart?: number;
}

export const UnifiedView: React.FC<Props> = memo(({
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
  const rows = useMemo(() => {
    const result: UnifiedRow[] = [];
    for (const chunk of chunks) {
      for (let i = 0; i < chunk.lines.length; i++) {
        // Check for collapsible regions
        const unchangedRun = getUnchangedRun(chunk.lines, i);
        if (unchangedRun > contextLines * 2 + 4) {
          const regionKey = `${chunk.id}-${i}`;
          if (!expandedRegions.has(regionKey)) {
            // Show context before
            for (let j = 0; j < contextLines; j++) {
              result.push({ line: chunk.lines[i + j], chunkId: chunk.id, isFirstInChunk: i + j === 0 });
            }
            // Collapsed placeholder
            const collapsedCount = unchangedRun - contextLines * 2;
            result.push({
              line: null,
              chunkId: chunk.id,
              isFirstInChunk: false,
              isCollapsedPlaceholder: true,
              collapsedCount,
              collapsedStart: i + contextLines,
            });
            // Skip to context after
            i += unchangedRun - contextLines - 1;
            continue;
          }
        }
        result.push({ line: chunk.lines[i], chunkId: chunk.id, isFirstInChunk: i === 0 });
      }
    }
    return result;
  }, [chunks, contextLines, expandedRegions]);

  const { visibleRange, totalHeight, offsetY, containerRef, scrollTo } = useVirtualScroll(
    rows.length,
    ROW_HEIGHT,
  );

  // Scroll to focused chunk
  const chunkStarts = useMemo(() => {
    const starts: number[] = [];
    let lastId = '';
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].chunkId !== lastId) {
        starts.push(i);
        lastId = rows[i].chunkId;
      }
    }
    return starts;
  }, [rows]);

  React.useEffect(() => {
    if (focusedChunkIndex >= 0 && focusedChunkIndex < chunkStarts.length) {
      scrollTo(chunkStarts[focusedChunkIndex]);
    }
  }, [focusedChunkIndex, chunkStarts, scrollTo]);

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
            <UnifiedRowComponent
              key={visibleRange.start + i}
              row={row}
              decision={chunkDecisions[row.chunkId] || 'pending'}
              onDecision={onChunkDecision}
              onExpandRegion={onExpandRegion}
              searchQuery={searchQuery}
              wordWrap={wordWrap}
              isFocused={chunkStarts[focusedChunkIndex] !== undefined &&
                row.chunkId === rows[chunkStarts[focusedChunkIndex]]?.chunkId}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

UnifiedView.displayName = 'UnifiedView';

function getUnchangedRun(lines: DiffLine[], start: number): number {
  let count = 0;
  for (let i = start; i < lines.length && lines[i].type === 'unchanged'; i++) {
    count++;
  }
  return count;
}

// ── Unified row component ────────────────────────────────────────

interface RowProps {
  row: UnifiedRow;
  decision: ChunkDecision;
  onDecision: (chunkId: string, decision: ChunkDecision) => void;
  onExpandRegion: (regionKey: string) => void;
  searchQuery: string;
  wordWrap: boolean;
  isFocused: boolean;
}

const UnifiedRowComponent: React.FC<RowProps> = memo(({
  row,
  decision,
  onDecision,
  onExpandRegion,
  searchQuery,
  wordWrap,
  isFocused,
}) => {
  if (row.isCollapsedPlaceholder) {
    return (
      <div className="diff-row collapsed-row unified" style={{ height: ROW_HEIGHT }}>
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

  const line = row.line!;
  const type = line.type;
  const prefix = type === 'added' ? '+' : type === 'removed' ? '-' : ' ';
  const showGutter = row.isFirstInChunk && type !== 'unchanged';

  return (
    <div
      className={`diff-row unified-row ${type} ${isFocused ? 'focused-chunk' : ''} ${decision !== 'pending' ? `decision-${decision}` : ''}`}
      style={{ height: ROW_HEIGHT }}
    >
      <div className="chunk-gutter">
        {showGutter && (
          <div className="chunk-actions">
            <button
              className={`chunk-btn accept-btn ${decision === 'accepted' ? 'active' : ''}`}
              onClick={() => onDecision(row.chunkId, decision === 'accepted' ? 'pending' : 'accepted')}
              title="Accept (a)"
            >
              &#x2713;
            </button>
            <button
              className={`chunk-btn reject-btn ${decision === 'rejected' ? 'active' : ''}`}
              onClick={() => onDecision(row.chunkId, decision === 'rejected' ? 'pending' : 'rejected')}
              title="Reject (x)"
            >
              &#x2717;
            </button>
          </div>
        )}
      </div>
      <span className="line-number old-num">{line.oldLineNumber ?? ''}</span>
      <span className="line-number new-num">{line.newLineNumber ?? ''}</span>
      <span className="diff-prefix">{prefix}</span>
      <span className={`line-content ${wordWrap ? 'word-wrap' : ''}`}>
        <UnifiedLineContent line={line} searchQuery={searchQuery} />
      </span>
    </div>
  );
});

UnifiedRowComponent.displayName = 'UnifiedRowComponent';

// ── Line content ─────────────────────────────────────────────────

const UnifiedLineContent: React.FC<{ line: DiffLine; searchQuery: string }> = memo(({ line, searchQuery }) => {
  if (line.wordSegments && line.wordSegments.length > 0) {
    return (
      <>
        {line.wordSegments.map((seg, i) => {
          const cls = seg.type === 'added' ? 'word-added' : seg.type === 'removed' ? 'word-removed' : '';
          if (searchQuery && seg.text.toLowerCase().includes(searchQuery.toLowerCase())) {
            return <span key={i} className={cls}>{highlightSearch(seg.text, searchQuery)}</span>;
          }
          return <span key={i} className={cls}>{seg.text}</span>;
        })}
      </>
    );
  }

  const spans = highlightLine(line.content);
  return (
    <>
      {spans.map((span, i) => {
        if (searchQuery && span.text.toLowerCase().includes(searchQuery.toLowerCase())) {
          return <span key={i} className={span.className}>{highlightSearch(span.text, searchQuery)}</span>;
        }
        return <span key={i} className={span.className}>{span.text}</span>;
      })}
    </>
  );
});

UnifiedLineContent.displayName = 'UnifiedLineContent';

function highlightSearch(text: string, query: string): React.ReactNode[] {
  if (!query) return [text];
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  const lowerQ = query.toLowerCase();
  let last = 0;
  let idx = lower.indexOf(lowerQ);
  while (idx !== -1) {
    if (idx > last) parts.push(text.slice(last, idx));
    parts.push(<mark key={idx} className="search-highlight">{text.slice(idx, idx + query.length)}</mark>);
    last = idx + query.length;
    idx = lower.indexOf(lowerQ, last);
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
