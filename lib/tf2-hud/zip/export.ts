/**
 * Project → zip, laid out so extracting into `tf/custom/` gives a working HUD:
 *
 *   <slug>/resource/…   <slug>/scripts/…   <slug>/materials/…   <slug>/sound/…
 *   <slug>/info.vdf     <slug>/LICENSE     <slug>/README.txt
 */

import { contentBytes } from '../project/model';
import type { FileContent, HudMeta } from '../project/types';

export type ExportScope = 'full' | 'changed';

export interface ExportOptions {
  meta: HudMeta;
  /** Every file to write, already resolved (overlay over base). */
  files: ReadonlyMap<string, FileContent>;
  licenseText?: string;
  includeInfoVdf?: boolean;
  /** Existing `info.vdf` text to keep instead of generating one. */
  infoVdf?: string;
  scope: ExportScope;
  baseCommit?: string;
}

export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return s || 'my_hud';
}

const q = (v: string) =>
  `"${v
    .replace(/\\/g, '\\\\')
    .replace(/"/g, "'")
    .replace(/[\r\n]+/g, ' ')}"`;

export function buildInfoVdf(meta: HudMeta): string {
  const lines = ['"hud"', '{', `\t"ui_version"\t\t"3"`, `\t"name"\t\t\t${q(meta.name)}`];
  if (meta.author) lines.push(`\t"author"\t\t${q(meta.author)}`);
  if (meta.description) lines.push(`\t"description"\t${q(meta.description)}`);
  lines.push('}', '');
  return lines.join('\r\n');
}

export function buildReadme(meta: HudMeta, scope: ExportScope, baseCommit?: string): string {
  return [
    `${meta.name}`,
    '='.repeat(Math.max(3, meta.name.length)),
    '',
    meta.description || '(no description)',
    '',
    'Installing',
    '----------',
    '1. Extract this folder into your Team Fortress 2 "tf/custom" directory,',
    '   e.g. Steam/steamapps/common/Team Fortress 2/tf/custom/<this folder>.',
    '2. Restart TF2 (or type "hud_reloadscheme" in the console).',
    scope === 'changed'
      ? '\nThis archive contains only the files changed from the TF2 Default base HUD.\n'
      : '',
    'Made with RMH TF2 HUD Editor.',
    baseCommit ? `Base HUD: TF2 Default (${baseCommit}).` : '',
    'The base HUD files come with the licence in the LICENSE file; see it for the terms that apply to this HUD.',
    '',
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\r\n');
}

export async function exportZip(opts: ExportOptions): Promise<Blob> {
  const { default: JSZipCtor } = await import('jszip');
  const zip = new JSZipCtor();
  const root = slugify(opts.meta.name);
  const dir = zip.folder(root)!;

  const paths = [...opts.files.keys()].sort();
  for (const path of paths) {
    dir.file(path, contentBytes(opts.files.get(path)!), {
      // The files are already tiny text or already-compressed media.
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
  }
  if (opts.includeInfoVdf !== false) {
    dir.file('info.vdf', opts.infoVdf ?? buildInfoVdf(opts.meta));
  }
  if (opts.licenseText) dir.file('LICENSE', opts.licenseText);
  dir.file('README.txt', buildReadme(opts.meta, opts.scope, opts.baseCommit));

  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
}
