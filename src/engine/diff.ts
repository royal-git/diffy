import { diffLines, diffWordsWithSpace, parsePatch } from 'diff';
import type { DiffLine, DiffChunk, FileDiff, WordSegment, SideBySideRow } from '../types';

interface JsDiffChange {
  value: string;
  added?: boolean;
  removed?: boolean;
}

interface ParsedHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

interface ParsedFile {
  oldFileName?: string;
  newFileName?: string;
  hunks?: ParsedHunk[];
}

function splitChangeLines(value: string): string[] {
  const lines = value.split('\n');
  if (value.endsWith('\n')) lines.pop();
  return lines;
}

function normalizePath(rawPath: string | undefined): string {
  if (!rawPath) return 'file';
  const withoutTabSuffix = rawPath.split('\t')[0];
  if (withoutTabSuffix === '/dev/null') return '/dev/null';
  return withoutTabSuffix.replace(/^[ab]\//, '');
}

function extractPathsFromHeaders(diffText: string): Array<{ oldPath: string; newPath: string }> {
  const sections = diffText.split(/^diff --git /m).filter(Boolean);
  const results: Array<{ oldPath: string; newPath: string }> = [];

  for (const section of sections) {
    const lines = section.split('\n');
    const header = lines[0]?.trim() ?? '';
    let oldPath = 'file';
    let newPath = 'file';

    const gitHeader = header.match(/^a\/(.+?) b\/(.+)$/);
    if (gitHeader) {
      oldPath = normalizePath(gitHeader[1]);
      newPath = normalizePath(gitHeader[2]);
    }

    for (const line of lines) {
      if (line.startsWith('rename from ')) {
        oldPath = normalizePath(line.slice('rename from '.length));
      } else if (line.startsWith('rename to ')) {
        newPath = normalizePath(line.slice('rename to '.length));
      } else if (line.startsWith('--- ')) {
        oldPath = normalizePath(line.slice(4));
      } else if (line.startsWith('+++ ')) {
        newPath = normalizePath(line.slice(4));
      }
    }

    results.push({ oldPath, newPath });
  }

  return results;
}

export function computeWordDiff(oldLine: string, newLine: string): { oldSegments: WordSegment[]; newSegments: WordSegment[] } {
  const oldSegments: WordSegment[] = [];
  const newSegments: WordSegment[] = [];

  for (const change of diffWordsWithSpace(oldLine ?? '', newLine ?? '') as JsDiffChange[]) {
    if (change.added) {
      newSegments.push({ text: change.value, type: 'added' });
    } else if (change.removed) {
      oldSegments.push({ text: change.value, type: 'removed' });
    } else {
      oldSegments.push({ text: change.value, type: 'unchanged' });
      newSegments.push({ text: change.value, type: 'unchanged' });
    }
  }

  return { oldSegments, newSegments };
}

export function computeDiff(oldText: string, newText: string, fileName?: string): FileDiff {
  const lines: DiffLine[] = [];
  let oldLineNum = 1;
  let newLineNum = 1;

  for (const change of diffLines(oldText ?? '', newText ?? '', { newlineIsToken: false }) as JsDiffChange[]) {
    const splitLines = splitChangeLines(change.value);

    for (const content of splitLines) {
      if (change.added) {
        lines.push({
          type: 'added',
          content,
          oldLineNumber: null,
          newLineNumber: newLineNum,
        });
        newLineNum++;
      } else if (change.removed) {
        lines.push({
          type: 'removed',
          content,
          oldLineNumber: oldLineNum,
          newLineNumber: null,
        });
        oldLineNum++;
      } else {
        lines.push({
          type: 'unchanged',
          content,
          oldLineNumber: oldLineNum,
          newLineNumber: newLineNum,
        });
        oldLineNum++;
        newLineNum++;
      }
    }
  }

  addWordDiffs(lines);

  const chunks: DiffChunk[] = groupIntoChunks(lines).map((chunkLines, i) => ({
    oldStart: chunkLines[0]?.oldLineNumber ?? getFirstOldLine(chunkLines),
    oldLength: chunkLines.filter(l => l.type !== 'added').length,
    newStart: chunkLines[0]?.newLineNumber ?? getFirstNewLine(chunkLines),
    newLength: chunkLines.filter(l => l.type !== 'removed').length,
    lines: chunkLines,
    id: `chunk-${i}`,
  }));

  const additions = lines.filter(l => l.type === 'added').length;
  const deletions = lines.filter(l => l.type === 'removed').length;
  const path = fileName || 'file';

  return {
    oldPath: path,
    newPath: path,
    chunks,
    type: additions > 0 || deletions > 0 ? 'modified' : 'modified',
    additions,
    deletions,
  };
}

export function parseUnifiedDiff(diffText: string): FileDiff[] {
  const files: FileDiff[] = [];
  const parsed = parsePatch(diffText) as ParsedFile[];
  const headerPaths = extractPathsFromHeaders(diffText);

  for (let index = 0; index < parsed.length; index++) {
    const file = parsed[index];
    const fallbackPaths = headerPaths[index];
    const rawOldPath = normalizePath(file.oldFileName) !== 'file'
      ? normalizePath(file.oldFileName)
      : (fallbackPaths?.oldPath ?? 'file');
    const rawNewPath = normalizePath(file.newFileName) !== 'file'
      ? normalizePath(file.newFileName)
      : (fallbackPaths?.newPath ?? 'file');
    const oldPath = rawOldPath === '/dev/null' ? (rawNewPath || 'file') : rawOldPath;
    const newPath = rawNewPath === '/dev/null' ? (rawOldPath || 'file') : rawNewPath;

    let additions = 0;
    let deletions = 0;

    const chunks: DiffChunk[] = (file.hunks ?? []).map((hunk, idx) => {
      const chunkLines: DiffLine[] = [];
      let oldLine = hunk.oldStart;
      let newLine = hunk.newStart;

      for (const rawLine of hunk.lines) {
        if (rawLine.startsWith('\\')) {
          continue;
        }
        if (rawLine.startsWith('+')) {
          chunkLines.push({
            type: 'added',
            content: rawLine.slice(1),
            oldLineNumber: null,
            newLineNumber: newLine,
          });
          newLine++;
          additions++;
          continue;
        }
        if (rawLine.startsWith('-')) {
          chunkLines.push({
            type: 'removed',
            content: rawLine.slice(1),
            oldLineNumber: oldLine,
            newLineNumber: null,
          });
          oldLine++;
          deletions++;
          continue;
        }

        const content = rawLine.startsWith(' ') ? rawLine.slice(1) : rawLine;
        chunkLines.push({
          type: 'unchanged',
          content,
          oldLineNumber: oldLine,
          newLineNumber: newLine,
        });
        oldLine++;
        newLine++;
      }

      addWordDiffs(chunkLines);

      return {
        oldStart: hunk.oldStart,
        oldLength: hunk.oldLines,
        newStart: hunk.newStart,
        newLength: hunk.newLines,
        lines: chunkLines,
        id: `${newPath}-chunk-${idx}`,
      };
    });

    const type: FileDiff['type'] =
      rawOldPath === '/dev/null' ? 'added' :
      rawNewPath === '/dev/null' ? 'deleted' :
      oldPath !== newPath ? 'renamed' : 'modified';

    files.push({
      oldPath,
      newPath,
      chunks,
      type,
      additions,
      deletions,
    });
  }

  if (files.length === 0 && diffText.trim().length > 0) {
    const diffLines = diffText.split('\n');
    const hasMarkers = diffLines.some(l => l.startsWith('+') || l.startsWith('-'));
    if (hasMarkers) {
      const file = parseSimpleDiff(diffLines);
      if (file) files.push(file);
    }
  }

  return files;
}

function parseSimpleDiff(lines: string[]): FileDiff | null {
  const chunkLines: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;
  let totalAdded = 0;
  let totalRemoved = 0;

  for (const line of lines) {
    if (line.startsWith('+')) {
      chunkLines.push({ type: 'added', content: line.slice(1), oldLineNumber: null, newLineNumber: newLine });
      newLine++;
      totalAdded++;
    } else if (line.startsWith('-')) {
      chunkLines.push({ type: 'removed', content: line.slice(1), oldLineNumber: oldLine, newLineNumber: null });
      oldLine++;
      totalRemoved++;
    } else {
      chunkLines.push({ type: 'unchanged', content: line, oldLineNumber: oldLine, newLineNumber: newLine });
      oldLine++;
      newLine++;
    }
  }

  if (totalAdded === 0 && totalRemoved === 0) return null;

  addWordDiffs(chunkLines);

  return {
    oldPath: 'file',
    newPath: 'file',
    chunks: [{
      oldStart: 1,
      oldLength: chunkLines.filter(l => l.type !== 'added').length,
      newStart: 1,
      newLength: chunkLines.filter(l => l.type !== 'removed').length,
      lines: chunkLines,
      id: 'chunk-0',
    }],
    type: 'modified',
    additions: totalAdded,
    deletions: totalRemoved,
  };
}

function addWordDiffs(lines: DiffLine[]): void {
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type === 'removed') {
      const removedStart = i;
      while (i < lines.length && lines[i].type === 'removed') i++;
      const addedStart = i;
      while (i < lines.length && lines[i].type === 'added') i++;

      const removedCount = addedStart - removedStart;
      const addedCount = i - addedStart;
      const pairs = Math.min(removedCount, addedCount);

      for (let j = 0; j < pairs; j++) {
        const { oldSegments, newSegments } = computeWordDiff(
          lines[removedStart + j].content,
          lines[addedStart + j].content,
        );
        lines[removedStart + j].wordSegments = oldSegments;
        lines[addedStart + j].wordSegments = newSegments;
      }
    } else {
      i++;
    }
  }
}

function groupIntoChunks(lines: DiffLine[]): DiffLine[][] {
  if (lines.length === 0) return [];

  const context = 3;
  const changeIndices = lines.map(l => l.type !== 'unchanged');
  const inChunk = new Array(lines.length).fill(false);

  for (let i = 0; i < lines.length; i++) {
    if (!changeIndices[i]) continue;
    for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) {
      inChunk[j] = true;
    }
  }

  if (!inChunk.some(Boolean)) return [lines];

  const chunks: DiffLine[][] = [];
  let current: DiffLine[] = [];
  let inGroup = false;

  for (let i = 0; i < lines.length; i++) {
    if (inChunk[i]) {
      if (!inGroup) inGroup = true;
      current.push(lines[i]);
      continue;
    }
    if (inGroup) {
      chunks.push(current);
      current = [];
      inGroup = false;
    }
  }

  if (current.length > 0) chunks.push(current);
  return chunks.length > 0 ? chunks : [lines];
}

function getFirstOldLine(lines: DiffLine[]): number {
  for (const line of lines) {
    if (line.oldLineNumber !== null) return line.oldLineNumber;
  }
  return 1;
}

function getFirstNewLine(lines: DiffLine[]): number {
  for (const line of lines) {
    if (line.newLineNumber !== null) return line.newLineNumber;
  }
  return 1;
}

// ── Build side-by-side rows ──────────────────────────────────────

export function buildSideBySideRows(
  chunks: DiffChunk[],
  contextLines: number,
  expandedRegions: Set<string>
): SideBySideRow[] {
  const rows: SideBySideRow[] = [];

  for (const chunk of chunks) {
    const lines = chunk.lines;
    const firstChangedLineIndex = lines.findIndex(line => line.type !== 'unchanged');
    let i = 0;

    const changeRegions = findChangeRegions(lines);
    const collapsible = computeCollapsibleRegions(lines, changeRegions, contextLines);

    while (i < lines.length) {
      const collapse = collapsible.find(c => c.start === i);
      if (collapse && !expandedRegions.has(`${chunk.id}-${collapse.start}`)) {
        rows.push({
          left: null,
          right: null,
          chunkId: chunk.id,
          isFirstInChunk: false,
          isCollapsedPlaceholder: true,
          collapsedCount: collapse.end - collapse.start,
          collapsedStart: collapse.start,
        });
        i = collapse.end;
        continue;
      }

      const line = lines[i];

      if (line.type === 'unchanged') {
        rows.push({
          left: line,
          right: line,
          chunkId: chunk.id,
          isFirstInChunk: false,
        });
        i++;
      } else if (line.type === 'removed') {
        const removedStart = i;
        while (i < lines.length && lines[i].type === 'removed') i++;
        const addedStart = i;
        while (i < lines.length && lines[i].type === 'added') i++;

        const removedCount = addedStart - removedStart;
        const addedCount = i - addedStart;
        const maxCount = Math.max(removedCount, addedCount);

        for (let j = 0; j < maxCount; j++) {
          const leftLineIndex = j < removedCount ? removedStart + j : -1;
          const rightLineIndex = j < addedCount ? addedStart + j : -1;
          rows.push({
            left: j < removedCount ? lines[removedStart + j] : null,
            right: j < addedCount ? lines[addedStart + j] : null,
            chunkId: chunk.id,
            isFirstInChunk: leftLineIndex === firstChangedLineIndex || rightLineIndex === firstChangedLineIndex,
          });
        }
      } else if (line.type === 'added') {
        rows.push({
          left: null,
          right: line,
          chunkId: chunk.id,
          isFirstInChunk: i === firstChangedLineIndex,
        });
        i++;
      }
    }
  }

  return rows;
}

interface ChangeRegion {
  start: number;
  end: number;
}

function findChangeRegions(lines: DiffLine[]): ChangeRegion[] {
  const regions: ChangeRegion[] = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].type !== 'unchanged') {
      const start = i;
      while (i < lines.length && lines[i].type !== 'unchanged') i++;
      regions.push({ start, end: i });
    } else {
      i++;
    }
  }

  return regions;
}

function computeCollapsibleRegions(
  lines: DiffLine[],
  changeRegions: ChangeRegion[],
  contextLines: number
): ChangeRegion[] {
  if (changeRegions.length === 0) {
    if (lines.length > contextLines * 2 + 1) {
      return [{ start: contextLines, end: lines.length - contextLines }];
    }
    return [];
  }

  const collapsible: ChangeRegion[] = [];
  const minCollapse = 4;

  if (changeRegions[0].start > contextLines + minCollapse) {
    collapsible.push({ start: 0, end: changeRegions[0].start - contextLines });
  }

  for (let i = 0; i < changeRegions.length - 1; i++) {
    const gapStart = changeRegions[i].end + contextLines;
    const gapEnd = changeRegions[i + 1].start - contextLines;
    if (gapEnd - gapStart >= minCollapse) {
      collapsible.push({ start: gapStart, end: gapEnd });
    }
  }

  const lastEnd = changeRegions[changeRegions.length - 1].end;
  if (lines.length - lastEnd > contextLines + minCollapse) {
    collapsible.push({ start: lastEnd + contextLines, end: lines.length });
  }

  return collapsible;
}
