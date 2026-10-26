import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { detectRoot, importZip, ImportError } from '../zip/import';
import { buildInfoVdf, exportZip, slugify } from '../zip/export';
import { sha1OfText } from '../util/sha1';
import { textContent } from '../project/model';
import type { BaseIndex } from '../project/types';

const base: BaseIndex = {
  version: 1,
  source: { repo: 'r', commit: 'c', license: 'GPL-3.0-only' },
  files: new Map([['resource/ui/a.res', { size: 5, sha1: sha1OfText('"a" {}') }]]),
};

async function makeZip(files: Record<string, string | Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [k, v] of Object.entries(files)) zip.file(k, v);
  return zip.generateAsync({ type: 'uint8array' });
}

describe('zip import', () => {
  it('finds a nested HUD root, normalises case and drops unchanged files', async () => {
    const data = await makeZip({
      'tf/custom/myhud/Resource/UI/A.res': '"a" {}',
      'tf/custom/myhud/resource/ui/b.res': '"b" {}',
      'tf/custom/myhud/materials/hud/x.png': new Uint8Array([1, 2, 3]),
      'tf/custom/myhud/info.vdf': '"hud" { }',
      '__MACOSX/._junk': 'x',
      'tf/custom/myhud/scripts/run.exe': 'MZ',
    });
    const r = await importZip(data, base);
    expect(r.root).toBe('tf/custom/myhud');
    expect(r.unchanged).toBe(1);
    expect([...r.overlay.keys()].sort()).toEqual(['materials/hud/x.png', 'resource/ui/b.res']);
    expect(r.infoVdf).toContain('hud');
    expect(r.warnings.join(' ')).toMatch(/unsupported/);
  });

  it('skips traversal and absolute paths', async () => {
    const zip = new JSZip();
    zip.file('resource/ui/ok.res', '"x" {}');
    zip.file('../../evil.res', 'x', { createFolders: false });
    zip.file('/abs/evil.res', 'x');
    const r = await importZip(await zip.generateAsync({ type: 'uint8array' }), base);
    expect([...r.overlay.keys()]).toEqual(['resource/ui/ok.res']);
    expect(r.warnings.join(' ')).toMatch(/outside the HUD folders/);
  });

  it('rejects zip bombs, huge entry counts, non-zips and non-HUD archives', async () => {
    const bomb = await makeZip({ 'resource/ui/zeros.res': new Uint8Array(200_000) });
    await expect(
      importZip(bomb, base, { maxEntries: 10, maxFileBytes: 1000, maxTotalBytes: 1e9 }),
    ).rejects.toMatchObject({ code: 'too-large' });

    const many = await makeZip({
      'resource/a.res': 'a',
      'resource/b.res': 'b',
      'resource/c.res': 'c',
    });
    await expect(
      importZip(many, base, { maxEntries: 2, maxFileBytes: 1e6, maxTotalBytes: 1e9 }),
    ).rejects.toMatchObject({ code: 'too-many-entries' });

    await expect(importZip(new Uint8Array([1, 2, 3, 4]), base)).rejects.toBeInstanceOf(ImportError);
    await expect(importZip(await makeZip({ 'notes.txt': 'hi' }), base)).rejects.toMatchObject({
      code: 'no-hud',
    });
  });

  it('detects the root with the most HUD folders', () => {
    expect(detectRoot(['a/resource/x.res', 'a/scripts/y.txt', 'b/resource/z.res'])).toBe('a');
    expect(detectRoot(['resource/x.res'])).toBe('');
  });
});

describe('zip export', () => {
  it('lays out a TF2 custom folder with licence and info.vdf', async () => {
    const blob = await exportZip({
      meta: { name: 'Cool HUD!', description: 'd', author: 'me', tags: [] },
      files: new Map([['resource/ui/a.res', textContent('"a" {}')]]),
      licenseText: 'GPL',
      scope: 'full',
      baseCommit: 'b0635b402419f602c72dfaa9835b3a0795622623',
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(
      Object.keys(zip.files)
        .filter((n) => !n.endsWith('/'))
        .sort(),
    ).toEqual([
      'cool_hud/LICENSE',
      'cool_hud/README.txt',
      'cool_hud/info.vdf',
      'cool_hud/resource/ui/a.res',
    ]);
    expect(await zip.file('cool_hud/info.vdf')!.async('string')).toBe(
      buildInfoVdf({ name: 'Cool HUD!', description: 'd', author: 'me', tags: [] }),
    );
  });

  it('slugifies hostile names', () => {
    expect(slugify('../../Évil / Name')).toBe('evil_name');
    expect(slugify('')).toBe('my_hud');
  });
});
