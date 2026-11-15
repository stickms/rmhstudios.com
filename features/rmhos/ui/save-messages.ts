/**
 * How a failed save is told to the person. The save codes are internal; none of them is shown.
 * `toast` raises a message, `notice` is a persistent line with an action (Notices.tsx), and
 * `none` says nothing (a restart is already pending, or the page does not know a save ran).
 */
import { BackupError, type SaveResult } from '../engine/home-sync';
import { formatTime } from './format';

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

/** Why storing a backup (or putting the previous files back) failed, in the page's terms. */
export type RestoreFailure = 'invalid' | 'storage-full' | 'damaged-exists' | 'stale' | 'not-stored';

export function reportRestoreError(e: unknown): RestoreFailure {
  if (!(e instanceof BackupError)) return 'not-stored';
  switch (e.code) {
    case 'invalid':
      return 'invalid';
    case 'storage-full':
      return 'storage-full';
    case 'damaged_exists':
      return 'damaged-exists';
    case 'previous_stale':
      return 'stale';
    default:
      return 'not-stored';
  }
}

type T = (key: string, options: { defaultValue: string; [k: string]: unknown }) => string;

/** A stored copy's time, the way every dialog names it. */
export function copyTime(savedAt: number, locale: string): string {
  return formatTime(savedAt, locale);
}

/** The put-back confirmation names the time of the files it restores. */
export function putBackCopy(t: T, savedAt: number, locale: string): string {
  return t('put-back-confirm', {
    defaultValue: 'Put back the files from {{time}}? The restored backup is removed.',
    time: copyTime(savedAt, locale),
  });
}

/** What a failed restore says; storage-full is its own sentence, not "changes are not saved". */
export function restoreFailureCopy(t: T, f: RestoreFailure): string {
  switch (f) {
    case 'invalid':
      return t('backup-invalid', { defaultValue: 'That file is not an rmhOS backup.' });
    case 'storage-full':
      return t('restore-storage-full', {
        defaultValue:
          'Browser storage is full. The backup was not restored. Your current files are unchanged.',
      });
    case 'stale':
      return t('put-back-stale', {
        defaultValue:
          'The restored backup has been saved over, so the previous files cannot be put back.',
      });
    default:
      return t('backup-not-stored', {
        defaultValue: 'Could not store the backup. Your files are unchanged.',
      });
  }
}
