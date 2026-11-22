/**
 * Backup download. With the desktop up it saves first, so the file holds what is on screen; if
 * that save is refused (storage full, another tab changed the entry) the desktop's home is taken
 * straight from the guest. If neither gives a CURRENT archive, the last saved copy is returned as
 * `stale`, with when it was saved, and the caller must ask before offering it: a stale file is
 * never handed over as if it were current.
 */
import type { RmhosSessionValue } from './useRmhosSession';

type Source = Pick<RmhosSessionValue, 'desktopReady' | 'saveNow' | 'exportStored' | 'exportLive'>;

export type BackupResult =
  | {
      kind: 'current';
      bytes: Uint8Array;
    }
  | {
      kind: 'stale';
      bytes: Uint8Array;
      savedAt: number;
    }
  | {
      kind: 'none';
    };

export async function backupBytes(s: Source): Promise<BackupResult> {
  // No machine running: the stored home is the newest copy there is.
  if (!s.desktopReady) {
    const stored = await s.exportStored();
    return stored
      ? {
          kind: 'current',
          bytes: stored.bytes,
        }
      : {
          kind: 'none',
        };
  }
  const r = await s.saveNow();
  if (r.status === 'saved' || r.status === 'unchanged') {
    const stored = await s.exportStored();
    if (stored)
      return {
        kind: 'current',
        bytes: stored.bytes,
      };
  }
  const live = await s.exportLive().catch(() => null);
  if (live)
    return {
      kind: 'current',
      bytes: live,
    };
  const stored = await s.exportStored().catch(() => null);
  return stored
    ? {
        kind: 'stale',
        bytes: stored.bytes,
        savedAt: stored.savedAt,
      }
    : {
        kind: 'none',
      };
}
