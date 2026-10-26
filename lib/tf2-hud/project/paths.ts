/**
 * Path rules for a TF2 custom HUD. Everything in a project is a forward-slash
 * path relative to the HUD root (the folder that holds `resource/`, `scripts/`,
 * `materials/`, `sound/` and `info.vdf`).
 */

/** Top-level folders a HUD may contain, in the order the tree shows them. */
export const HUD_ROOT_FOLDERS = ['resource', 'scripts', 'materials', 'sound'] as const;

export const TEXT_EXTENSIONS = new Set(['res', 'txt', 'vdf', 'vmt', 'menu', 'cfg', 'layout', 'md']);

export const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'tga', 'vtf']);
export const FONT_EXTENSIONS = new Set(['ttf', 'otf']);
export const SOUND_EXTENSIONS = new Set(['wav', 'mp3', 'ogg']);

/** File types a HUD may contain; anything else is rejected on import and upload. */
export const ALLOWED_HUD_EXTENSIONS = new Set([
  'res',
  'txt',
  'vdf',
  'vmt',
  'menu',
  'cfg',
  'layout',
  'md',
  'png',
  'jpg',
  'jpeg',
  'tga',
  'vtf',
  'ttf',
  'otf',
  'wav',
  'mp3',
  'ogg',
]);

export const MAX_PATH_LENGTH = 240;

const MB = 1024 * 1024;

/**
 * The largest a single file of this type may be (uncompressed). Panel and script
 * files are text and tiny; a `.vmt` is a few hundred bytes; fonts and textures are
 * the bulk; sounds are capped hardest because audio is what makes a HUD huge.
 */
export function maxBytesFor(path: string): number {
  const ext = extOf(path);
  if (ext === 'vmt') return 64 * 1024;
  if (TEXT_EXTENSIONS.has(ext)) return 1 * MB;
  if (FONT_EXTENSIONS.has(ext)) return 3 * MB;
  if (SOUND_EXTENSIONS.has(ext)) return 4 * MB;
  if (IMAGE_EXTENSIONS.has(ext)) return 4 * MB;
  return 1 * MB;
}

/** Formats that are already compressed; recompressing them only costs CPU. */
export const INCOMPRESSIBLE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'mp3', 'ogg']);

export function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase();
}

export const isTextPath = (p: string): boolean => TEXT_EXTENSIONS.has(extOf(p));

export type FileCategory =
  'scheme' | 'panel' | 'script' | 'image' | 'font' | 'sound' | 'text' | 'other';

export function categoryOf(path: string): FileCategory {
  const ext = extOf(path);
  const lower = path.toLowerCase();
  if (lower.endsWith('scheme.res')) return 'scheme';
  if (ext === 'res') return 'panel';
  if (IMAGE_EXTENSIONS.has(ext) || ext === 'vmt') return 'image';
  if (FONT_EXTENSIONS.has(ext)) return 'font';
  if (SOUND_EXTENSIONS.has(ext)) return 'sound';
  if (lower.startsWith('scripts/')) return 'script';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  return 'other';
}

/**
 * Normalise an untrusted path (zip entry, user input). Returns `null` for
 * anything that could escape the HUD root or is not a plain relative path.
 */
export function sanitizePath(raw: string): string | null {
  if (!raw || raw.length > MAX_PATH_LENGTH) return null;
  if (raw.includes('\0')) return null;
  const unified = raw.replace(/\\/g, '/');
  if (unified.startsWith('/') || /^[a-zA-Z]:/.test(unified)) return null;
  const parts: string[] = [];
  for (const seg of unified.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') return null;
    // Control characters are rejected on purpose, so the range is the point.
    // eslint-disable-next-line no-control-regex
    if (/[<>:"|?*\u0000-\u001f]/.test(seg)) return null;
    parts.push(seg);
  }
  if (parts.length === 0) return null;
  return parts.join('/');
}

export function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
