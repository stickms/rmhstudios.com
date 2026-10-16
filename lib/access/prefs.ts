/**
 * Access & comfort preferences that sit beside the §13 appearance suite: text
 * spacing, format preferences, caption style, shake-to-report, bedtime mode and
 * the running-timer notification. Client-only (localStorage) and zod-free so the
 * root route can import the pre-paint script without pulling anything heavy.
 *
 * One JSON blob under `rmh-access`; `applyAccessPrefs` is the only DOM writer and
 * `ACCESS_PREPAINT_SCRIPT` is its ES5 twin for before first paint — change both
 * together. Everything lands as a custom property / attribute on <html> once,
 * never per frame.
 */

export const ACCESS_KEY = 'rmh-access';
export const QUIET_HOURS_KEY = 'rmh-quiet-hours';
export const SHAKE_OK_KEY = 'rmh-shake-ok';
export const ACCESS_EVENT = 'rmh:access-prefs';

export const TEXT_SPACING = ['off', 'relaxed', 'wide'] as const;
export const CLOCKS = ['auto', '12', '24'] as const;
export const WEEK_STARTS = ['auto', '0', '1', '6'] as const;
export const NUMBER_FORMATS = ['auto', 'en-US', 'de-DE', 'fr-FR', 'en-IN'] as const;
export const CAPTION_SIZES = ['sm', 'md', 'lg', 'xl'] as const;
export const CAPTION_BGS = ['none', 'dim', 'solid'] as const;

export interface AccessPrefs {
  spacing: (typeof TEXT_SPACING)[number];
  clock: (typeof CLOCKS)[number];
  weekStart: (typeof WEEK_STARTS)[number];
  numberFormat: (typeof NUMBER_FORMATS)[number];
  captionSize: (typeof CAPTION_SIZES)[number];
  captionBg: (typeof CAPTION_BGS)[number];
  shake: boolean;
  bedtime: boolean;
  activity: boolean;
}

export const DEFAULT_ACCESS_PREFS: AccessPrefs = {
  spacing: 'off',
  clock: 'auto',
  weekStart: 'auto',
  numberFormat: 'auto',
  captionSize: 'md',
  captionBg: 'dim',
  shake: true,
  bedtime: false,
  activity: false,
};

/** line-height / letter-spacing / word-spacing per level (WCAG 1.4.12 is `wide`). */
export const SPACING_VARS = {
  relaxed: { lh: '1.6', ls: '0.05em', ws: '0.1em' },
  wide: { lh: '1.8', ls: '0.12em', ws: '0.16em' },
} as const;
export const CAPTION_SCALE = { sm: '0.8', md: '1', lg: '1.3', xl: '1.7' } as const;
export const CAPTION_BG_CSS = {
  none: 'transparent',
  dim: 'rgb(0 0 0 / 0.6)',
  solid: 'rgb(0 0 0 / 0.95)',
} as const;

function pick<T extends string>(list: readonly T[], v: unknown, fallback: T): T {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function parseAccessPrefs(raw: unknown): AccessPrefs {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_ACCESS_PREFS;
  return {
    spacing: pick(TEXT_SPACING, o.spacing, d.spacing),
    clock: pick(CLOCKS, o.clock, d.clock),
    weekStart: pick(WEEK_STARTS, o.weekStart, d.weekStart),
    numberFormat: pick(NUMBER_FORMATS, o.numberFormat, d.numberFormat),
    captionSize: pick(CAPTION_SIZES, o.captionSize, d.captionSize),
    captionBg: pick(CAPTION_BGS, o.captionBg, d.captionBg),
    shake: typeof o.shake === 'boolean' ? o.shake : d.shake,
    bedtime: o.bedtime === true,
    activity: o.activity === true,
  };
}

/** Quiet window [start, end) in minutes-from-midnight, mirrored from notification settings. */
export function readQuietHours(): { start: number; end: number } | null {
  try {
    const raw = localStorage.getItem(QUIET_HOURS_KEY);
    if (!raw) return null;
    const [s, e] = raw.split(',').map(Number);
    if (!Number.isFinite(s) || !Number.isFinite(e) || s === e) return null;
    return { start: s, end: e };
  } catch {
    return null;
  }
}

export function mirrorQuietHours(start: number | null, end: number | null) {
  try {
    if (start == null || end == null || start === end) localStorage.removeItem(QUIET_HOURS_KEY);
    else localStorage.setItem(QUIET_HOURS_KEY, `${start},${end}`);
    window.dispatchEvent(new Event(ACCESS_EVENT));
  } catch {
    /* storage unavailable */
  }
}

/** True when the local clock is inside the mirrored quiet window. */
export function inLocalQuietHours(now = new Date()): boolean {
  const q = readQuietHours();
  if (!q) return false;
  const m = now.getHours() * 60 + now.getMinutes();
  return q.start < q.end ? m >= q.start && m < q.end : m >= q.start || m < q.end;
}

export function applyAccessPrefs(html: HTMLElement, p: AccessPrefs) {
  const s = html.style;
  if (p.spacing === 'off') {
    html.removeAttribute('data-text-spacing');
    s.removeProperty('--rmh-ts-lh');
    s.removeProperty('--rmh-ts-ls');
    s.removeProperty('--rmh-ts-ws');
  } else {
    const v = SPACING_VARS[p.spacing];
    html.setAttribute('data-text-spacing', p.spacing);
    s.setProperty('--rmh-ts-lh', v.lh);
    s.setProperty('--rmh-ts-ls', v.ls);
    s.setProperty('--rmh-ts-ws', v.ws);
  }
  s.setProperty('--rmh-cue-scale', CAPTION_SCALE[p.captionSize]);
  s.setProperty('--rmh-cue-bg', CAPTION_BG_CSS[p.captionBg]);
  if (p.bedtime && inLocalQuietHours()) html.setAttribute('data-bedtime', '1');
  else html.removeAttribute('data-bedtime');
}

let cache: AccessPrefs | null = null;

export function getAccessPrefs(): AccessPrefs {
  if (cache) return cache;
  if (typeof localStorage === 'undefined') return DEFAULT_ACCESS_PREFS;
  try {
    cache = parseAccessPrefs(JSON.parse(localStorage.getItem(ACCESS_KEY) || 'null'));
  } catch {
    cache = DEFAULT_ACCESS_PREFS;
  }
  return cache;
}

export function setAccessPrefs(patch: Partial<AccessPrefs>) {
  const next = parseAccessPrefs({ ...getAccessPrefs(), ...patch });
  cache = next;
  try {
    localStorage.setItem(ACCESS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — the change still applies for this tab */
  }
  applyAccessPrefs(document.documentElement, next);
  window.dispatchEvent(new Event(ACCESS_EVENT));
}

let hydrated = false;
/** Set once the first client commit is done, so SSR/hydration never see a non-default format. */
export function markAccessHydrated() {
  hydrated = true;
}
export function hydratedNumberFormat(): AccessPrefs['numberFormat'] {
  return hydrated ? getAccessPrefs().numberFormat : 'auto';
}

export function subscribeAccessPrefs(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === ACCESS_KEY || e.key === QUIET_HOURS_KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener(ACCESS_EVENT, cb);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(ACCESS_EVENT, cb);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Pre-paint twin of `applyAccessPrefs` (ES5, try/catch — it runs before any bundle
 * does). Serialized from the same constants so it cannot drift from them.
 */
export const ACCESS_PREPAINT_SCRIPT = `(function(){try{var r=localStorage.getItem(${JSON.stringify(ACCESS_KEY)});if(!r)return;var p=JSON.parse(r)||{};var h=document.documentElement,s=h.style;var SV=${JSON.stringify(SPACING_VARS)};var CS=${JSON.stringify(CAPTION_SCALE)};var CB=${JSON.stringify(CAPTION_BG_CSS)};if(SV.hasOwnProperty(p.spacing)){var v=SV[p.spacing];h.setAttribute("data-text-spacing",p.spacing);s.setProperty("--rmh-ts-lh",v.lh);s.setProperty("--rmh-ts-ls",v.ls);s.setProperty("--rmh-ts-ws",v.ws)}if(CS.hasOwnProperty(p.captionSize))s.setProperty("--rmh-cue-scale",CS[p.captionSize]);if(CB.hasOwnProperty(p.captionBg))s.setProperty("--rmh-cue-bg",CB[p.captionBg]);if(p.bedtime===true){var q=(localStorage.getItem(${JSON.stringify(QUIET_HOURS_KEY)})||"").split(",");var a=+q[0],b=+q[1];if(q.length===2&&a!==b){var d=new Date(),m=d.getHours()*60+d.getMinutes();if(a<b?(m>=a&&m<b):(m>=a||m<b))h.setAttribute("data-bedtime","1")}}}catch(e){}})()`;
