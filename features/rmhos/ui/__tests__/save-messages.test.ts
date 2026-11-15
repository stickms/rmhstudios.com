import { describe, expect, it } from 'vitest';
import { BackupError } from '../../engine/home-sync';
import {
  copyTime,
  putBackCopy,
  reportRestoreError,
  reportSave,
  restoreFailureCopy,
} from '../save-messages';

describe('reportSave', () => {
  it.each([
    [{ status: 'saved', bytes: 1 }, { kind: 'none' }],
    [{ status: 'unchanged' }, { kind: 'none' }],
    [{ status: 'storage-full' }, { kind: 'toast', key: 'storage-full' }],
    [{ status: 'failed', code: 'suspended' }, { kind: 'none' }],
    [{ status: 'failed', code: 'not-running' }, { kind: 'none' }],
    [{ status: 'failed', code: 'empty_home' }, { kind: 'notice', key: 'empty-home' }],
    [{ status: 'failed', code: 'changed_elsewhere' }, { kind: 'notice', key: 'changed-elsewhere' }],
    [{ status: 'failed', code: 'bad_archive' }, { kind: 'toast', key: 'not-saved' }],
    [{ status: 'failed', code: 'storage_error' }, { kind: 'toast', key: 'not-saved' }],
    [{ status: 'failed', code: 'timeout' }, { kind: 'toast', key: 'not-saved' }],
    [{ status: 'failed', code: 'whatever' }, { kind: 'toast', key: 'not-saved' }],
  ] as const)('%j', (result, expected) => {
    expect(reportSave(result as never)).toEqual(expected);
  });
});

/** A stand-in for t(): the defaultValue with {{x}} filled in, like i18next does for English. */
const t = (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
  o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(o[k]));

describe('reportRestoreError', () => {
  it.each([
    [new BackupError('invalid'), 'invalid'],
    [new BackupError('storage-full'), 'storage-full'],
    [new BackupError('storage_error'), 'not-stored'],
    [new BackupError('damaged_exists'), 'damaged-exists'],
    [new BackupError('previous_stale'), 'stale'],
    [new BackupError('locked'), 'locked'],
    [new Error('anything else'), 'not-stored'],
  ] as const)('%s', (e, expected) => expect(reportRestoreError(e)).toBe(expected));
});

describe('the copy of a restore', () => {
  it('a full browser says the backup was not restored and the current files are unchanged', () => {
    const text = restoreFailureCopy(t, 'storage-full');
    expect(text).toBe(
      'Browser storage is full. The backup was not restored. Your current files are unchanged.',
    );
    expect(text).not.toMatch(/Changes are not saved/);
  });

  it('a restore refused by the account lock says to restore in the other tab', () => {
    expect(restoreFailureCopy(t, 'locked')).toBe('rmhOS is open in another tab. Restore the backup there.');
  });

  it('the put-back confirm carries the time of the files it restores', () => {
    const at = Date.UTC(2026, 10, 14, 9, 30);
    const text = putBackCopy(t, at, 'en');
    expect(text).toContain(copyTime(at, 'en'));
    expect(text).toMatch(/^Put back the files from .+\? The restored backup is removed\.$/);
  });
});
