import { describe, expect, it } from 'vitest';
import { toolbarState } from '../toolbar-state';

type Input = Parameters<typeof toolbarState>[0];
const base: Input = {
  phase: 'running',
  desktopReady: true,
  lastSave: null,
  saving: false,
  dirty: false,
  net: 'on',
};
const run = (over: Partial<Input>) => toolbarState({ ...base, ...over });

describe('toolbarState', () => {
  it.each([
    ['saved', { lastSave: { status: 'saved', bytes: 10 } }, 'save.saved', false],
    ['unchanged', { lastSave: { status: 'unchanged' } }, 'save.saved', false],
    ['never saved, nothing changed', { lastSave: null }, 'save.saved', false],
    ['saving', { saving: true, lastSave: { status: 'saved', bytes: 1 } }, 'save.saving', true],
    ['dirty', { dirty: true, lastSave: { status: 'saved', bytes: 1 } }, 'save.unsaved', false],
    ['storage full', { lastSave: { status: 'storage-full' } }, 'save.storageFull', false],
    ['failed', { lastSave: { status: 'failed', code: 'timeout' } }, 'save.failed', false],
    [
      'failed beats dirty',
      { dirty: true, lastSave: { status: 'failed', code: 'x' } },
      'save.failed',
      false,
    ],
    ['not ready', { desktopReady: false }, 'save.saved', true],
  ] as Array<[string, Partial<Input>, string, boolean]>)('%s', (_n, over, key, disabled) => {
    const s = run(over);
    expect(s.saveLabelKey).toBe(key);
    expect(s.saveDisabled).toBe(disabled);
  });

  it.each(['idle', 'downloading', 'booting'] as const)(
    'phase %s: no restart or restore, but the stored files can still be downloaded',
    (phase) => {
      const s = run({ phase, desktopReady: false });
      expect(s.saveDisabled).toBe(true);
      expect(s.showRestart).toBe(false);
      expect(s.showRestore).toBe(false);
      expect(s.showBackup).toBe(true);
    },
  );

  it('shows restart, restore and backup once running; after a failure backup stays, restore goes', () => {
    expect(run({})).toMatchObject({ showRestart: true, showBackup: true, showRestore: true });
    expect(run({ phase: 'failed', desktopReady: false })).toMatchObject({
      showRestart: true,
      showBackup: true,
      showRestore: false,
    });
  });

  it('signed out: no restart, backup or restore (there is no account and no machine)', () => {
    expect(run({ phase: 'idle', desktopReady: false, signedOut: true })).toMatchObject({
      showRestart: false,
      showBackup: false,
      showRestore: false,
      saveDisabled: true,
    });
  });

  it.each([
    ['off', 'net.off'],
    ['connecting', 'net.connecting'],
    ['on', 'net.online'],
    ['error', 'net.unavailable'],
  ] as const)('net %s', (net, key) => {
    expect(run({ net }).netLabelKey).toBe(key);
  });
});
