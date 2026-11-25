/**
 * The roll log: the last 50 rolls of one character, on this device only (sprint 11, feature 02).
 *
 * It is never sent to the server and never part of the account. One key per character under `ROLL_LOG_PREFIX`, listed
 * in the device-data registry as personal. Reads and writes go through `lib/core/persist`, which never throws: a
 * blocked or corrupt store reads as an empty log.
 */
import { persisted } from '@/lib/core/persist';

export const ROLL_LOG_PREFIX = 'rmhcharacters:rolls:';
export const ROLL_LOG_MAX = 50;

export interface RollLogEntry {
  /** Epoch milliseconds. */
  at: number;
  /** What was rolled, as the member saw it ("Stealth"). */
  label: string;
  /** The roll written out ("d20 (14) + 5 = 19"). */
  text: string;
  total: number;
}

function isEntry(x: unknown): x is RollLogEntry {
  if (typeof x !== 'object' || x === null) return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.at === 'number' && typeof e.label === 'string' && typeof e.text === 'string' && typeof e.total === 'number'
  );
}

function store(characterId: string) {
  return persisted<RollLogEntry[]>({
    key: `${ROLL_LOG_PREFIX}${characterId}`,
    fallback: [],
    validate: (v) => (Array.isArray(v) ? v.filter(isEntry).slice(0, ROLL_LOG_MAX) : undefined),
  });
}

/** Newest first. */
export function readRollLog(characterId: string): RollLogEntry[] {
  return store(characterId).read();
}

/** Add a roll at the head, keep the newest 50, and return the log as stored. */
export function appendRoll(characterId: string, entry: RollLogEntry): RollLogEntry[] {
  const s = store(characterId);
  const next = [entry, ...s.read()].slice(0, ROLL_LOG_MAX);
  s.write(next);
  return next;
}

export function clearRollLog(characterId: string): void {
  store(characterId).clear();
}
