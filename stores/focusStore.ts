import { create } from 'zustand';

/**
 * Focus mode (plan B21) — a timed quiet window for notifications.
 *
 * "Turn notifications off" is a setting people forget to turn back on, so they
 * never use it. This is the version that gets used: a countdown with an
 * explicit end, and an allow-list of categories that still break through.
 *
 * State is stored per device in localStorage with manual hydration after mount
 * (the same pattern as `navStore`/`themeStore`), because reading it during
 * render would produce SSR markup that disagrees with the client.
 *
 * `security` is the default — and the only sensible default — passthrough: a
 * new sign-in, a password change or a takeover warning is not something the
 * user meant to silence for the next 45 minutes.
 */

const STORAGE_KEY = 'rmh-focus';

/** Notification categories that can be allowed through a focus window. */
export const FOCUS_ALLOW_KINDS = ['dm', 'mention', 'security'] as const;
export type FocusAllowKind = (typeof FOCUS_ALLOW_KINDS)[number];

export const DEFAULT_FOCUS_ALLOW: FocusAllowKind[] = ['security'];

interface PersistedFocus {
  until: number | null;
  allow: FocusAllowKind[];
}

function isAllowKind(value: unknown): value is FocusAllowKind {
  return typeof value === 'string' && (FOCUS_ALLOW_KINDS as readonly string[]).includes(value);
}

function read(): PersistedFocus {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { until: null, allow: DEFAULT_FOCUS_ALLOW };
    const parsed = JSON.parse(raw) as Partial<PersistedFocus>;
    const allow = Array.isArray(parsed.allow) ? parsed.allow.filter(isAllowKind) : [];
    return {
      until: typeof parsed.until === 'number' ? parsed.until : null,
      allow: allow.length ? allow : DEFAULT_FOCUS_ALLOW,
    };
  } catch {
    return { until: null, allow: DEFAULT_FOCUS_ALLOW };
  }
}

function write(state: PersistedFocus) {
  try {
    if (state.until === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore (private mode / storage disabled)
  }
}

/**
 * Wakes the store when the window lapses. Without it `until` would go stale in
 * the past and the UI would keep rendering "Focus on" until something unrelated
 * caused a re-render — a subscriber only re-renders when state *changes*, and a
 * timestamp quietly becoming historical is not a change.
 */
let expiryTimer: ReturnType<typeof setTimeout> | null = null;

function clearExpiry() {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
}

interface FocusStore {
  /** Epoch ms when the window ends, or null when focus mode is off. */
  until: number | null;
  /** Categories that still notify while focus mode is on. */
  allow: FocusAllowKind[];
  /** True once localStorage has been read on the client. */
  hydrated: boolean;
  hydrate: () => void;
  /** Start (or extend) a focus window. */
  start: (minutes: number, allow?: FocusAllowKind[]) => void;
  /** End it now. */
  end: () => void;
  /**
   * Is a window running right now? A method rather than a boolean field
   * because it is time-dependent — see `expiryTimer` for how subscribers learn
   * about the lapse.
   */
  isActive: () => boolean;
}

export const useFocusStore = create<FocusStore>((set, get) => {
  const arm = (until: number) => {
    clearExpiry();
    expiryTimer = setTimeout(() => get().end(), Math.max(0, until - Date.now()));
  };

  return {
    until: null,
    allow: DEFAULT_FOCUS_ALLOW,
    hydrated: false,

    hydrate: () => {
      if (get().hydrated) return;
      const stored = read();
      // A window that expired while the tab was closed is simply over; don't
      // resurrect it, and don't leave the dead record behind.
      if (stored.until !== null && stored.until <= Date.now()) {
        write({ until: null, allow: stored.allow });
        set({ until: null, allow: stored.allow, hydrated: true });
        return;
      }
      if (stored.until !== null) arm(stored.until);
      set({ ...stored, hydrated: true });
    },

    start: (minutes, allow) => {
      const safeMinutes = Number.isFinite(minutes) ? Math.max(1, Math.round(minutes)) : 30;
      const until = Date.now() + safeMinutes * 60_000;
      const nextAllow = allow ?? get().allow;
      write({ until, allow: nextAllow });
      arm(until);
      set({ until, allow: nextAllow, hydrated: true });
    },

    end: () => {
      clearExpiry();
      write({ until: null, allow: get().allow });
      set({ until: null });
    },

    isActive: () => {
      const { until } = get();
      return until !== null && until > Date.now();
    },
  };
});

/**
 * Should a notification of this kind be delivered? The single question every
 * call site actually has, so it does not have to remember that an inactive
 * window means "allow everything".
 */
export function focusAllows(kind: FocusAllowKind): boolean {
  const state = useFocusStore.getState();
  return !state.isActive() || state.allow.includes(kind);
}
