import { describe, expect, it } from 'vitest';
import { computeDiff, parseUnifiedDiff } from './diff';

describe('parseUnifiedDiff', () => {
  it('parses standard git unified diff with multiple files', () => {
    const input = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1111111..2222222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,2 +1,2 @@',
      '-const foo = 1;',
      '+const foo = 2;',
      ' export const ok = true;',
      'diff --git a/src/b.ts b/src/b.ts',
      'index 3333333..4444444 100644',
      '--- a/src/b.ts',
      '+++ b/src/b.ts',
      '@@ -1,1 +1,2 @@',
      ' export const x = 1;',
      '+export const y = 2;',
      '',
    ].join('\n');

    const files = parseUnifiedDiff(input);

    expect(files).toHaveLength(2);
    expect(files[0].newPath).toBe('src/a.ts');
    expect(files[0].additions).toBe(1);
    expect(files[0].deletions).toBe(1);
    expect(files[1].newPath).toBe('src/b.ts');
    expect(files[1].additions).toBe(1);
    expect(files[1].deletions).toBe(0);
  });

  it('classifies rename-only patches without hunks', () => {
    const input = [
      'diff --git a/old.txt b/new.txt',
      'similarity index 100%',
      'rename from old.txt',
      'rename to new.txt',
      '',
    ].join('\n');

    const files = parseUnifiedDiff(input);

    expect(files).toHaveLength(1);
    expect(files[0].oldPath).toBe('old.txt');
    expect(files[0].newPath).toBe('new.txt');
    expect(files[0].type).toBe('renamed');
    expect(files[0].chunks).toHaveLength(0);
  });

  it('classifies /dev/null as added file', () => {
    const input = [
      'diff --git a/dev/null b/new.txt',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/new.txt',
      '@@ -0,0 +1,2 @@',
      '+hello',
      '+world',
      '',
    ].join('\n');

    const files = parseUnifiedDiff(input);

    expect(files).toHaveLength(1);
    expect(files[0].type).toBe('added');
    expect(files[0].newPath).toBe('new.txt');
    expect(files[0].additions).toBe(2);
    expect(files[0].deletions).toBe(0);
  });

  it('keeps binary/image-only patches in file list', () => {
    const input = [
      'diff --git a/assets/logo.png b/assets/logo.png',
      'index 1234567..89abcde 100644',
      'Binary files a/assets/logo.png and b/assets/logo.png differ',
      '',
    ].join('\n');

    const files = parseUnifiedDiff(input);

    expect(files).toHaveLength(1);
    expect(files[0].oldPath).toBe('assets/logo.png');
    expect(files[0].newPath).toBe('assets/logo.png');
    expect(files[0].type).toBe('modified');
    expect(files[0].chunks).toHaveLength(0);
  });

  it('keeps binary files when mixed with text patches', () => {
    const input = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1111111..2222222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1 +1 @@',
      '-const foo = 1;',
      '+const foo = 2;',
      'diff --git a/docs/screenshot copy.jpg b/docs/screenshot copy.jpg',
      'new file mode 100644',
      'index 0000000..042ec99',
      'Binary files /dev/null and b/docs/screenshot copy.jpg differ',
      'diff --git a/src/b.ts b/src/b.ts',
      'index 3333333..4444444 100644',
      '--- a/src/b.ts',
      '+++ b/src/b.ts',
      '@@ -1 +1,2 @@',
      ' export const x = 1;',
      '+export const y = 2;',
      '',
    ].join('\n');

    const files = parseUnifiedDiff(input);

    expect(files).toHaveLength(3);
    expect(files.some(f => f.newPath === 'src/a.ts')).toBe(true);
    expect(files.some(f => f.newPath === 'src/b.ts')).toBe(true);
    const binary = files.find(f => f.newPath === 'docs/screenshot copy.jpg');
    expect(binary).toBeTruthy();
    expect(binary?.chunks).toHaveLength(0);
  });
});

describe('computeDiff', () => {
  it('produces line and word-level changes', () => {
    const result = computeDiff('const foo = 1;\n', 'const bar = 2;\n', 'a.ts');

    expect(result.newPath).toBe('a.ts');
    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(1);

    const changedLines = result.chunks.flatMap(chunk => chunk.lines).filter(line => line.type !== 'unchanged');
    expect(changedLines).toHaveLength(2);
    expect(changedLines[0].wordSegments?.length).toBeGreaterThan(0);
    expect(changedLines[1].wordSegments?.length).toBeGreaterThan(0);
  });
});
