import React, { memo, useMemo } from 'react';
import type { FileDiff, ViewMode, ChunkDecision } from '../types';
import { SideBySideView } from './SideBySideView';
import { UnifiedView } from './UnifiedView';

interface Props {
  file: FileDiff;
  viewMode: ViewMode;
  contextLines: number;
  expandedRegions: Set<string>;
  onExpandRegion: (regionKey: string) => void;
  chunkDecisions: Record<string, ChunkDecision>;
  onChunkDecision: (chunkId: string, decision: ChunkDecision) => void;
  focusedChunkIndex: number;
  searchQuery: string;
  wordWrap: boolean;
}

export const DiffViewer: React.FC<Props> = memo(({
  file,
  viewMode,
  contextLines,
  expandedRegions,
  onExpandRegion,
  chunkDecisions,
  onChunkDecision,
  focusedChunkIndex,
  searchQuery,
  wordWrap,
}) => {
  const chunkCount = file.chunks.length;
  const decidedCount = useMemo(
    () => file.chunks.filter(c => chunkDecisions[c.id] && chunkDecisions[c.id] !== 'pending').length,
    [file.chunks, chunkDecisions]
  );

  if (file.chunks.length === 0) {
    return (
      <div className="diff-empty">
        <p>No changes in this file</p>
      </div>
    );
  }

  return (
    <div className="diff-viewer">
      {/* Mini-map / chunk indicator bar */}
      <div className="chunk-indicator-bar">
        {file.chunks.map((chunk, i) => {
          const decision = chunkDecisions[chunk.id] || 'pending';
          const isFocused = i === focusedChunkIndex;
          return (
            <div
              key={chunk.id}
              className={`chunk-indicator ${decision} ${isFocused ? 'focused' : ''}`}
              title={`Chunk ${i + 1}: ${chunk.lines.filter(l => l.type === 'added').length} added, ${chunk.lines.filter(l => l.type === 'removed').length} removed`}
            />
          );
        })}
        <span className="chunk-counter">
          {decidedCount}/{chunkCount}
        </span>
      </div>

      {/* Diff content */}
      <div className="diff-content">
        {viewMode === 'side-by-side' ? (
          <SideBySideView
            chunks={file.chunks}
            contextLines={contextLines}
            expandedRegions={expandedRegions}
            onExpandRegion={onExpandRegion}
            chunkDecisions={chunkDecisions}
            onChunkDecision={onChunkDecision}
            focusedChunkIndex={focusedChunkIndex}
            searchQuery={searchQuery}
            wordWrap={wordWrap}
          />
        ) : (
          <UnifiedView
            chunks={file.chunks}
            contextLines={contextLines}
            expandedRegions={expandedRegions}
            onExpandRegion={onExpandRegion}
            chunkDecisions={chunkDecisions}
            onChunkDecision={onChunkDecision}
            focusedChunkIndex={focusedChunkIndex}
            searchQuery={searchQuery}
            wordWrap={wordWrap}
          />
        )}
      </div>
    </div>
  );
});

DiffViewer.displayName = 'DiffViewer';
