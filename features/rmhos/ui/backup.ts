/**
 * Backup download: the saved home as a file. With the desktop up it saves first, so the file
 * holds what is on screen; if that save is refused (storage full, another tab changed the entry)
 * the desktop's home is taken straight from the guest instead, so a backup is always possible.
 */
import type { RmhosSessionValue } from './useRmhosSession';

type Source = Pick<RmhosSessionValue, 'desktopReady' | 'saveNow' | 'exportArchive' | 'exportLive'>;

export async function backupBytes(s: Source): Promise<Uint8Array | null> {
  if (!s.desktopReady) return s.exportArchive();
  const r = await s.saveNow();
  if (r.status === 'saved' || r.status === 'unchanged') return s.exportArchive();
  return (await s.exportLive().catch(() => null)) ?? s.exportArchive();
}
