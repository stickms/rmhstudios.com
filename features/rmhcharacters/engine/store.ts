/**
 * The roster: every character on the signed-in account.
 *
 * The server is the source of truth (`/api/rmhcharacters/characters`), so a sheet
 * follows its player to every device. Edits apply locally at once and are saved
 * per character after a short pause, so typing into a backstory is one request,
 * not one per keystroke. Each character carries its save state, which the editor
 * shows, and a failed save keeps the edit and offers a retry instead of dropping it.
 *
 * Before accounts, the roster lived only in this browser (`rmhcharacters:roster`).
 * The first load on an account uploads any of those characters the account does
 * not already have, then clears the local copy once every upload has succeeded.
 */
import { create } from 'zustand';
import { api } from '@/lib/contract/client';
import { persisted, removeKey } from '@/lib/core/persist';
import { deleteCharacterApi, listCharactersApi, saveCharacterApi } from './characters.contract';
import { cloneCharacter, newCharacter, normalizeCharacter } from './factory';
import type { Character, GameSystem } from './types';

const LEGACY_KEY = 'rmhcharacters:roster';
const legacyRoster = persisted<Character[]>({
  key: LEGACY_KEY,
  version: 1,
  fallback: [],
  validate: (v) => (Array.isArray(v) ? v.map(normalizeCharacter).filter((c): c is Character => Boolean(c)) : undefined),
});

/** Long enough to cover a burst of typing, short enough that closing the tab rarely beats it. */
const SAVE_DELAY_MS = 1200;
/** Browsers cap a keepalive body at 64 KiB; a larger sheet is flushed as a normal request. */
const KEEPALIVE_MAX = 60_000;

export type SyncState = 'saved' | 'saving' | 'pending' | 'error';

interface RosterState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  characters: Character[];
  sync: Record<string, SyncState>;
  /** Characters uploaded from this browser's old local roster on the last load. */
  migrated: number;
  load(): Promise<void>;
  create(system: GameSystem): Character;
  add(list: Character[]): void;
  update(id: string, patch: (c: Character) => Character): void;
  duplicate(id: string): Character | null;
  remove(id: string): Promise<boolean>;
  retry(id: string): void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const useRoster = create<RosterState>((set, get) => {
  const setSync = (id: string, s: SyncState | null) =>
    set((st) => {
      const sync = { ...st.sync };
      if (s) sync[id] = s;
      else delete sync[id];
      return { sync };
    });

  async function save(id: string, keepalive = false): Promise<boolean> {
    const c = get().characters.find((x) => x.id === id);
    if (!c) return true;
    setSync(id, 'saving');
    const body = { character: c as unknown as Record<string, unknown> };
    try {
      await api(saveCharacterApi, {
        params: { id },
        body,
        ...(keepalive && JSON.stringify(body).length < KEEPALIVE_MAX ? { keepalive: true } : {}),
      });
      // An edit made while this request was in flight has re-armed the timer; it stays pending.
      if (get().sync[id] === 'saving') setSync(id, 'saved');
      return true;
    } catch {
      setSync(id, 'error');
      return false;
    }
  }

  function schedule(id: string) {
    const t = timers.get(id);
    if (t) clearTimeout(t);
    setSync(id, 'pending');
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        void save(id);
      }, SAVE_DELAY_MS),
    );
  }

  async function migrateLegacy(onServer: Character[]): Promise<number> {
    const local = legacyRoster.read();
    if (!local.length) return 0;
    const known = new Set(onServer.map((c) => c.id));
    const missing = local.filter((c) => !known.has(c.id));
    if (missing.length) set((st) => ({ characters: [...st.characters, ...missing] }));
    const results = await Promise.all(missing.map((c) => save(c.id)));
    if (results.every(Boolean)) removeKey(LEGACY_KEY);
    return missing.length;
  }

  return {
    status: 'idle',
    characters: [],
    sync: {},
    migrated: 0,
    async load() {
      if (get().status === 'loading' || get().status === 'ready') return;
      set({ status: 'loading' });
      try {
        const { characters } = await api(listCharactersApi);
        set({ status: 'ready', characters });
        const migrated = await migrateLegacy(characters);
        if (migrated) set({ migrated });
      } catch {
        set({ status: 'error' });
      }
    },
    create(system) {
      const c = newCharacter(system);
      set((st) => ({ characters: [c, ...st.characters] }));
      schedule(c.id);
      return c;
    },
    add(list) {
      set((st) => ({ characters: [...list, ...st.characters] }));
      for (const c of list) schedule(c.id);
    },
    update(id, patch) {
      set((st) => ({
        characters: st.characters.map((c) => (c.id === id ? { ...patch(c), updatedAt: Date.now() } : c)),
      }));
      schedule(id);
    },
    duplicate(id) {
      const c = get().characters.find((x) => x.id === id);
      if (!c) return null;
      const copy = cloneCharacter(c, c.name ? `${c.name} (copy)` : '');
      set((st) => ({ characters: [copy, ...st.characters] }));
      schedule(copy.id);
      return copy;
    },
    async remove(id) {
      const t = timers.get(id);
      if (t) clearTimeout(t);
      timers.delete(id);
      const before = get().characters;
      set((st) => ({ characters: st.characters.filter((c) => c.id !== id) }));
      setSync(id, null);
      try {
        await api(deleteCharacterApi, { params: { id } });
        return true;
      } catch {
        // Put it back: a character that only looked deleted would reappear on the next load.
        set({ characters: before });
        return false;
      }
    },
    retry(id) {
      void save(id);
    },
  };
});

/** Send every pending save now (page hide, leaving the app), so the last edit is never lost. */
export function flushRoster() {
  for (const [id, t] of timers) {
    clearTimeout(t);
    timers.delete(id);
    const c = useRoster.getState().characters.find((x) => x.id === id);
    if (!c) continue;
    const body = { character: c as unknown as Record<string, unknown> };
    void api(saveCharacterApi, {
      params: { id },
      body,
      ...(JSON.stringify(body).length < KEEPALIVE_MAX ? { keepalive: true } : {}),
    }).catch(() => undefined);
  }
}
