import { describe, expect, it } from 'vitest';
import { reportSave } from '../save-messages';

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
