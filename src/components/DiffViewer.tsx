import React, { memo, useEffect, useMemo, useState } from 'react';
import type { FileDiff, ViewMode, ChunkDecision } from '../types';
import { SideBySideView } from './SideBySideView';
import { UnifiedView } from './UnifiedView';
import { ImagePreview, MarkdownPreview } from './FilePreview';

interface Props {
  file: FileDiff;
  repoPath: string | null;
  baseRef?: string | null;
  headRef?: string | null;
  viewMode: ViewMode;
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

export const DiffViewer: React.FC<Props> = memo(({
  file,
  repoPath,
  baseRef,
  headRef,
  viewMode,
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
  const [surface, setSurface] = useState<'diff' | 'preview'>('diff');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<
    | { kind: 'markdown'; left: string | null; right: string | null }
    | { kind: 'image'; left: { src: string; path: string } | null; right: { src: string; path: string } | null }
    | null
  >(null);

  const targetPath = (file.newPath || file.oldPath || '').toLowerCase();
  const previewType = useMemo<'markdown' | 'image' | null>(() => {
    if (!targetPath) return null;
    if (targetPath === 'readme' || targetPath.endsWith('/readme') || targetPath.endsWith('.md') || targetPath.endsWith('.markdown')) {
      return 'markdown';
    }
    if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(targetPath)) {
      return 'image';
    }
    return null;
  }, [targetPath]);

  const isPreviewable = previewType !== null;

  useEffect(() => {
    if (previewType === 'image') {
      setSurface('preview');
      return;
    }
    if (file.chunks.length === 0 && isPreviewable) {
      setSurface('preview');
      return;
    }
    setSurface('diff');
  }, [file.oldPath, file.newPath, file.type, file.chunks.length, previewType, isPreviewable]);

  useEffect(() => {
    if (!previewType || !repoPath) {
      setPreviewData(null);
      setPreviewError(null);
      return;
    }
    if (!window.desktopBridge?.getFilePreview) {
      setPreviewData(null);
      setPreviewError('Preview bridge unavailable in this window. Reload Diffy.');
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);

    window.desktopBridge!.getFilePreview({
      repoPath,
      baseRef: baseRef || null,
      headRef: headRef || null,
      oldPath: file.oldPath,
      newPath: file.newPath,
      fileType: previewType,
      diffType: file.type,
    }).then(data => {
      if (cancelled) return;
      setPreviewData(data);
    }).catch(error => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : 'Failed to load preview.';
      setPreviewData(null);
      setPreviewError(message);
    }).finally(() => {
      if (!cancelled) setPreviewLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [previewType, repoPath, baseRef, headRef, file.oldPath, file.newPath, file.type]);

  const chunkCount = file.chunks.length;
  const decidedCount = useMemo(
    () => file.chunks.filter(c => chunkDecisions[c.id] && chunkDecisions[c.id] !== 'pending').length,
    [file.chunks, chunkDecisions]
  );

  if (file.chunks.length === 0 && !isPreviewable) {
    return (
      <div className="diff-empty">
        <p>No changes in this file</p>
      </div>
    );
  }

  return (
    <div className="diff-viewer">
      {isPreviewable && (
        <div className="preview-mode-toggle">
          <button
            className={`toolbar-btn ${surface === 'diff' ? 'active' : ''}`}
            onClick={() => setSurface('diff')}
            disabled={file.chunks.length === 0 && previewType === 'image'}
          >
            Diff
          </button>
          <button
            className={`toolbar-btn ${surface === 'preview' ? 'active' : ''}`}
            onClick={() => setSurface('preview')}
          >
            Preview
          </button>
        </div>
      )}

      {surface === 'preview' && isPreviewable ? (
        <div className="file-preview-root">
          {previewLoading && <p className="file-preview-empty">Loading preview...</p>}
          {!previewLoading && previewError && <p className="file-preview-error">{previewError}</p>}
          {!previewLoading && !previewError && previewData?.kind === 'markdown' && (
            <MarkdownPreview left={previewData.left} right={previewData.right} />
          )}
          {!previewLoading && !previewError && previewData?.kind === 'image' && (
            <ImagePreview left={previewData.left} right={previewData.right} />
          )}
        </div>
      ) : (
        <>
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
                activeSearchIndex={activeSearchIndex}
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
                activeSearchIndex={activeSearchIndex}
                wordWrap={wordWrap}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
});

DiffViewer.displayName = 'DiffViewer';
