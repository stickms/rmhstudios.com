/**
 * Every place this site writes to the visitor's own browser, in one list (sprint 07, feature 03).
 *
 * Client-safe and import-free on purpose: it names the stores, it never imports them, so the settings page, the
 * sign-out helper and the tests can read it without pulling a game or an editor in. The list is held by a source scan
 * (`components/settings/__tests__/device-registry.test.ts`): a file under `lib/`, `features/`, `components/`, `hooks/` or `stores/` that
 * opens an IndexedDB database, or names a Web Storage key, that no line here covers fails the test, and so does a line
 * here that nothing uses. A new store needs a line here, and the line decides how the device page lists it, what
 * "Clear" removes and whether signing out may remove it.
 *
 * `personal` means the member's own content or progress (recordings, book pages, drafts, saves). The rest is site
 * preference (theme, language, a dismissed tip, a volume) or a technical cache. Clearing "personal data" on sign-out or
 * after an account deletion removes the first kind and keeps the second; only "Clear everything" removes both.
 *
 * `unsent` marks work that may exist only on this device (Studio projects and samples, unsent drafts). Nothing here
 * may delete it without the keep-or-delete question, so the automatic clears skip it unless the member says delete.
 */

export type DeviceStoreKind = 'indexeddb' | 'localstorage-prefix' | 'cache-prefix';

/** The two kinds of work that can exist only on this device (see `unsent`). */
export type UnsentKind = 'studio' | 'drafts';

export interface DeviceStore {
  /** Stable id; the labels in `components/settings/device-data-labels.ts` are keyed by it. */
  id: string;
  kind: DeviceStoreKind;
  /**
   * `indexeddb`: exact database names. `localstorage-prefix`: key names or prefixes, matched with `startsWith`, in
   * both localStorage and sessionStorage. `cache-prefix`: Cache Storage name prefixes.
   */
  names: readonly string[];
  /** Holds the member's own content or progress, as opposed to site preferences and static caches. */
  personal: boolean;
  /** Work that may exist nowhere else; never cleared without the keep-or-delete question. */
  unsent?: UnsentKind;
}

export const DEVICE_STORES: readonly DeviceStore[] = [
  // ── IndexedDB ──
  {
    id: 'studio',
    kind: 'indexeddb',
    names: ['rmh-studio-db'],
    personal: true,
    unsent: 'studio',
  },
  {
    id: 'drafts',
    kind: 'indexeddb',
    names: ['rmh-drafts'],
    personal: true,
    unsent: 'drafts',
  },
  {
    id: 'library-reader',
    kind: 'indexeddb',
    names: ['rmh-library-reader'],
    personal: true,
  },
  {
    id: 'tf2-hud-drafts',
    kind: 'indexeddb',
    names: ['rmh-tf2-hud'],
    personal: true,
  },
  {
    id: 'balatro-runs',
    kind: 'indexeddb',
    names: ['rmh-balatro-mp', 'rmh-balatro-replays'],
    personal: true,
  },
  {
    id: 'balatro-packs',
    kind: 'indexeddb',
    names: ['rmh-balatro'],
    personal: false,
  },
  {
    id: 'rmhos-home',
    kind: 'indexeddb',
    names: ['rmhos'],
    personal: true,
  },
  {
    id: 'hearthworks-saves',
    kind: 'indexeddb',
    names: ['hearthworks'],
    personal: true,
  },

  // ── Cache Storage (the service worker) ──
  {
    id: 'offline-caches',
    kind: 'cache-prefix',
    names: ['rmh-static-', 'rmh-images-'],
    personal: false,
  },

  // ── Web Storage: unsent writing ──
  {
    id: 'draft-keys',
    kind: 'localstorage-prefix',
    names: ['rmh-compose-draft', 'rmh-tf2-loadout-drafts'],
    personal: true,
    unsent: 'drafts',
  },

  // ── Web Storage: the member's own markers and caches ──
  {
    id: 'account-markers',
    kind: 'localstorage-prefix',
    names: [
      'rmh-auth-user',
      'rmh-explorer-key',
      'account-merge:',
      'rmh-recents',
      'rmh-resume-hidden',
      'rmh:feed:seen-through:',
      'rmh-streak-last-checkin',
      'rmh-emoji-frequent',
      'reading-notebook',
      'rmh-library-favorites',
      'rmh-elections-picks:',
      'rmh-puzzle-history',
      'rmh-daily-puzzle',
      'blocked-muted',
      'rmh.toolbox.',
      'rmh-music-tap-beat-bpm',
    ],
    personal: true,
  },

  // ── Web Storage: game saves and progress ──
  {
    id: 'game-saves',
    kind: 'localstorage-prefix',
    names: [
      'dr.hi.',
      'dr.practice',
      'dr:room:',
      'voidbreaker-save',
      'vb-meta',
      'vb-boss-rush',
      'nightrail.unlocks',
      'neon-driftway.unlocks',
      'ndw.livery',
      'ndw-ghost-mode',
      'temple_of_joy_save',
      'velum2099_story_save',
      'neurodrive_best',
      'haw-meta',
      'versecraft-save-',
      'rmh-globeset-run',
      'rmh-globeset-stats',
      'lightsout-discord-',
      'dunesday:',
      'rmh-balatro-mp-history',
      'rmh-balatro-mp-rejoin',
      'rmh-balatro-mp-settings',
      'ss_mp_',
      'synapse-storm',
      'rmh-offline-best',
      'rmh-homes-',
      'rmh-tf2-game-hud',
      'rmh-tf2-loadout-class',
      'rmh:tf2-game:',
      'rmh:sp-game:save:',
      'rmhcharacters:roster',
      'rmhcalc:model',
      'rmhos:',
      'rmhtube:',
      'gh:table-code',
      'velum.playerName',
      'rmh-kaikai-debt',
    ],
    personal: true,
  },

  // ── Web Storage: preferences (stay on a personal-only clear) ──
  {
    id: 'site-preferences',
    kind: 'localstorage-prefix',
    names: [
      'rmh-access',
      'rmh-quiet-hours',
      'rmh-color-vision',
      'rmh-density',
      'rmh-font-scale',
      'rmh-readable-font',
      'rmh-jelly-motion',
      'rmh-style',
      'rmh-user-theme',
      'rmh-lang-picked',
      'rmh-data-saver',
      'rmh-cookie-consent',
      'rmh-shake-ok',
      'rmh-motion-ok',
      'rmh-soft-render',
      'rmh-layout-',
      'rmh:haptics:',
      'rmh:keyboard-prefs',
      'rmh-tab-badge',
      'rmh-delight-cfg',
      'rmh-fools',
      'rmh-welcome-seen',
      'rmh-whatsnew-seen',
      'rmh-freemonth-snooze',
      'rmh-sitewide-announcements-seen',
      'rmh:patch-seen:',
      'rmh:stale-build',
      'rmh:route-error-retry-at',
      'better-auth.message',
      'community-onboarding-dismissed:',
      'qotd-dismissed:',
      'rmh.bracket.view',
      'rmh-reading-ruler',
      'rmh-reader-sync-off',
      'rmh-epub-theme',
      'rmh-tf2-ctrlw-hint',
      'rmh-device-clear-on-sign-out',
      'rmhmusic-mode',
      'rmhmusic-practice-mode',
      'rmh-elections-split',
      'rmh-elections-room',
      'rmh-elections-alerts',
    ],
    personal: false,
  },
  {
    id: 'game-preferences',
    kind: 'localstorage-prefix',
    names: [
      'vb-',
      'vega_volume',
      'haw-music-',
      'haw-sfx-',
      'kk-',
      'neon-driftway.vr',
      'neurodrive_settings',
      'neurodrive_minimap_pos',
      'dr.',
      'rmh-globeset-shapes',
      'rmh-globeset-view',
      'synapse-storm-settings',
      'rmh:tf2-game:settings:',
    ],
    personal: false,
  },
];

/** The Web Storage key every sign-out path reads: "clear this device when I sign out". A per-device choice. */
export const CLEAR_ON_SIGN_OUT_KEY = 'rmh-device-clear-on-sign-out';

export function storeById(id: string): DeviceStore | undefined {
  return DEVICE_STORES.find((s) => s.id === id);
}

/** The registry line that covers a Web Storage key, if any (longest matching name wins). */
export function storeForKey(key: string): DeviceStore | undefined {
  let best: DeviceStore | undefined;
  let bestLen = -1;
  for (const s of DEVICE_STORES) {
    if (s.kind !== 'localstorage-prefix') continue;
    for (const n of s.names) {
      if (key.startsWith(n) && n.length > bestLen) {
        best = s;
        bestLen = n.length;
      }
    }
  }
  return best;
}
