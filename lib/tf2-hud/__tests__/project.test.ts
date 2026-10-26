import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha1Hex, sha1OfText } from '../util/sha1';
import { BaseCache, parseManifest, type BaseLoader } from '../project/base';
import { diffLines, diffStats, withContext } from '../project/diff';
import {
  changedFiles,
  deleteFile,
  listPaths,
  renamePath,
  revertFile,
  statusOf,
  textContent,
  writeFile,
} from '../project/model';
import { sanitizePath } from '../project/paths';

const BASE = path.resolve(__dirname, '../../../public/tf2-hud/base');
const manifestRaw = JSON.parse(readFileSync(path.join(BASE, 'manifest.json'), 'utf8'));
const index = parseManifest(manifestRaw);

describe('sha1', () => {
  it('matches known vectors and the base manifest', () => {
    expect(sha1OfText('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(sha1OfText('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    const f = 'resource/clientscheme.res';
    expect(sha1Hex(readFileSync(path.join(BASE, f)))).toBe(index.files.get(f)!.sha1);
  });
});

describe('overlay model', () => {
  const f = 'resource/ui/hudplayerhealth.res';
  const original = readFileSync(path.join(BASE, f), 'utf8');

  it('tracks added / modified / deleted and drops no-op edits', () => {
    let o = writeFile(new Map(), index, f, textContent(original + '\n// x'));
    expect(statusOf(o, index, f)).toBe('modified');
    o = writeFile(o, index, f, textContent(original));
    expect(o.size).toBe(0);
    expect(statusOf(o, index, f)).toBe('unchanged');

    o = writeFile(o, index, 'resource/ui/new.res', textContent('"a" {}'));
    expect(statusOf(o, index, 'resource/ui/new.res')).toBe('added');
    o = deleteFile(o, index, f);
    expect(statusOf(o, index, f)).toBe('deleted');
    expect(listPaths(o, index)).not.toContain(f);
    expect(listPaths(o, index)).toContain('resource/ui/new.res');
    expect(
      changedFiles(o, index)
        .map((c) => c.status)
        .sort(),
    ).toEqual(['added', 'deleted']);
    expect(statusOf(revertFile(o, f), index, f)).toBe('unchanged');
  });

  it('renames files and folders', () => {
    const paths = listPaths(new Map(), index);
    const read = (p: string) => textContent(`content of ${p}`);
    const o = renamePath(new Map(), index, 'resource/ui/econ/', 'resource/ui/shop/', read, paths);
    const after = listPaths(o, index);
    expect(after.some((p) => p.startsWith('resource/ui/econ/'))).toBe(false);
    expect(after.some((p) => p.startsWith('resource/ui/shop/'))).toBe(true);
  });
});

describe('base cache', () => {
  it('fetches lazily, dedupes in-flight requests and ignores unknown paths', async () => {
    let calls = 0;
    const loader: BaseLoader = {
      manifest: async () => manifestRaw,
      file: async (p) => {
        calls++;
        return new Uint8Array(readFileSync(path.join(BASE, p)));
      },
    };
    const cache = new BaseCache(loader);
    const f = 'resource/ui/hudplayerhealth.res';
    await Promise.all([cache.ensure([f]), cache.ensure([f, 'nope.res'])]);
    expect(calls).toBe(1);
    expect(cache.getText(f)).toContain('HudPlayerHealth');
    expect(cache.getText('nope.res')).toBeUndefined();
  });
});

describe('diff', () => {
  it('produces minimal line diffs with numbering', () => {
    const d = diffLines('a\nb\nc\nd\n', 'a\nB\nc\nd\ne\n');
    expect(diffStats(d)).toEqual({ added: 2, removed: 1 });
    expect(d.filter((l) => l.kind === 'eq').map((l) => l.text)).toEqual(['a', 'c', 'd']);
    expect(d.find((l) => l.kind === 'add')!.newLine).toBe(2);
  });

  it('handles empty sides, CRLF and context folding', () => {
    expect(diffLines('', 'x\r\ny').length).toBe(2);
    expect(diffLines('same\r\n', 'same\n').every((l) => l.kind === 'eq')).toBe(true);
    const long = Array.from({ length: 50 }, (_, i) => `l${i}`).join('\n');
    const folded = withContext(diffLines(long, long.replace('l25', 'X')), 2);
    expect(folded.filter((l) => l === null).length).toBe(2);
  });
});

describe('path sanitising', () => {
  it('rejects traversal and absolute paths', () => {
    for (const bad of [
      '../a',
      'a/../../b',
      '/etc/passwd',
      'C:\\x',
      'a\0b',
      '',
      'a/b/..',
      'x/<y>',
    ]) {
      expect(sanitizePath(bad), bad).toBeNull();
    }
    expect(sanitizePath('resource\\ui//a.res')).toBe('resource/ui/a.res');
    expect(sanitizePath('./a/./b')).toBe('a/b');
  });
});

describe('edit history', () => {
  it('undoes, redoes and travels through labelled steps', async () => {
    const { useEditor } = await import('../store');
    const st = () => useEditor.getState();
    st().newProject();
    const p = 'resource/ui/new.res';
    st().createFile(p, '"a" {}');
    st().writeText(p, '"a" { "x" "1" }', 'k1');
    st().writeText(p, '"a" { "x" "2" }', 'k2');
    expect(st().past.map((e) => e.label)).toEqual([
      'New resource/ui/new.res',
      'Edit resource/ui/new.res',
      'Edit resource/ui/new.res',
    ]);
    expect(st().readText(p)).toBe('"a" { "x" "2" }');

    st().undo();
    expect(st().readText(p)).toBe('"a" { "x" "1" }');
    expect(st().future).toHaveLength(1);
    st().travel(-2);
    expect(st().overlay.size).toBe(0);
    expect(st().past).toHaveLength(0);
    expect(st().future).toHaveLength(3);
    st().travel(99); // clamps at the newest state
    expect(st().readText(p)).toBe('"a" { "x" "2" }');
    expect(st().future).toHaveLength(0);
    st().undo();
    st().writeText(p, 'branch', 'k3'); // a new edit discards the redo branch
    expect(st().future).toHaveLength(0);
  });

  it('coalesces rapid edits to one file into one step', async () => {
    const { useEditor } = await import('../store');
    const st = () => useEditor.getState();
    st().newProject();
    st().createFile('resource/ui/c.res', '');
    const before = st().past.length;
    for (const ch of ['a', 'ab', 'abc']) st().writeText('resource/ui/c.res', ch, 'typing');
    expect(st().past.length - before).toBe(1);
  });
});
