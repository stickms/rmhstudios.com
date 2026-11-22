import { create } from 'zustand';
import { readJson, writeJson } from '@/lib/core/persist';
import { api } from '@/lib/contract/client';
import { getKeyboardPrefsApi, setKeyboardPrefsApi } from '@/lib/preferences/keyboard.contract';
import {
  DEFAULT_KEYBOARD_PREFS,
  sanitizePrefs,
  type KeyboardPrefs,
  type SingleKeyMode,
} from '@/lib/shortcuts/bindings';

/**
 * Keyboard shortcut preferences (WCAG 2.1.4). A visitor keeps them in
 * `localStorage` only; a member also has them on the account, so they follow
 * the person to every device. The mirror is read synchronously on `hydrate()`
 * (the dispatcher honours the person's mode from the first keystroke) and the
 * account row is fetched right after and wins, as with the layout store.
 */

export const KEYBOARD_PREFS_KEY = 'rmh:keyboard-prefs';

export type RemoteState = 'none' | 'loading' | 'ready' | 'error';

interface KeyboardPrefsStore {
  prefs: KeyboardPrefs;
  /** The local mirror has been read. */
  hydrated: boolean;
  /** The account row, for a signed-in viewer. */
  remote: RemoteState;
  /** Read the mirror; for a member, also fetch the account row (once, retried on error). */
  hydrate: (opts: { remote: boolean }) => void;
  setSingleKeys: (mode: SingleKeyMode) => Promise<boolean>;
  setOverride: (id: string, keys: string[]) => Promise<boolean>;
  resetOverride: (id: string) => Promise<boolean>;
  /** Mode and every remap back to the defaults. */
  resetAll: () => Promise<boolean>;
}

/** Bumped by every local edit so an older account row can never overwrite a newer choice. */
let edits = 0;
let remoteEnabled = false;

async function commit(set: (partial: Partial<KeyboardPrefsStore>) => void, next: KeyboardPrefs): Promise<boolean> {
  edits += 1;
  set({
    prefs: next,
  });
  writeJson(KEYBOARD_PREFS_KEY, next);
  if (!remoteEnabled) return true;
  try {
    const saved = await api(setKeyboardPrefsApi, {
      body: next,
    });
    const clean = sanitizePrefs(saved);
    writeJson(KEYBOARD_PREFS_KEY, clean);
    return true;
  } catch {
    return false;
  }
}

export const useKeyboardPrefsStore = create<KeyboardPrefsStore>((set, get) => ({
  prefs: DEFAULT_KEYBOARD_PREFS,
  hydrated: false,
  remote: 'none',

  hydrate: ({ remote }) => {
    if (!get().hydrated) {
      set({
        prefs: readJson<KeyboardPrefs>(KEYBOARD_PREFS_KEY, DEFAULT_KEYBOARD_PREFS, {
          validate: (v) => sanitizePrefs(v),
        }),
        hydrated: true,
      });
    }
    remoteEnabled = remote;
    const state = get().remote;
    if (!remote || state === 'loading' || state === 'ready') return;
    set({
      remote: 'loading',
    });
    const startedAt = edits;
    api(getKeyboardPrefsApi)
      .then((row) => {
        if (edits !== startedAt) {
          set({
            remote: 'ready',
          });
          return;
        }
        const server = sanitizePrefs(row);
        writeJson(KEYBOARD_PREFS_KEY, server);
        set({
          prefs: server,
          remote: 'ready',
        });
      })
      .catch(() =>
        set({
          remote: 'error',
        }),
      );
  },

  setSingleKeys: (mode) =>
    commit(set, {
      ...get().prefs,
      singleKeys: mode,
    }),

  setOverride: (id, keys) =>
    commit(set, {
      ...get().prefs,
      overrides: {
        ...get().prefs.overrides,
        [id]: keys,
      },
    }),

  resetOverride: (id) => {
    const { [id]: _removed, ...rest } = get().prefs.overrides;
    return commit(set, {
      ...get().prefs,
      overrides: rest,
    });
  },

  resetAll: () => commit(set, DEFAULT_KEYBOARD_PREFS),
}));
