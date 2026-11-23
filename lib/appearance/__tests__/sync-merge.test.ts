// @vitest-environment node
/**
 * Turning appearance sync back on: the most recent side wins, field by field (owner, 2026-11-23). A field the device
 * never set (a theme that only follows the OS) is never pushed; readable font keeps today's rule that the account wins.
 */
import { describe, expect, it } from 'vitest';
import { mergeOnSyncEnable, type AppearanceFields } from '../sync-merge';

const device: AppearanceFields = {
  style: 'graphite',
  readableFont: true,
  colorVision: 'none',
  jellyMotion: 'still',
  fontMain: 'inter',
  fontReading: 'literata',
  fontMono: 'dm-mono',
};
const account = {
  style: 'default',
  readableFont: false,
  colorVision: 'tritanopia',
  jellyMotion: null,
  fontMain: 'lora',
  fontReading: null,
  fontMono: 'geist-mono',
};
const T = (iso: string) => Date.parse(iso);

describe('mergeOnSyncEnable', () => {
  it('device newer: its fields are pushed, readable font is taken from the account', () => {
    const r = mergeOnSyncEnable({
      device,
      deviceChangedAt: T('2026-11-23T12:00:00Z'),
      account,
      accountUpdatedAt: '2026-11-22T12:00:00Z',
    });
    expect(r.push).toEqual({
      style: 'graphite',
      colorVision: 'none',
      jellyMotion: 'still',
      fontMain: 'inter',
      fontReading: 'literata',
      fontMono: 'dm-mono',
    });
    expect(r.apply).toEqual({ readableFont: false });
  });

  it("account newer: the account's non-null fields are applied, nothing is pushed", () => {
    const r = mergeOnSyncEnable({
      device,
      deviceChangedAt: T('2026-11-21T12:00:00Z'),
      account,
      accountUpdatedAt: '2026-11-22T12:00:00Z',
    });
    expect(r.push).toEqual({});
    expect(r.apply).toEqual({
      style: 'default',
      readableFont: false,
      colorVision: 'tritanopia',
      fontMain: 'lora',
      fontMono: 'geist-mono',
    });
  });

  it('no account row: everything the device set is pushed', () => {
    const r = mergeOnSyncEnable({ device, deviceChangedAt: null, account: null, accountUpdatedAt: null });
    expect(r.push).toEqual(device);
    expect(r.apply).toEqual({});
  });

  it('a device that follows its OS theme never pushes style', () => {
    const r = mergeOnSyncEnable({
      device: { ...device, style: null },
      deviceChangedAt: T('2026-11-23T12:00:00Z'),
      account,
      accountUpdatedAt: '2026-11-22T12:00:00Z',
    });
    expect('style' in r.push).toBe(false);
  });

  it('equal times or an unknown device time: the account wins (the old rule)', () => {
    const same = mergeOnSyncEnable({
      device,
      deviceChangedAt: T('2026-11-22T12:00:00Z'),
      account,
      accountUpdatedAt: '2026-11-22T12:00:00Z',
    });
    expect(same.push).toEqual({});
    const unknown = mergeOnSyncEnable({ device, deviceChangedAt: null, account, accountUpdatedAt: '2026-11-22T12:00:00Z' });
    expect(unknown.push).toEqual({});
    expect(unknown.apply.fontMain).toBe('lora');
  });
});
