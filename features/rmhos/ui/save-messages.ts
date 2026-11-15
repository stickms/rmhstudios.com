/**
 * How a failed save is told to the person. The save codes are internal; none of them is shown.
 * `toast` raises a message, `notice` is a persistent line with an action (Notices.tsx), and
 * `none` says nothing (a restart is already pending, or the page does not know a save ran).
 */
import type { SaveResult } from '../engine/home-sync';

export type SaveReport =
  | { kind: 'none' }
  | { kind: 'toast'; key: 'storage-full' | 'not-saved' }
  | { kind: 'notice'; key: 'empty-home' | 'changed-elsewhere' };

export function reportSave(r: SaveResult): SaveReport {
  if (r.status === 'saved' || r.status === 'unchanged') return { kind: 'none' };
  if (r.status === 'storage-full') return { kind: 'toast', key: 'storage-full' };
  switch (r.code) {
    case 'suspended': // a backup replaced the files and a restart is pending
    case 'not-running':
      return { kind: 'none' };
    case 'empty_home':
      return { kind: 'notice', key: 'empty-home' };
    case 'changed_elsewhere':
      return { kind: 'notice', key: 'changed-elsewhere' };
    default: // bad_archive, storage_error, timeout, busy, share, agent errors
      return { kind: 'toast', key: 'not-saved' };
  }
}
