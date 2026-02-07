import type { DiffLine, DiffChunk, FileDiff, WordSegment, SideBySideRow } from '../types';

// ── Myers diff algorithm ─────────────────────────────────────────
// Computes the shortest edit script between two sequences.

interface Edit {
  type: 'insert' | 'delete' | 'equal';
  oldIndex: number;
  newIndex: number;
  value: string;
}

function myersDiff(oldArr: string[], newArr: string[]): Edit[] {
  const N = oldArr.length;
  const M = newArr.length;
  const MAX = N + M;

  if (MAX === 0) return [];

  // Optimization: if one side is empty, return all inserts/deletes
  if (N === 0) {
    return newArr.map((v, i) => ({ type: 'insert' as const, oldIndex: 0, newIndex: i, value: v }));
  }
  if (M === 0) {
    return oldArr.map((v, i) => ({ type: 'delete' as const, oldIndex: i, newIndex: 0, value: v }));
  }

  // For very large inputs, fall back to a simpler LCS approach
  if (MAX > 20000) {
    return simpleDiff(oldArr, newArr);
  }

  const vSize = 2 * MAX + 1;
  const v = new Int32Array(vSize);
  const trace: Int32Array[] = [];

  v.fill(-1);
  v[MAX + 1] = 0;

  for (let d = 0; d <= MAX; d++) {
    const snapshot = new Int32Array(vSize);
    snapshot.set(v);
    trace.push(snapshot);

    for (let k = -d; k <= d; k += 2) {
      const idx = k + MAX;
      let x: number;

      if (k === -d || (k !== d && v[idx - 1] < v[idx + 1])) {
        x = v[idx + 1];
      } else {
        x = v[idx - 1] + 1;
      }

      let y = x - k;

      while (x < N && y < M && oldArr[x] === newArr[y]) {
        x++;
        y++;
      }

      v[idx] = x;

      if (x >= N && y >= M) {
        return backtrack(trace, oldArr, newArr, MAX);
      }
    }
  }

  return simpleDiff(oldArr, newArr);
}

function backtrack(trace: Int32Array[], oldArr: string[], newArr: string[], offset: number): Edit[] {
  const edits: Edit[] = [];
  let x = oldArr.length;
  let y = newArr.length;

  for (let d = trace.length - 1; d > 0; d--) {
    const v = trace[d - 1];
    const k = x - y;

    let prevK: number;
    if (k === -d || (k !== d && v[k - 1 + offset] < v[k + 1 + offset])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = v[prevK + offset];
    const prevY = prevX - prevK;

    // Diagonal moves (equal)
    while (x > prevX && y > prevY) {
      x--;
      y--;
      edits.unshift({ type: 'equal', oldIndex: x, newIndex: y, value: oldArr[x] });
    }

    if (d > 0) {
      if (x === prevX) {
        // Insert
        y--;
        edits.unshift({ type: 'insert', oldIndex: x, newIndex: y, value: newArr[y] });
      } else {
        // Delete
        x--;
        edits.unshift({ type: 'delete', oldIndex: x, newIndex: y, value: oldArr[x] });
      }
    }
  }

  // Handle remaining diagonal at d=0
  while (x > 0 && y > 0) {
    x--;
    y--;
    edits.unshift({ type: 'equal', oldIndex: x, newIndex: y, value: oldArr[x] });
  }

  return edits;
}

// Fallback for very large inputs
function simpleDiff(oldArr: string[], newArr: string[]): Edit[] {
  const edits: Edit[] = [];
  const oldSet = new Map<string, number[]>();

  for (let i = 0; i < oldArr.length; i++) {
    const positions = oldSet.get(oldArr[i]);
    if (positions) positions.push(i);
    else oldSet.set(oldArr[i], [i]);
  }

  let oldIdx = 0;
  let newIdx = 0;

  while (oldIdx < oldArr.length && newIdx < newArr.length) {
    if (oldArr[oldIdx] === newArr[newIdx]) {
      edits.push({ type: 'equal', oldIndex: oldIdx, newIndex: newIdx, value: oldArr[oldIdx] });
      oldIdx++;
      newIdx++;
    } else {
      // Look ahead to find next match
      let foundOld = -1;
      let foundNew = -1;
      const lookAhead = Math.min(100, Math.max(oldArr.length - oldIdx, newArr.length - newIdx));

      for (let i = 1; i < lookAhead; i++) {
        if (newIdx + i < newArr.length && oldArr[oldIdx] === newArr[newIdx + i]) {
          foundNew = newIdx + i;
          break;
        }
        if (oldIdx + i < oldArr.length && oldArr[oldIdx + i] === newArr[newIdx]) {
          foundOld = oldIdx + i;
          break;
        }
      }

      if (foundNew >= 0) {
        // Insert lines until we reach the match
        while (newIdx < foundNew) {
          edits.push({ type: 'insert', oldIndex: oldIdx, newIndex: newIdx, value: newArr[newIdx] });
          newIdx++;
        }
      } else if (foundOld >= 0) {
        // Delete lines until we reach the match
        while (oldIdx < foundOld) {
          edits.push({ type: 'delete', oldIndex: oldIdx, newIndex: newIdx, value: oldArr[oldIdx] });
          oldIdx++;
        }
      } else {
        edits.push({ type: 'delete', oldIndex: oldIdx, newIndex: newIdx, value: oldArr[oldIdx] });
        oldIdx++;
        edits.push({ type: 'insert', oldIndex: oldIdx, newIndex: newIdx, value: newArr[newIdx] });
        newIdx++;
      }
    }
  }

  while (oldIdx < oldArr.length) {
    edits.push({ type: 'delete', oldIndex: oldIdx, newIndex: newIdx, value: oldArr[oldIdx] });
    oldIdx++;
  }
  while (newIdx < newArr.length) {
    edits.push({ type: 'insert', oldIndex: oldIdx, newIndex: newIdx, value: newArr[newIdx] });
    newIdx++;
  }

  return edits;
}

// ── Word-level diff ──────────────────────────────────────────────

function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let mode: 'word' | 'space' | 'punct' = 'word';

  for (const ch of line) {
    const isSpace = /\s/.test(ch);
    const isPunct = /[^\w\s]/.test(ch);
    const newMode = isSpace ? 'space' : isPunct ? 'punct' : 'word';

    if (newMode !== mode && current) {
      tokens.push(current);
      current = '';
    }
    mode = newMode;
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

export function computeWordDiff(oldLine: string, newLine: string): { oldSegments: WordSegment[]; newSegments: WordSegment[] } {
  const oldTokens = tokenize(oldLine);
  const newTokens = tokenize(newLine);
  const edits = myersDiff(oldTokens, newTokens);

  const oldSegments: WordSegment[] = [];
  const newSegments: WordSegment[] = [];

  for (const edit of edits) {
    switch (edit.type) {
      case 'equal':
        oldSegments.push({ text: edit.value, type: 'unchanged' });
        newSegments.push({ text: edit.value, type: 'unchanged' });
        break;
      case 'delete':
        oldSegments.push({ text: edit.value, type: 'removed' });
        break;
      case 'insert':
        newSegments.push({ text: edit.value, type: 'added' });
        break;
    }
  }

  return { oldSegments, newSegments };
}

// ── Compute diff from two strings ────────────────────────────────

export function computeDiff(oldText: string, newText: string, fileName?: string): FileDiff {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const edits = myersDiff(oldLines, newLines);

  // Group edits into chunks (groups of changes with context)
  const chunks: DiffChunk[] = [];
  const lines: DiffLine[] = [];
  let oldLineNum = 1;
  let newLineNum = 1;

  for (const edit of edits) {
    switch (edit.type) {
      case 'equal':
        lines.push({
          type: 'unchanged',
          content: edit.value,
          oldLineNumber: oldLineNum,
          newLineNumber: newLineNum,
        });
        oldLineNum++;
        newLineNum++;
        break;
      case 'delete':
        lines.push({
          type: 'removed',
          content: edit.value,
          oldLineNumber: oldLineNum,
          newLineNumber: null,
        });
        oldLineNum++;
        break;
      case 'insert':
        lines.push({
          type: 'added',
          content: edit.value,
          oldLineNumber: null,
          newLineNumber: newLineNum,
        });
        newLineNum++;
        break;
    }
  }

  // Compute word-level diffs for adjacent remove/add pairs
  addWordDiffs(lines);

  // Group into chunks
  const chunkLines = groupIntoChunks(lines);
  for (let i = 0; i < chunkLines.length; i++) {
    const cl = chunkLines[i];
    const firstLine = cl[0];
    const lastLine = cl[cl.length - 1];
    chunks.push({
      oldStart: firstLine.oldLineNumber ?? getFirstOldLine(cl),
      oldLength: cl.filter(l => l.type !== 'added').length,
      newStart: firstLine.newLineNumber ?? getFirstNewLine(cl),
      newLength: cl.filter(l => l.type !== 'removed').length,
      lines: cl,
      id: `chunk-${i}`,
    });
  }

  const additions = lines.filter(l => l.type === 'added').length;
  const deletions = lines.filter(l => l.type === 'removed').length;

  const path = fileName || 'file';
  return {
    oldPath: path,
    newPath: path,
    chunks,
    type: additions > 0 && deletions > 0 ? 'modified' : additions > 0 ? 'added' : 'deleted',
    additions,
    deletions,
  };
}

function getFirstOldLine(lines: DiffLine[]): number {
  for (const l of lines) {
    if (l.oldLineNumber !== null) return l.oldLineNumber;
  }
  return 1;
}

function getFirstNewLine(lines: DiffLine[]): number {
  for (const l of lines) {
    if (l.newLineNumber !== null) return l.newLineNumber;
  }
  return 1;
}

function addWordDiffs(lines: DiffLine[]): void {
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type === 'removed') {
      // Collect consecutive removed lines
      const removedStart = i;
      while (i < lines.length && lines[i].type === 'removed') i++;
      // Collect consecutive added lines
      const addedStart = i;
      while (i < lines.length && lines[i].type === 'added') i++;

      const removedCount = addedStart - removedStart;
      const addedCount = i - addedStart;

      // Pair up removed/added lines for word-level diff
      const pairs = Math.min(removedCount, addedCount);
      for (let j = 0; j < pairs; j++) {
        const { oldSegments, newSegments } = computeWordDiff(
          lines[removedStart + j].content,
          lines[addedStart + j].content
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

  // Find regions of change and include context lines around them
  const CONTEXT = 3;
  const changeIndices: boolean[] = lines.map(l => l.type !== 'unchanged');

  // Expand change regions by context
  const inChunk: boolean[] = new Array(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    if (changeIndices[i]) {
      for (let j = Math.max(0, i - CONTEXT); j <= Math.min(lines.length - 1, i + CONTEXT); j++) {
        inChunk[j] = true;
      }
    }
  }

  // If no changes, return single chunk with all lines
  if (!inChunk.some(Boolean)) {
    return [lines];
  }

  // Group into contiguous chunks
  const chunks: DiffLine[][] = [];
  let current: DiffLine[] = [];
  let inGroup = false;

  for (let i = 0; i < lines.length; i++) {
    if (inChunk[i]) {
      if (!inGroup) inGroup = true;
      current.push(lines[i]);
    } else {
      if (inGroup) {
        chunks.push(current);
        current = [];
        inGroup = false;
      }
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks.length > 0 ? chunks : [lines];
}

// ── Parse unified diff format ────────────────────────────────────

export function parseUnifiedDiff(diffText: string): FileDiff[] {
  const files: FileDiff[] = [];
  const diffLines = diffText.split('\n');
  let i = 0;

  while (i < diffLines.length) {
    // Look for diff header
    if (diffLines[i].startsWith('diff --git') || diffLines[i].startsWith('---')) {
      const file = parseOneFile(diffLines, i);
      if (file) {
        files.push(file.fileDiff);
        i = file.nextIndex;
        continue;
      }
    }

    // Also handle simple unified diff without git header
    if (diffLines[i].startsWith('@@')) {
      const file = parseHunks(diffLines, i, 'a', 'b');
      if (file) {
        files.push(file.fileDiff);
        i = file.nextIndex;
        continue;
      }
    }

    i++;
  }

  // If we couldn't parse as a unified diff, try treating it as raw content
  if (files.length === 0 && diffText.trim().length > 0) {
    // Check if it looks like it has +/- prefixed lines
    const hasMarkers = diffLines.some(l => l.startsWith('+') || l.startsWith('-'));
    if (hasMarkers) {
      const file = parseSimpleDiff(diffLines);
      if (file) files.push(file);
    }
  }

  return files;
}

function parseOneFile(lines: string[], start: number): { fileDiff: FileDiff; nextIndex: number } | null {
  let i = start;
  let oldPath = '';
  let newPath = '';

  // Parse git diff header
  if (lines[i].startsWith('diff --git')) {
    const match = lines[i].match(/diff --git a\/(.+?) b\/(.+)/);
    if (match) {
      oldPath = match[1];
      newPath = match[2];
    }
    i++;

    // Skip index, mode lines
    while (i < lines.length && !lines[i].startsWith('---') && !lines[i].startsWith('@@') && !lines[i].startsWith('diff --git')) {
      if (lines[i].startsWith('new file')) {
        i++;
        continue;
      }
      if (lines[i].startsWith('deleted file')) {
        i++;
        continue;
      }
      if (lines[i].startsWith('rename from')) {
        i++;
        continue;
      }
      if (lines[i].startsWith('rename to')) {
        i++;
        continue;
      }
      i++;
    }
  }

  // Parse --- and +++ lines
  if (i < lines.length && lines[i].startsWith('---')) {
    const match = lines[i].match(/^--- (?:a\/)?(.+)/);
    if (match && match[1] !== '/dev/null') oldPath = oldPath || match[1];
    i++;
  }

  if (i < lines.length && lines[i].startsWith('+++')) {
    const match = lines[i].match(/^\+\+\+ (?:b\/)?(.+)/);
    if (match && match[1] !== '/dev/null') newPath = newPath || match[1];
    i++;
  }

  return parseHunks(lines, i, oldPath || 'file', newPath || 'file');
}

function parseHunks(lines: string[], start: number, oldPath: string, newPath: string): { fileDiff: FileDiff; nextIndex: number } | null {
  let i = start;
  const chunks: DiffChunk[] = [];
  let totalAdded = 0;
  let totalRemoved = 0;
  let chunkIdx = 0;

  while (i < lines.length) {
    if (lines[i].startsWith('diff --git')) break;

    if (lines[i].startsWith('@@')) {
      const hunkMatch = lines[i].match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (!hunkMatch) { i++; continue; }

      const oldStart = parseInt(hunkMatch[1], 10);
      const oldLen = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1;
      const newStart = parseInt(hunkMatch[3], 10);
      const newLen = hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1;

      i++;
      const chunkLines: DiffLine[] = [];
      let oldLine = oldStart;
      let newLine = newStart;

      while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('diff --git')) {
        const line = lines[i];

        if (line.startsWith('+')) {
          chunkLines.push({
            type: 'added',
            content: line.substring(1),
            oldLineNumber: null,
            newLineNumber: newLine,
          });
          newLine++;
          totalAdded++;
        } else if (line.startsWith('-')) {
          chunkLines.push({
            type: 'removed',
            content: line.substring(1),
            oldLineNumber: oldLine,
            newLineNumber: null,
          });
          oldLine++;
          totalRemoved++;
        } else if (line.startsWith(' ') || line === '') {
          chunkLines.push({
            type: 'unchanged',
            content: line.startsWith(' ') ? line.substring(1) : line,
            oldLineNumber: oldLine,
            newLineNumber: newLine,
          });
          oldLine++;
          newLine++;
        } else if (line.startsWith('\\')) {
          // "\ No newline at end of file"
          i++;
          continue;
        } else {
          break;
        }
        i++;
      }

      if (chunkLines.length > 0) {
        addWordDiffs(chunkLines);
        chunks.push({
          oldStart,
          oldLength: oldLen,
          newStart,
          newLength: newLen,
          lines: chunkLines,
          id: `${oldPath}-chunk-${chunkIdx++}`,
        });
      }
    } else {
      i++;
    }
  }

  if (chunks.length === 0) return null;

  const fileType = totalAdded > 0 && totalRemoved > 0 ? 'modified'
    : totalAdded > 0 ? 'added' : 'deleted';

  return {
    fileDiff: {
      oldPath,
      newPath,
      chunks,
      type: fileType as FileDiff['type'],
      additions: totalAdded,
      deletions: totalRemoved,
    },
    nextIndex: i,
  };
}

function parseSimpleDiff(lines: string[]): FileDiff | null {
  const chunkLines: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;
  let totalAdded = 0;
  let totalRemoved = 0;

  for (const line of lines) {
    if (line.startsWith('+')) {
      chunkLines.push({ type: 'added', content: line.substring(1), oldLineNumber: null, newLineNumber: newLine });
      newLine++;
      totalAdded++;
    } else if (line.startsWith('-')) {
      chunkLines.push({ type: 'removed', content: line.substring(1), oldLineNumber: oldLine, newLineNumber: null });
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

// ── Build side-by-side rows ──────────────────────────────────────

export function buildSideBySideRows(
  chunks: DiffChunk[],
  contextLines: number,
  expandedRegions: Set<string>
): SideBySideRow[] {
  const rows: SideBySideRow[] = [];

  for (const chunk of chunks) {
    const lines = chunk.lines;
    let i = 0;

    // Find change boundaries for collapsing
    const changeRegions = findChangeRegions(lines);
    const collapsible = computeCollapsibleRegions(lines, changeRegions, contextLines);

    while (i < lines.length) {
      // Check if we're in a collapsible region
      const collapse = collapsible.find(c => c.start === i);
      if (collapse && !expandedRegions.has(`${chunk.id}-${collapse.start}`)) {
        rows.push({
          left: null,
          right: null,
          chunkId: chunk.id,
          isFirstInChunk: i === 0,
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
          isFirstInChunk: i === 0,
        });
        i++;
      } else if (line.type === 'removed') {
        // Pair removed lines with subsequent added lines
        const removedStart = i;
        while (i < lines.length && lines[i].type === 'removed') i++;
        const addedStart = i;
        while (i < lines.length && lines[i].type === 'added') i++;

        const removedCount = addedStart - removedStart;
        const addedCount = i - addedStart;
        const maxCount = Math.max(removedCount, addedCount);

        for (let j = 0; j < maxCount; j++) {
          rows.push({
            left: j < removedCount ? lines[removedStart + j] : null,
            right: j < addedCount ? lines[addedStart + j] : null,
            chunkId: chunk.id,
            isFirstInChunk: removedStart + j === 0 || addedStart + j === 0,
          });
        }
      } else if (line.type === 'added') {
        rows.push({
          left: null,
          right: line,
          chunkId: chunk.id,
          isFirstInChunk: i === 0,
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
    // All unchanged — collapse if large enough
    if (lines.length > contextLines * 2 + 1) {
      return [{ start: contextLines, end: lines.length - contextLines }];
    }
    return [];
  }

  const collapsible: ChangeRegion[] = [];
  const MIN_COLLAPSE = 4; // Minimum lines to bother collapsing

  // Before first change
  if (changeRegions[0].start > contextLines + MIN_COLLAPSE) {
    collapsible.push({ start: 0, end: changeRegions[0].start - contextLines });
  }

  // Between changes
  for (let i = 0; i < changeRegions.length - 1; i++) {
    const gapStart = changeRegions[i].end + contextLines;
    const gapEnd = changeRegions[i + 1].start - contextLines;
    if (gapEnd - gapStart >= MIN_COLLAPSE) {
      collapsible.push({ start: gapStart, end: gapEnd });
    }
  }

  // After last change
  const lastEnd = changeRegions[changeRegions.length - 1].end;
  if (lines.length - lastEnd > contextLines + MIN_COLLAPSE) {
    collapsible.push({ start: lastEnd + contextLines, end: lines.length });
  }

  return collapsible;
}
