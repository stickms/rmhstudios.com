/**
 * The House Always Wins run, on the shared save table.
 *
 * The run is the zustand store (`lib/store/houseAlwaysWinsStore.ts`), persisted under `haw-save-v2` (classic) or
 * `haw-ngplus-v1` (New Game+), with the New Game+ record in `haw-meta-v1` (`ngplus.ts`). That is three keys, and the
 * kit's `createCloudSave` has exactly one `localKey`, so this module is the kit's `CloudSave` shape written by hand:
 *
 * - **One row per member, three sections.** `{ main, ngplus, meta }` is the payload of the shared row `house-always-wins`.
 *   `main` and `ngplus` are the zustand envelopes `{ state, version }` exactly as the store wrote them.
 * - **The local copy stays first and keeps its keys.** The store writes them as it always did; nothing is renamed.
 *   The owner stamp sits beside the classic slot at `haw-save-v2::meta`, the kit's `${localKey}::meta` convention.
 * - **Nothing unreadable travels.** `readLocal` returns `null` when a present key fails to parse, so a corrupt key is
 *   never uploaded, and an account copy that fails to parse is ignored (logged once) and never written over. The
 *   sections of a chosen copy are written back only after the whole payload parsed.
 * - **Nothing is overwritten without a decision.** `resolve` uses the kit's `chooseSave` and the shared conflict dialog
 *   (through `useCloudSave`); the transport is the compare-and-set one, so a stale tab or device is refused (409) and
 *   the next `resolve` asks.
 *
 * Guests make no request at all: every cloud call is a no-op while there is no identity. A run made as a guest stays
 * claimable (the stamp has no owner), exactly as the kit treats the other games.
 *
 * Strings live in components (`components/house-always-wins/save-summary.ts`); this module returns figures and kinds.
 */
import { readJson, readString, removeKey, writeJson } from '@/lib/core/persist';
import { casJsonTransport, SaveNotWrittenError, type CasTransport } from '@/lib/game-saves/cas-transport';
import type { CloudSave } from '@/lib/game-saves/cloud-save';
import { chooseSave, untranslated, type MonotonicCounters, type SaveSummary } from '@/lib/game-saves/conflict';
import { MAX_SAVE_BYTES } from '@/lib/game-saves/registry';
import { HOUSE_RULES, activeSlot, slotStorageName, type NgMeta, type Slot } from '@/lib/house-always-wins/ngplus';
import { setHawSaveListener, useHouseAlwaysWinsStore, type HawSaveEvent } from '@/lib/store/houseAlwaysWinsStore';

export const HOUSE_ALWAYS_WINS_GAME_ID = 'house-always-wins';

/**
 * The three keys the run lives in, spelled out so the device registry sees them (`lib/device-data/registry.ts`). The
 * slot names are `slotStorageName()` in `ngplus.ts` and the record's key is private there; the tests hold them equal.
 */
export const HAW_MAIN_KEY = 'haw-save-v2';
export const HAW_NGPLUS_KEY = 'haw-ngplus-v1';
export const HAW_META_KEY = 'haw-meta-v1';
/** The owner stamp, beside the classic slot (the kit's `${localKey}::meta`). */
export const HAW_STAMP_KEY = 'haw-save-v2::meta';

/** The zustand `version` the store writes (`houseAlwaysWinsStore.ts`). A different one is not this build's save. */
export const HAW_STORE_VERSION = 2;

/** On a room change the account copy is written at most this often; a save point always writes. */
export const ROOM_SYNC_INTERVAL_MS = 2 * 60_000;

/* ══════════════════════════════════════════════════════════════════════════
   The payload
   ══════════════════════════════════════════════════════════════════════════ */

/** What the store persists for the run (data only; its functions are not stored). */
export interface HawRunState {
  debt: number;
  chips: number;
  keys: number;
  abilities: Record<string, boolean>;
  flags: Record<string, boolean>;
  introSeen: boolean;
  checkpointRoom: string;
  checkpointId: string;
  deaths: number;
  visitedRooms: Record<string, boolean>;
}

/** A slot as zustand's `persist` writes it. */
export interface HawEnvelope {
  state: HawRunState;
  version: number;
}

/** The row. `main` / `ngplus` / `meta` are `null` when this member has none of that. */
export interface HawSave {
  main: HawEnvelope | null;
  ngplus: HawEnvelope | null;
  meta: NgMeta | null;
  /** When this copy was last written (ms since epoch; `0` when unknown). Breaks a tie, never decides a conflict. */
  savedAt: number;
  /**
   * How many times "New run" threw a run away in this copy's history. It only goes up, so it is one of the monotonic
   * counters: the empty run a reset writes is never silently undone by another device's older, further run (neither
   * dominates, so the player is asked). `0` in copies written before it existed.
   */
  resets: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

const readResets = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;

const isFlagMap = (value: unknown): value is Record<string, boolean> =>
  isRecord(value) && Object.values(value).every((flag) => typeof flag === 'boolean');

/** Validate one slot's envelope as the store writes it, or reject it. */
export function parseEnvelope(raw: unknown): HawEnvelope | null {
  if (!isRecord(raw) || raw.version !== HAW_STORE_VERSION || !isRecord(raw.state)) return null;
  const s = raw.state;
  if (
    !isCount(s.debt) ||
    !isCount(s.chips) ||
    !isCount(s.keys) ||
    !isCount(s.deaths) ||
    !isFlagMap(s.abilities) ||
    !isFlagMap(s.flags) ||
    !isFlagMap(s.visitedRooms) ||
    typeof s.introSeen !== 'boolean' ||
    typeof s.checkpointRoom !== 'string' ||
    typeof s.checkpointId !== 'string'
  ) {
    return null;
  }
  return { state: s as unknown as HawRunState, version: HAW_STORE_VERSION };
}

/** Validate the New Game+ record, or reject it. */
export function parseMeta(raw: unknown): NgMeta | null {
  if (!isRecord(raw)) return null;
  const { cleared, slot, seed, rule, cycles } = raw;
  if (
    typeof cleared !== 'boolean' ||
    (slot !== 'main' && slot !== 'ngplus') ||
    typeof seed !== 'number' ||
    !Number.isInteger(seed) ||
    !HOUSE_RULES.includes(rule as NgMeta['rule']) ||
    typeof cycles !== 'number' ||
    !Number.isInteger(cycles) ||
    cycles < 0
  ) {
    return null;
  }
  return { cleared, slot, seed, rule: rule as NgMeta['rule'], cycles };
}

/**
 * Read a stored payload back into a save, or reject it. A section that is present must be valid: one corrupt slot
 * makes the whole copy unusable, because writing the rest back would hand the player a run with a hole in it.
 */
export function parseHawSave(raw: unknown): HawSave | null {
  if (!isRecord(raw)) return null;
  const section = (value: unknown): HawEnvelope | null | undefined =>
    value == null ? null : (parseEnvelope(value) ?? undefined);
  const main = section(raw.main);
  const ngplus = section(raw.ngplus);
  if (main === undefined || ngplus === undefined) return null;
  const meta = raw.meta == null ? null : parseMeta(raw.meta);
  if (raw.meta != null && meta === null) return null;
  if (!main && !ngplus) return null;
  const savedAt = typeof raw.savedAt === 'number' && Number.isFinite(raw.savedAt) && raw.savedAt > 0 ? raw.savedAt : 0;
  return { main, ngplus, meta, savedAt, resets: readResets(raw.resets) };
}

/* ══════════════════════════════════════════════════════════════════════════
   Comparing and describing runs
   ══════════════════════════════════════════════════════════════════════════ */

const abilityCount = (state: HawRunState) => Object.values(state.abilities).filter(Boolean).length;
const roomCount = (state: HawRunState) => Object.values(state.visitedRooms).filter(Boolean).length;

/**
 * Figures that only go up as a run goes on: rooms seen, keys held, abilities earned, and the New Game+ cycles started,
 * summed over both slots. (The store keeps `debt` as what has been added to the marker, not what was paid, so a
 * paid-off figure cannot be derived from a save; chips and debt move both ways and are shown, never compared.)
 */
export function hawMonotonic(save: HawSave): MonotonicCounters {
  const counters = { rooms: 0, keys: 0, abilities: 0, cycles: save.meta?.cycles ?? 0, resets: save.resets };
  for (const slot of [save.main, save.ngplus]) {
    if (!slot) continue;
    counters.rooms += roomCount(slot.state);
    counters.keys += slot.state.keys;
    counters.abilities += abilityCount(slot.state);
  }
  return counters;
}

export interface HawFigures {
  /** The slot the member plays now. */
  slot: Slot;
  rooms: number;
  chips: number;
  debt: number;
  keys: number;
  abilities: number;
  deaths: number;
  /** New Game+ cycles started. */
  cycles: number;
  savedAt: number;
}

/** What the conflict dialog and the settings list say about a run. The components turn it into sentences. */
export function hawFigures(save: HawSave): HawFigures {
  const onNg = save.meta?.slot === 'ngplus' && save.ngplus !== null;
  const state = onNg ? save.ngplus : (save.main ?? save.ngplus);
  return {
    slot: onNg ? 'ngplus' : 'main',
    rooms: state ? roomCount(state.state) : 0,
    chips: state?.state.chips ?? 0,
    debt: state?.state.debt ?? 0,
    keys: state?.state.keys ?? 0,
    abilities: state ? abilityCount(state.state) : 0,
    deaths: state?.state.deaths ?? 0,
    cycles: save.meta?.cycles ?? 0,
    savedAt: save.savedAt,
  };
}

/** The English summary, for the kit's `summarize` (a component passes its own translated builder instead). */
export function summarizeHawSave(save: HawSave): SaveSummary {
  const f = hawFigures(save);
  const t = untranslated;
  return {
    savedAt: f.savedAt,
    headline: t('save-summary-rooms', { rooms: f.rooms, defaultValue: 'Rooms visited: {{rooms}}' }),
    lines: [
      { label: t('save-summary-chips', { defaultValue: 'Chips' }), value: String(f.chips) },
      { label: t('save-summary-debt', { defaultValue: 'Debt' }), value: String(f.debt) },
      { label: t('save-summary-keys', { defaultValue: 'Vault keys' }), value: String(f.keys) },
    ],
  };
}

/** The run's content without when it was written: two copies that are the same run are equal. */
function runKey(save: HawSave): string {
  return stable({ main: save.main, ngplus: save.ngplus, meta: save.meta, resets: save.resets });
}

/** JSON with sorted keys, so two copies of one run compare equal however each was written. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (isRecord(value)) {
    const fields = Object.keys(value)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + stable(value[key]));
    return '{' + fields.join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
}

/* ══════════════════════════════════════════════════════════════════════════
   The local copy
   ══════════════════════════════════════════════════════════════════════════ */

interface Stamp {
  owner: string | null;
  at: number;
  /** {@link HawSave.resets} for the run in the keys. Absent in stamps written before it existed. */
  resets?: number;
}

function readStamp(): Stamp | null {
  const parsed = readJson<Partial<Stamp> | null>(HAW_STAMP_KEY, null);
  if (!parsed || typeof parsed !== 'object') return null;
  return {
    owner: typeof parsed.owner === 'string' ? parsed.owner : null,
    at: typeof parsed.at === 'number' && Number.isFinite(parsed.at) ? parsed.at : 0,
    resets: readResets(parsed.resets),
  };
}

/** What a stored key holds: nothing, something readable, or something that is not a valid slot. */
type Stored<T> = { kind: 'absent' } | { kind: 'corrupt' } | { kind: 'ok'; value: T };

function readStored<T>(key: string, parse: (raw: unknown) => T | null): Stored<T> {
  const text = readString(key);
  if (text === null) return { kind: 'absent' };
  try {
    const value = parse(JSON.parse(text));
    return value === null ? { kind: 'corrupt' } : { kind: 'ok', value };
  } catch {
    return { kind: 'corrupt' };
  }
}

type LocalRun = { kind: 'none' } | { kind: 'corrupt' } | { kind: 'foreign' } | { kind: 'run'; save: HawSave };

/** Compose the run from the three keys. Never writes anything. */
function readLocalRun(identity: string | null): LocalRun {
  const stamp = readStamp();
  if (stamp?.owner && identity && stamp.owner !== identity) return { kind: 'foreign' };

  const main = readStored(HAW_MAIN_KEY, parseEnvelope);
  const ngplus = readStored(HAW_NGPLUS_KEY, parseEnvelope);
  if (main.kind === 'corrupt' || ngplus.kind === 'corrupt') return { kind: 'corrupt' };
  if (main.kind === 'absent' && ngplus.kind === 'absent') return { kind: 'none' };

  // A record that cannot be read leaves the run as a classic one; it is never a reason to refuse the slots.
  const meta = readStored(HAW_META_KEY, parseMeta);
  return {
    kind: 'run',
    save: {
      main: main.kind === 'ok' ? main.value : null,
      ngplus: ngplus.kind === 'ok' ? ngplus.value : null,
      meta: meta.kind === 'ok' ? meta.value : null,
      savedAt: stamp?.at ?? 0,
      resets: stamp?.resets ?? 0,
    },
  };
}

/** Write one section back, or remove the key when the copy being applied has none. */
function putSection(key: string, value: unknown): void {
  if (value === null) removeKey(key);
  else writeJson(key, value);
}

/** Zustand's own state, so a freshly emptied slot is not shadowed by the previous run held in memory. */
function reloadStore(): void {
  const store = useHouseAlwaysWinsStore;
  try {
    store.persist.setOptions({ name: slotStorageName(activeSlot()) });
    if (readString(slotStorageName(activeSlot())) === null) store.setState(store.getInitialState());
    else void store.persist.rehydrate();
  } catch {
    // The page is about to be reloaded or the store is not persisted here; the local copy stands.
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Where the run is saved, for the menu
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * - `guest`: signed out. The run stays on this device and nothing is requested.
 * - `account`: the account holds this run.
 * - `pending`: signed in, but the account does not hold the latest yet (a write is in flight, was refused, failed, or
 *   the account copy could not be read).
 */
export type HawSyncStatus = 'guest' | 'account' | 'pending';

let syncStatus: HawSyncStatus = 'guest';
const statusListeners = new Set<() => void>();

function setStatus(next: HawSyncStatus): void {
  if (next === syncStatus) return;
  syncStatus = next;
  for (const listener of statusListeners) listener();
}

export const getHawSyncStatus = (): HawSyncStatus => syncStatus;
export function subscribeHawSyncStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

/**
 * After a refusal (409) or a beacon this page could not hear back from, uploads stop until both copies are read
 * again. The gate subscribes here and re-resolves (asking when both moved on); the menu calls
 * {@link reresolveHawIfStale} each time it opens, which is "the next menu visit" of the spec.
 */
const reresolveListeners = new Set<() => void>();

export function subscribeHawReresolve(listener: () => void): () => void {
  reresolveListeners.add(listener);
  return () => reresolveListeners.delete(listener);
}

/** Ask the gate to read both copies again when this device can no longer write. `true` when it asked. */
export function reresolveHawIfStale(
  save: Pick<HouseAlwaysWinsCloudSave, 'claimReresolve'> = houseAlwaysWinsSave,
): boolean {
  if (reresolveListeners.size === 0 || !save.claimReresolve()) return false;
  for (const listener of reresolveListeners) listener();
  return true;
}

/* ══════════════════════════════════════════════════════════════════════════
   The CloudSave
   ══════════════════════════════════════════════════════════════════════════ */

export interface HawCloudOptions {
  /** The transport; tests pass a fake, the game gets the compare-and-set one for the shared route. */
  transport?: CasTransport;
  now?: () => number;
  /** Called once per page load when the account copy cannot be read. */
  log?: (message: string) => void;
  /** After a copy was written to the local keys: reload the store from them. */
  reload?: () => void;
}

export interface HouseAlwaysWinsCloudSave extends CloudSave<HawSave> {
  /** The run as it is on this device, ready for upload (stamped), or `null`. */
  composeForUpload(): HawSave | null;
  /** Upload what this device holds now; resolves when it is done. Never rejects. */
  syncNow(): Promise<void>;
  /**
   * Whether this device can no longer write to the account until it reads it again: another device saved (a 409), or
   * a pagehide beacon went out whose answer this page could not see (it came back from the back-forward cache).
   */
  isStale(): boolean;
  /**
   * `true` once per stale spell (see {@link isStale}), so the menu re-reads the account once rather than on every visit
   * while it cannot be reached. A read that reaches the account ends the spell.
   */
  claimReresolve(): boolean;
  /** "New run" threw the run away: count it on the local copy, so the empty run outranks the one it replaced. */
  markReset(): void;
}

export function createHouseAlwaysWinsSave(options: HawCloudOptions = {}): HouseAlwaysWinsCloudSave {
  const transport = options.transport ?? casJsonTransport(HOUSE_ALWAYS_WINS_GAME_ID);
  const now = options.now ?? (() => Date.now());
  const reload = options.reload ?? reloadStore;
  const log = options.log ?? ((message: string) => console.warn(message));
  let identity: string | null = null;
  /** The account holds a copy this build cannot read: it is left alone, never written over. */
  let unreadable = false;
  let loggedUnreadable = false;
  /** Serialises writes so the second one carries the `updatedAt` the first returned. */
  let chain: Promise<unknown> = Promise.resolve();
  /** The run last handed to the account, to skip a write that would change nothing. */
  let lastSent: string | null = null;

  /** The highest reset count read from the account under this identity: a chosen copy never goes below it. */
  let cloudResets = 0;
  /** A re-read was already asked for since the account was last reached. */
  let reresolveAsked = false;

  const stamp = (at: number, resets: number) =>
    writeJson(HAW_STAMP_KEY, { owner: identity, at, resets } satisfies Stamp);

  const self: HouseAlwaysWinsCloudSave = {
    gameId: HOUSE_ALWAYS_WINS_GAME_ID,

    setIdentity(userId) {
      identity = userId;
      transport.reset();
      unreadable = false;
      lastSent = null;
      cloudResets = 0;
      reresolveAsked = false;
      setStatus(userId ? 'pending' : 'guest');
    },

    getIdentity: () => identity,

    readLocal() {
      const local = readLocalRun(identity);
      return local.kind === 'run' ? local.save : null;
    },

    /** Applies the whole copy to the three keys (the payload already parsed) and stamps it. */
    writeLocal(save, at = now()) {
      putSection(HAW_MAIN_KEY, save.main);
      putSection(HAW_NGPLUS_KEY, save.ngplus);
      // The record decides which slot is played, so a copy without one must not inherit this device's (or another
      // member's) record.
      putSection(HAW_META_KEY, save.meta);
      stamp(at, save.resets);
    },

    clearLocal() {
      removeKey(HAW_MAIN_KEY);
      removeKey(HAW_NGPLUS_KEY);
      removeKey(HAW_META_KEY);
      removeKey(HAW_STAMP_KEY);
    },

    async readCloud() {
      if (!identity) return null;
      let raw: unknown;
      try {
        raw = await transport.read();
      } catch {
        // Offline or too slow: this device is the freshest copy for now.
        return null;
      }
      reresolveAsked = false;
      if (raw == null) return null;
      const parsed = parseHawSave(raw);
      if (!parsed) {
        unreadable = true;
        if (!loggedUnreadable) {
          loggedUnreadable = true;
          log('[house-always-wins] The account copy could not be read and was left alone.');
        }
      }
      if (parsed) cloudResets = Math.max(cloudResets, parsed.resets);
      return parsed;
    },

    writeCloud(save, at = now()) {
      if (!identity || unreadable) return Promise.resolve();
      const payload: HawSave = { ...save, savedAt: save.savedAt || at };
      // Over the row's cap: never sent. The local copy stands.
      if (JSON.stringify(payload).length > MAX_SAVE_BYTES) {
        setStatus('pending');
        return Promise.resolve();
      }
      const key = runKey(payload);
      if (key === lastSent) return chain.then(() => undefined);
      const attempt = chain.then(async () => {
        if (key === lastSent) return;
        setStatus('pending');
        lastSent = key;
        try {
          await transport.write(payload);
          setStatus('account');
        } catch (error) {
          lastSent = null;
          if (!(error instanceof SaveNotWrittenError)) setStatus('pending');
          throw error;
        }
      });
      chain = attempt.catch(() => undefined);
      return attempt;
    },

    writeBeacon(save, at = now()) {
      if (!identity || unreadable) return false;
      const payload: HawSave = { ...save, savedAt: save.savedAt || at };
      const body = JSON.stringify(payload);
      if (body.length > MAX_SAVE_BYTES) return false;
      const key = runKey(payload);
      if (key === lastSent) return false;
      // Over the beacon's 64 KB the transport sends an ordinary request instead; the local copy stands either way.
      const sent = transport.beacon(payload);
      if (sent) lastSent = key;
      return sent;
    },

    async resolve() {
      const local = readLocalRun(identity);
      const cloud = await self.readCloud();
      const localSave = local.kind === 'run' ? local.save : null;

      // A run that belongs to another account on this browser is not this member's: it is neither offered nor
      // uploaded, and it must not carry on into this account from memory. With an account copy to adopt that happens
      // below; without one the foreign keys are cleared and the store starts empty.
      if (local.kind === 'foreign' && !cloud) {
        self.clearLocal();
        reload();
      }

      const choice = chooseSave({
        local: localSave,
        cloud,
        monotonic: hawMonotonic,
        savedAt: (save) => save.savedAt,
      });

      if (choice.kind === 'none') {
        setStatus(identity ? 'pending' : 'guest');
        return choice;
      }
      if (choice.kind === 'conflict') return choice;

      if (choice.origin === 'cloud') {
        // The same run as this device already holds needs no rewrite; a further one is adopted whole.
        if (!localSave || runKey(localSave) !== runKey(choice.save)) {
          self.writeLocal(choice.save, choice.save.savedAt || now());
          reload();
        }
        lastSent = runKey(choice.save);
        setStatus('account');
        return choice;
      }

      // This device is ahead (or the account has nothing): the caller uploads it. Nothing is sent when the account
      // already holds exactly this run.
      if (cloud && runKey(cloud) === runKey(choice.save)) {
        lastSent = runKey(choice.save);
        setStatus('account');
        return { kind: 'resolved', origin: 'cloud', save: cloud };
      }
      setStatus(identity ? 'pending' : 'guest');
      return choice;
    },

    async commit(chosen, at = now()) {
      // The player's answer to a conflict: make this the run in both places. It carries the higher reset count of the
      // two, so the copy that was not chosen (a reset elsewhere included) does not come back as a second question.
      const save: HawSave = { ...chosen, resets: Math.max(chosen.resets, cloudResets) };
      self.writeLocal(save, at);
      reload();
      await self.writeCloud(save, at);
    },

    async clear() {
      self.clearLocal();
      reload();
      lastSent = null;
      if (!identity) return;
      try {
        await transport.remove();
      } catch {
        // Offline or nothing to delete: the local copy is already gone, which is what was asked for.
      }
    },

    summarize: summarizeHawSave,

    composeForUpload() {
      const local = readLocalRun(identity);
      if (local.kind !== 'run') return null;
      // The store writes the keys itself; the stamp says whose run they are and when they last moved.
      const at = now();
      stamp(at, local.save.resets);
      return { ...local.save, savedAt: at };
    },

    markReset() {
      const local = readLocalRun(identity);
      const resets = (local.kind === 'run' ? local.save.resets : (readStamp()?.resets ?? 0)) + 1;
      stamp(now(), resets);
    },

    async syncNow() {
      if (!identity) return;
      const save = self.composeForUpload();
      if (!save) return;
      try {
        await self.writeCloud(save);
      } catch {
        // Refused (409) or offline: the local copy stands and the next menu visit re-resolves.
      }
    },

    isStale: () => identity !== null && transport.stale,

    claimReresolve() {
      if (!self.isStale() || reresolveAsked) return false;
      reresolveAsked = true;
      return true;
    },
  };
  return self;
}

export const houseAlwaysWinsSave = createHouseAlwaysWinsSave();

/* ══════════════════════════════════════════════════════════════════════════
   While playing
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Carry the run to the account as it is played: at a save point, on a room change at most every two minutes, when the
 * run is thrown away, and on `pagehide` (the beacon). Call once the save resolved; the returned function stops it.
 * Signed out, every one of those is a no-op, so no request is made.
 */
export function startHawSync(
  save: HouseAlwaysWinsCloudSave = houseAlwaysWinsSave,
  now: () => number = () => Date.now(),
): () => void {
  let lastRoomSync = Number.NEGATIVE_INFINITY;
  const onEvent = (event: HawSaveEvent) => {
    if (event === 'reset') save.markReset();
    if (!save.getIdentity()) {
      // Played signed out: the run is the guest's now, claimable by whoever signs in next (the kit stamps a guest's
      // writes the same way), so a run started after somebody else signed out is never cleared as theirs.
      save.composeForUpload();
      return;
    }
    if (event === 'room') {
      if (now() - lastRoomSync < ROOM_SYNC_INTERVAL_MS) return;
    }
    lastRoomSync = now();
    void save.syncNow();
  };
  const stopListening = setHawSaveListener(onEvent);

  const onHide = () => {
    if (!save.getIdentity()) return;
    const run = save.composeForUpload();
    if (run) save.writeBeacon(run);
  };
  const target = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null;
  target?.addEventListener('pagehide', onHide);

  return () => {
    stopListening();
    target?.removeEventListener('pagehide', onHide);
  };
}
