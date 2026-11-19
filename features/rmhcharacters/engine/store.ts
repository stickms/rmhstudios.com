/**
 * The roster: every character, kept in this browser.
 *
 * Local-first on purpose: a character sheet is the player's own document, it
 * must open offline at the table, and the export formats are how it moves
 * between devices and tools. Writes are debounced so typing into a backstory
 * does not serialise the whole roster per keystroke.
 */
import { create } from 'zustand';
import { persisted } from '@/lib/core/persist';
import { cloneCharacter, newCharacter, normalizeCharacter } from './factory';
import type { Character, GameSystem } from './types';

const roster = persisted<Character[]>({
  key: 'rmhcharacters:roster',
  version: 1,
  fallback: [],
  validate: (v) =>
    Array.isArray(v) ? v.map(normalizeCharacter).filter((c): c is Character => Boolean(c)) : undefined,
});

interface RosterState {
  loaded: boolean;
  characters: Character[];
  load(): void;
  create(system: GameSystem): Character;
  add(list: Character[]): void;
  update(id: string, patch: (c: Character) => Character): void;
  duplicate(id: string): Character | null;
  remove(id: string): void;
}

let timer: ReturnType<typeof setTimeout> | null = null;
function save(list: Character[]) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    roster.write(list);
  }, 250);
}

/** Flush a pending write (page hide), so the last edit is never lost. */
export function flushRoster() {
  if (!timer) return;
  clearTimeout(timer);
  timer = null;
  roster.write(useRoster.getState().characters);
}

export const useRoster = create<RosterState>((set, get) => ({
  loaded: false,
  characters: [],
  load() {
    if (get().loaded) return;
    set({ loaded: true, characters: roster.read() });
  },
  create(system) {
    const c = newCharacter(system);
    const characters = [c, ...get().characters];
    set({ characters });
    save(characters);
    return c;
  },
  add(list) {
    const characters = [...list, ...get().characters];
    set({ characters });
    save(characters);
  },
  update(id, patch) {
    const characters = get().characters.map((c) => (c.id === id ? { ...patch(c), updatedAt: Date.now() } : c));
    set({ characters });
    save(characters);
  },
  duplicate(id) {
    const c = get().characters.find((x) => x.id === id);
    if (!c) return null;
    const copy = cloneCharacter(c, c.name ? `${c.name} (copy)` : '');
    const characters = [copy, ...get().characters];
    set({ characters });
    save(characters);
    return copy;
  },
  remove(id) {
    const characters = get().characters.filter((c) => c.id !== id);
    set({ characters });
    save(characters);
  },
}));
