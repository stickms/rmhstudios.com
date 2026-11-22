/** Client-side file helpers for the exports. Nothing here uploads. */

/** A file name that is safe on every system, without its extension; falls back to `fallback` when nothing is left. */
export function safeFileName(name: string, fallback = 'project'): string {
  const printable = [...name].filter((c) => c.charCodeAt(0) > 0x1f && c.charCodeAt(0) !== 0x7f).join('');
  const cleaned = printable
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .slice(0, 80);
  return cleaned || fallback;
}

/** `m:ss` for a length in seconds. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Hand a blob to the browser as a download. The object URL is released once the click has been handled. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
