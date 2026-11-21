import { describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT,
  SNAPSHOT_INTERVAL_MS,
  SNAPSHOT_KEEP,
  backupFileName,
  parseBackupFile,
  shouldSnapshot,
  toBackupFile,
} from '@/lib/game-saves/backup';
import { MAX_SAVE_BYTES } from '@/lib/game-saves/registry';

const SAVE = {
  level: 4,
  upgrades: ['a', 'b'],
  nested: {
    gold: 12,
  },
};

describe('backup file', () => {
  it('round-trips through text for the same game', () => {
    const file = toBackupFile('void-breaker', new Date('2026-03-01T10:00:00Z'), SAVE);
    expect(file).toMatchObject({
      format: BACKUP_FORMAT,
      version: 1,
      gameId: 'void-breaker',
    });
    const parsed = parseBackupFile(JSON.stringify(file), 'void-breaker');
    expect(parsed).toEqual({
      ok: true,
      backup: file,
    });
    expect(file.savedAt).toBe('2026-03-01T10:00:00.000Z');
  });

  it('accepts an ISO string for savedAt', () => {
    expect(toBackupFile('void-breaker', '2026-03-01T10:00:00.000Z', SAVE).savedAt).toBe('2026-03-01T10:00:00.000Z');
  });

  it('is refused for a different game', () => {
    const text = JSON.stringify(toBackupFile('neon-driftway', new Date(), SAVE));
    expect(parseBackupFile(text, 'void-breaker')).toEqual({
      ok: false,
      error: 'wrong-game',
    });
  });

  it.each([
    ['text that is not JSON', 'not json at all', 'not-json'],
    ['a JSON array', '[]', 'wrong-format'],
    ['null', 'null', 'wrong-format'],
    [
      'another format',
      JSON.stringify({
        format: 'other',
        version: 1,
      }),
      'wrong-format',
    ],
  ])('refuses %s', (_name, text, error) => {
    expect(parseBackupFile(text, 'void-breaker')).toEqual({
      ok: false,
      error,
    });
  });

  it('refuses another version', () => {
    const text = JSON.stringify({
      ...toBackupFile('void-breaker', new Date(), SAVE),
      version: 2,
    });
    expect(parseBackupFile(text, 'void-breaker')).toEqual({
      ok: false,
      error: 'wrong-version',
    });
  });

  it('refuses a missing or invalid date', () => {
    const base = toBackupFile('void-breaker', new Date(), SAVE);
    expect(
      parseBackupFile(
        JSON.stringify({
          ...base,
          savedAt: 'yesterday',
        }),
        'void-breaker',
      ),
    ).toEqual({
      ok: false,
      error: 'bad-date',
    });
    expect(
      parseBackupFile(
        JSON.stringify({
          ...base,
          savedAt: undefined,
        }),
        'void-breaker',
      ),
    ).toEqual({
      ok: false,
      error: 'bad-date',
    });
  });

  it.each([[null], [[1, 2]], ['text'], [7]])('refuses saveData that is not a JSON object (%j)', (saveData) => {
    const text = JSON.stringify({
      ...toBackupFile('void-breaker', new Date(), SAVE),
      saveData,
    });
    expect(parseBackupFile(text, 'void-breaker')).toEqual({
      ok: false,
      error: 'bad-save',
    });
  });

  it('refuses a save over the size limit, and a file far over it before parsing', () => {
    const big = toBackupFile('void-breaker', new Date(), {
      blob: 'x'.repeat(MAX_SAVE_BYTES),
    });
    expect(parseBackupFile(JSON.stringify(big), 'void-breaker')).toEqual({
      ok: false,
      error: 'too-large',
    });
    expect(parseBackupFile('x'.repeat(MAX_SAVE_BYTES * 2), 'void-breaker')).toEqual({
      ok: false,
      error: 'too-large',
    });
  });

  it('accepts a save just under the limit', () => {
    const file = toBackupFile('void-breaker', new Date(), {
      blob: 'x'.repeat(MAX_SAVE_BYTES - 20),
    });
    expect(parseBackupFile(JSON.stringify(file), 'void-breaker').ok).toBe(true);
  });
});

describe('shouldSnapshot', () => {
  const now = new Date('2026-03-01T12:00:00Z');
  it('is true with no snapshot yet', () => expect(shouldSnapshot(null, now)).toBe(true));
  it('is false under six hours', () =>
    expect(shouldSnapshot(new Date(now.getTime() - SNAPSHOT_INTERVAL_MS + 1), now)).toBe(false));
  it('is true at six hours and after', () => {
    expect(shouldSnapshot(new Date(now.getTime() - SNAPSHOT_INTERVAL_MS), now)).toBe(true);
    expect(shouldSnapshot(new Date(now.getTime() - 24 * 3_600_000), now)).toBe(true);
  });
});

describe('constants and names', () => {
  it('keeps ten snapshots', () => expect(SNAPSHOT_KEEP).toBe(10));
  it('names a download <game>-<date>.json', () => {
    expect(backupFileName('void-breaker', new Date('2026-03-01T23:59:00Z'))).toBe('void-breaker-2026-03-01.json');
    expect(backupFileName('balatro', '2026-03-02T00:00:00.000Z')).toBe('balatro-2026-03-02.json');
  });
});
