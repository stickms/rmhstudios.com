import { describe, expect, it, vi } from 'vitest';
import { backupBytes } from '../backup';
import type { SaveResult } from '../../engine/home-sync';

const bytes = (n: number) => new Uint8Array([n]);

function source(over: {
  ready?: boolean;
  save?: SaveResult;
  live?: Uint8Array | null | 'throws';
  stored?: { bytes: Uint8Array; savedAt: number } | null;
}) {
  return {
    desktopReady: over.ready ?? true,
    saveNow: vi.fn(async (): Promise<SaveResult> => over.save ?? { status: 'saved', bytes: 1 }),
    exportStored: vi.fn(async () => ('stored' in over ? over.stored! : { bytes: bytes(1), savedAt: 1000 })),
    exportLive: vi.fn(async () => {
      if (over.live === 'throws') throw new Error('agent');
      return 'live' in over ? over.live! : bytes(2);
    }),
  };
}

describe('backupBytes', () => {
  it('saves, then returns the stored archive as current', async () => {
    const s = source({});
    expect(await backupBytes(s)).toEqual({ kind: 'current', bytes: bytes(1) });
    expect(s.saveNow).toHaveBeenCalledOnce();
    expect(s.exportLive).not.toHaveBeenCalled();
  });

  it('unchanged counts as a good save', async () => {
    expect((await backupBytes(source({ save: { status: 'unchanged' } }))).kind).toBe('current');
  });

  it('a refused save falls back to the desktop read straight from the guest: still current', async () => {
    const s = source({ save: { status: 'storage-full' } });
    expect(await backupBytes(s)).toEqual({ kind: 'current', bytes: bytes(2) });
  });

  it('when neither a save nor a live read works the stored copy is STALE, with its time', async () => {
    for (const live of [null, 'throws'] as const) {
      const s = source({ save: { status: 'failed', code: 'timeout' }, live });
      expect(await backupBytes(s)).toEqual({ kind: 'stale', bytes: bytes(1), savedAt: 1000 });
    }
  });

  it('nothing at all is none', async () => {
    const s = source({ save: { status: 'failed', code: 'x' }, live: null, stored: null });
    expect(await backupBytes(s)).toEqual({ kind: 'none' });
  });

  it('a good save whose stored copy cannot be read falls back to the live read', async () => {
    const s = source({ stored: null });
    expect(await backupBytes(s)).toEqual({ kind: 'current', bytes: bytes(2) });
  });

  it('with no machine running, the stored archive is the newest and is not offered as stale', async () => {
    const s = source({ ready: false });
    expect(await backupBytes(s)).toEqual({ kind: 'current', bytes: bytes(1) });
    expect(s.saveNow).not.toHaveBeenCalled();
    expect((await backupBytes(source({ ready: false, stored: null }))).kind).toBe('none');
  });
});
