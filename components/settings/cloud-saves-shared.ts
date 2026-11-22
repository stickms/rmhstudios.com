/** Small helpers the cloud save manager's two components share (no strings: those are translated in the components). */
import { games } from '@/lib/catalog';
import { toBackupFile } from '@/lib/game-saves/backup';
import { currentDocumentLocale, formatDateTime } from '@/lib/core/format';

export function gameInfo(gameId: string) {
  return games.find((g) => g.id === gameId);
}

/** Catalog title; an unlisted game (not in the catalog) is shown by its id, capitalised. */
export function gameTitle(gameId: string): string {
  return gameInfo(gameId)?.title ?? gameId.charAt(0).toUpperCase() + gameId.slice(1);
}

export function formatSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  return `${(bytes / 1000).toFixed(bytes < 10_000 ? 1 : 0)} KB`;
}

export function formatWhen(iso: string): string {
  return formatDateTime(new Date(iso), currentDocumentLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** Hand a JSON document to the browser as a file download. */
export function downloadBackup(gameId: string, savedAt: string, saveData: Record<string, unknown>, fileName: string) {
  const blob = new Blob([JSON.stringify(toBackupFile(gameId, savedAt, saveData), null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
