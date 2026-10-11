/**
 * Unread count in the browser tab — "(3) RMH Studios" plus a dot on the
 * favicon, the way Gmail, Discord and X do it. People with twenty tabs find
 * you by the badge.
 *
 * Cost model: nothing runs per frame and nothing polls. The count comes from
 * subscriptions the shell already holds (pulse + DM stream); the title is
 * re-prefixed only when `<head>` actually changes (a navigation), and the
 * favicon is redrawn only when the count crosses 0 ↔ non-zero.
 */

const PREFIX_RE = /^\(\d+\+?\) /;
const PREF_KEY = 'rmh-tab-badge';
export const TAB_BADGE_PREF_EVENT = 'rmh:tab-badge-pref';

export function formatTabCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '';
  return count > 99 ? '99+' : String(Math.floor(count));
}

/** `title` with any previous badge removed and the new one (if any) applied. */
export function badgedTitle(title: string, count: number): string {
  const base = title.replace(PREFIX_RE, '');
  const label = formatTabCount(count);
  return label ? `(${label}) ${base}` : base;
}

export function readTabBadgePref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writeTabBadgePref(on: boolean): void {
  try {
    if (on) localStorage.removeItem(PREF_KEY);
    else localStorage.setItem(PREF_KEY, '0');
  } catch {
    /* storage blocked — the toggle just won't persist */
  }
  window.dispatchEvent(new CustomEvent(TAB_BADGE_PREF_EVENT));
}

// ─── Favicon ──────────────────────────────────────────────────────

const FAVICON_SRC = '/favicon.svg';
let baseIcon: HTMLImageElement | null = null;
let baseIconReady: Promise<HTMLImageElement | null> | null = null;
let currentBlobUrl: string | null = null;

function iconLink(): HTMLLinkElement | null {
  return document.querySelector<HTMLLinkElement>(
    'link[rel="icon"][type="image/svg+xml"], link[rel="icon"]',
  );
}

function loadBaseIcon(): Promise<HTMLImageElement | null> {
  if (baseIconReady) return baseIconReady;
  baseIconReady = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      baseIcon = img;
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = FAVICON_SRC;
  });
  return baseIconReady;
}

/** Draw (or remove) the unread dot on the favicon. */
export async function setFaviconDot(on: boolean): Promise<void> {
  const link = iconLink();
  if (!link) return;
  if (!on) {
    if (currentBlobUrl) {
      link.href = FAVICON_SRC;
      URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = null;
    }
    return;
  }
  const img = baseIcon ?? (await loadBaseIcon());
  if (!img) return;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(img, 0, 0, size, size);
  // The theme's accent, read once per redraw (which only happens on 0 ↔ n).
  const accent = getComputedStyle(document.documentElement)
    .getPropertyValue('--site-accent')
    .trim();
  const r = size * 0.22;
  ctx.beginPath();
  ctx.arc(size - r - 2, r + 2, r + 3, 0, Math.PI * 2);
  ctx.fillStyle =
    getComputedStyle(document.documentElement).getPropertyValue('--site-bg').trim() || '#000';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(size - r - 2, r + 2, r, 0, Math.PI * 2);
  ctx.fillStyle = accent || 'currentColor';
  ctx.fill();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const previous = currentBlobUrl;
  currentBlobUrl = url;
  link.href = url;
  if (previous) URL.revokeObjectURL(previous);
}
