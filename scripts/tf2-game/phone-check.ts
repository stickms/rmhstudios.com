/**
 * Phone and tablet check of the browser games (not part of any test suite): drives /tf2/play,
 * /half-life-2 and /portal on a matrix of phone-sized devices — iPhone SE, iPhone 15, Pixel 7, a
 * small Android and an iPad mini, each in portrait and landscape — with REAL touch input (CDP
 * `Input.dispatchTouchEvent`: taps, holds, and the thumbstick and look drag with two fingers at
 * once), the device's safe-area insets emulated (`Emulation.setSafeAreaInsetsOverride`), and
 * asserts on every view it reaches:
 *
 *   - no horizontal scroll of the document;
 *   - every enabled control can be brought on screen (scrolled into view where its container
 *     scrolls), lies outside the safe-area insets (notch, home indicator), and is the topmost
 *     element at its centre (nothing intercepts the tap);
 *   - touch comfort: controls are at least 44 × 44 CSS px, text is at least 12 px, and text
 *     fields are at least 16 px (iOS Safari zooms the page into a smaller one on focus);
 *   - in game: the touch controls stand down while a menu is open, the HUD (the game's own
 *     panels, or a custom HUD's canvas panels) does not sit under a touch button, and the touch
 *     controls reach the game (input state, movement, view angles, weapon, ammo, jump, menus).
 *
 * Views: the lobby; TF2 offline vs bots (rotate prompt and "Play in portrait anyway", team and class
 * menus, the game with its touch controls, scoreboard, chat, voice menu, the Engineer's build PDA,
 * the Spy's disguise kit, the pause menu and every view of it — Options, HUD (with the in-game HUD
 * editor and "Test in game"), Loadout (class tabs, slot tiles, item picker, Customize, Equip),
 * Change team / class, Disconnect); Half-Life 2 and Portal (chapter select, load, touch movement,
 * use / sprint / flashlight or the portal buttons, captions, pause menu). It also reads the quality
 * tier and the frame-time governor (SwiftShader is slow: the governor's behaviour is what matters).
 *
 * Needs the same dev server as play-smoke.ts (map packages under LOCAL_STORAGE_DIR, no Postgres):
 *
 *   mkdir -p .uploads && ln -s <maps-out>/tf2 .uploads/tf2-game   # and hl2-game, portal-game
 *   DATABASE_URL=postgresql://x:x@127.0.0.1:1/x BETTER_AUTH_SECRET=<32+ chars> \
 *     BETTER_AUTH_URL=http://localhost:7997 LOCAL_STORAGE_DIR=.uploads \
 *     pnpm exec vite dev --port 7997
 *   pnpm exec tsx scripts/tf2-game/phone-check.ts --base http://localhost:7997 --out /tmp/phone-check \
 *     [--devices iphone-se,iphone-15,pixel-7,android-small,ipad-mini] [--games tf2,hl2,portal] \
 *     [--catalog <catalog.json>] [--chromium <chrome binary>] [--timeout 300000] [--min-memory-mb 3500]
 *
 * A full matrix takes about an hour under SwiftShader. Keep the dev server's HMR off if anything else
 * edits the tree meanwhile (a reload mid-run drops the match): start it from a script with
 * `createServer({ server: { hmr: false } })`. Each game runs in a fresh context; a renderer killed for
 * memory is retried (3 attempts), after waiting for `--min-memory-mb` of free memory.
 *
 * The item catalog API (/api/tf2-loadout/catalog) needs Postgres: pass `--catalog` with a catalog
 * built by lib/tf2-loadout/catalog-build.ts and the script serves it to the page (route
 * interception); without it the Loadout view is checked in its "could not load" state only.
 * Writes JPEG screenshots and report.json to --out; exits non-zero when any view fails a check.
 * Chromium's touch emulation is not iOS Safari or Chrome on Android: see the report's notes.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright';

const argv = process.argv.slice(2);
const arg = (k: string, d?: string): string | undefined => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : d;
};
const BASE = arg('base', 'http://localhost:7997')!;
const OUT = arg('out', path.resolve('phone-check-out'))!;
const GAMES = new Set((arg('games', 'tf2,hl2,portal') ?? '').split(','));
const LOAD_TIMEOUT = Number(arg('timeout', '300000'));
const CATALOG = arg('catalog');

function findChromium(): string | undefined {
  const given = arg('chromium') ?? process.env.CHROMIUM_PATH;
  if (given) return given;
  const base = '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  return readdirSync(base)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort()
    .reverse()
    .map((d) => path.join(base, d, 'chrome-linux64', 'chrome'))
    .find(existsSync);
}

/* ───────────────────────────── devices ───────────────────────────── */

interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
interface Device {
  id: string;
  width: number;
  height: number;
  dpr: number;
  ua: string;
  /** Safe-area insets as the device reports them full screen (a home-screen app; Safari's own bars only shrink them). */
  safe: { portrait: Insets; landscape: Insets };
}

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const ANDROID_UA = (model: string) =>
  `Mozilla/5.0 (Linux; Android 15; ${model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36`;
const NONE: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

const DEVICES: Device[] = [
  { id: 'iphone-se', width: 375, height: 667, dpr: 2, ua: IOS_UA, safe: { portrait: { ...NONE, top: 20 }, landscape: NONE } },
  {
    id: 'iphone-15',
    width: 393,
    height: 852,
    dpr: 3,
    ua: IOS_UA,
    safe: { portrait: { top: 59, right: 0, bottom: 34, left: 0 }, landscape: { top: 0, right: 59, bottom: 21, left: 59 } },
  },
  {
    id: 'pixel-7',
    width: 412,
    height: 915,
    dpr: 2.625,
    ua: ANDROID_UA('Pixel 7'),
    // Edge-to-edge Chrome (Android 15): the status bar and the gesture bar, the camera cutout in landscape.
    safe: { portrait: { top: 24, right: 0, bottom: 16, left: 0 }, landscape: { top: 0, right: 0, bottom: 16, left: 24 } },
  },
  { id: 'android-small', width: 360, height: 740, dpr: 3, ua: ANDROID_UA('SM-A146B'), safe: { portrait: NONE, landscape: NONE } },
  {
    id: 'ipad-mini',
    width: 744,
    height: 1133,
    dpr: 2,
    ua: IPAD_UA,
    safe: { portrait: { top: 24, right: 0, bottom: 20, left: 0 }, landscape: { top: 24, right: 0, bottom: 20, left: 0 } },
  },
];
const ONLY_DEVICES = arg('devices')?.split(',');

type Orient = 'portrait' | 'landscape';

/* ───────────────────────────── report ───────────────────────────── */

interface Audit {
  overflowX: number;
  controls: number;
  clipped: string[];
  unsafe: string[];
  covered: string[];
  small: string[];
  tinyText: string[];
  zoomInputs: string[];
  hudOverlap?: string[];
}
interface ViewResult {
  device: string;
  orient: Orient;
  view: string;
  ok: boolean;
  problems: string[];
  shot?: string;
  audit?: Audit;
}

const results: ViewResult[] = [];
const notes: string[] = [];
const checks: Array<{ device: string; check: string; ok: boolean; detail: string }> = [];
const log = (...a: unknown[]) => process.stdout.write(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n');

function check(device: string, name: string, ok: boolean, detail = ''): boolean {
  checks.push({ device, check: name, ok, detail });
  log(`    ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

/* ───────────────────────────── the page ───────────────────────────── */

class Phone {
  orient: Orient = 'portrait';
  constructor(
    readonly device: Device,
    readonly ctx: BrowserContext,
    readonly page: Page,
    readonly cdp: CDPSession,
  ) {}

  get label(): string {
    return `${this.device.id}/${this.orient}`;
  }

  get safe(): Insets {
    return this.device.safe[this.orient];
  }

  async rotate(orient: Orient): Promise<void> {
    this.orient = orient;
    const { width, height } = this.device;
    const size = orient === 'portrait' ? { width, height } : { width: height, height: width };
    await this.page.setViewportSize(size);
    await this.cdp.send('Emulation.setSafeAreaInsetsOverride' as never, { insets: this.safe } as never);
    await this.page.waitForTimeout(600);
  }

  async touch(type: 'touchStart' | 'touchMove' | 'touchEnd', points: Array<{ x: number; y: number; id: number }>): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 4, radiusY: 4, force: 1 })),
    });
  }

  async tapAt(x: number, y: number, holdMs = 60): Promise<void> {
    await this.touch('touchStart', [{ x, y, id: 1 }]);
    await this.page.waitForTimeout(holdMs);
    await this.touch('touchEnd', []);
  }

  /** The centre of the first visible element matching `selector` (optionally with this accessible name / text). */
  async centre(selector: string, name?: RegExp): Promise<{ x: number; y: number } | null> {
    return this.page.evaluate(
      ({ selector, src, flags }) => {
        const re = src ? new RegExp(src, flags) : null;
        for (const el of document.querySelectorAll<HTMLElement>(selector)) {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0 || !el.checkVisibility()) continue;
          const n = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
          if (re && !re.test(n)) continue;
          // Centred, as a player scrolls what they want into the middle (not under a sticky header).
          el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
          const q = el.getBoundingClientRect();
          return { x: q.left + q.width / 2, y: q.top + q.height / 2 };
        }
        return null;
      },
      { selector, src: name?.source, flags: name?.flags },
    );
  }

  /** Taps the element's centre with a finger; false when there is no such element. */
  async tap(selector: string, name?: RegExp, holdMs = 60): Promise<boolean> {
    const c = await this.centre(selector, name);
    if (!c) return false;
    await this.tapAt(c.x, c.y, holdMs);
    await this.page.waitForTimeout(250);
    return true;
  }

  async shot(name: string): Promise<string> {
    const file = path.join(OUT, `${this.device.id}-${this.orient}-${name}.jpg`);
    await this.page.screenshot({ path: file, type: 'jpeg', quality: 60, timeout: 120_000 });
    return file;
  }

  /** Audits the controls under `root` (default: the topmost open dialog, else the body). */
  async audit(view: string, opts: { root?: string; exclude?: string; comfort?: boolean; hud?: boolean; shot?: boolean } = {}): Promise<ViewResult> {
    const vw = this.page.viewportSize()!.width;
    const a = await this.page.evaluate(auditInPage, { safe: this.safe, root: opts.root ?? null, exclude: opts.exclude ?? null, hud: !!opts.hud, vw });
    const comfort = opts.comfort !== false;
    const problems = [
      ...(a.overflowX > 1 ? [`horizontal scroll ${a.overflowX}px`] : []),
      ...a.clipped.map((s) => `off screen: ${s}`),
      ...a.unsafe.map((s) => `in the safe-area inset: ${s}`),
      ...a.covered.map((s) => `covered: ${s}`),
      ...(a.hudOverlap ?? []).map((s) => `HUD under a touch button: ${s}`),
      ...(comfort ? a.small.map((s) => `tap target < 44px: ${s}`) : []),
      ...(comfort ? a.tinyText.map((s) => `text < 12px: ${s}`) : []),
      ...a.zoomInputs.map((s) => `text field < 16px (iOS zooms): ${s}`),
    ];
    const r: ViewResult = { device: this.device.id, orient: this.orient, view, ok: problems.length === 0, problems, audit: a };
    if (opts.shot !== false) r.shot = await this.shot(view);
    results.push(r);
    log(`  ${r.ok ? 'pass' : 'FAIL'} ${this.label} ${view} (${a.controls} controls)${r.ok ? '' : `\n      ${problems.slice(0, 12).join('\n      ')}${problems.length > 12 ? `\n      … ${problems.length - 12} more` : ''}`}`);
    return r;
  }

  async game<T>(fn: string): Promise<T> {
    return this.page.evaluate(fn) as Promise<T>;
  }
}

/** Runs in the page: the reachability / overflow / comfort audit (see the header). */
function auditInPage({ safe, root: rootSel, exclude, hud, vw }: { safe: Insets; root: string | null; exclude: string | null; hud: boolean; vw: number }): Audit {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const visible = (e: Element) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && e.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  };
  const nameOf = (e: Element) =>
    (e.getAttribute('aria-label') || (e as HTMLInputElement).labels?.[0]?.textContent || e.textContent || e.getAttribute('title') || e.tagName)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40);
  const desc = (e: Element | null) => (e ? `${e.tagName.toLowerCase()}.${String((e as HTMLElement).className || '').split(' ').slice(0, 2).join('.')}` : 'nothing');
  const dialogs = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter(visible);
  const root = rootSel ? document.querySelector(rootSel) : (dialogs.at(-1) ?? document.body);
  if (!root) {
    return { overflowX: 0, controls: 0, clipped: [`(nothing matches ${rootSel})`], unsafe: [], covered: [], small: [], tinyText: [], zoomInputs: [] };
  }
  const excluded = exclude ? [...document.querySelectorAll(exclude)] : [];
  const out: Audit = {
    // A phone widens its layout viewport to fit content wider than the device (innerWidth grows with it):
    // measure against the device width.
    overflowX: Math.max(0, Math.max(document.scrollingElement?.scrollWidth ?? W, W) - vw),
    controls: 0,
    clipped: [],
    unsafe: [],
    covered: [],
    small: [],
    tinyText: [],
    zoomInputs: [],
  };
  const sel =
    'button, a[href], input:not([type=hidden]), select, textarea, [role=tab], [role=option], [role=menuitem], [role=checkbox], [role=switch], [role=slider]';
  const els = [...root.querySelectorAll<HTMLElement>(sel)].filter(
    (e) =>
      !(e as HTMLButtonElement).disabled &&
      visible(e) &&
      !excluded.some((x) => x.contains(e)) &&
      !e.closest('[aria-hidden="true"],[inert]') &&
      // A control inside another control (a button in an option) is checked as the outer one.
      !(e.parentElement?.closest(sel) && root.contains(e.parentElement.closest(sel))),
  );
  out.controls = els.length;
  for (const e of els) {
    e.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    let r = e.getBoundingClientRect();
    // A native checkbox / radio is tapped through its label.
    const label = (e as HTMLInputElement).labels?.[0];
    const hit = label && (e.matches('[type=checkbox],[type=radio]') || false) ? label.getBoundingClientRect() : r;
    const name = nameOf(e);
    if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) {
      out.clipped.push(`${name} @${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`);
      continue;
    }
    if (r.left < safe.left - 1 || r.right > W - safe.right + 1 || r.top < safe.top - 1 || r.bottom > H - safe.bottom + 1) {
      out.unsafe.push(`${name} @${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)}`);
    }
    r = e.getBoundingClientRect();
    const x = Math.min(W - 1, Math.max(0, r.left + r.width / 2));
    const y = Math.min(H - 1, Math.max(0, r.top + r.height / 2));
    const top = document.elementFromPoint(x, y);
    const ok = !!top && (top === e || e.contains(top) || (!!label && label.contains(top)) || (top instanceof HTMLLabelElement && top.control === e));
    if (!ok) out.covered.push(`${name} -> ${desc(top)}`);
    if (Math.max(hit.width, r.width) < 43.5 || Math.max(hit.height, r.height) < 43.5) {
      out.small.push(`${name} ${Math.round(Math.max(hit.width, r.width))}×${Math.round(Math.max(hit.height, r.height))}`);
    }
    if (e.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]), select, textarea')) {
      const fs = parseFloat(getComputedStyle(e).fontSize);
      if (fs < 16) out.zoomInputs.push(`${name} ${fs}px`);
    }
  }
  // Text below 12px (each element with its own text once).
  const seen = new Set<Element>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const p = n.parentElement;
    if (!p || seen.has(p) || !n.textContent?.trim()) continue;
    seen.add(p);
    if (!visible(p) || p.closest('[aria-hidden="true"],.sr-only,.tf2g-sr') || excluded.some((x) => x.contains(p))) continue;
    const fs = parseFloat(getComputedStyle(p).fontSize);
    if (fs < 11.75) out.tinyText.push(`"${n.textContent.trim().slice(0, 24)}" ${fs.toFixed(1)}px`);
  }
  out.tinyText = [...new Set(out.tinyText)].slice(0, 20);
  window.scrollTo(0, 0);

  if (hud) {
    // What the HUD paints (the game's panels, and a custom HUD's canvas panels) against the touch buttons.
    const buttons = [...document.querySelectorAll('.tf2g-touch .tf2g-touch-btn')].filter(visible).map((b) => ({ name: nameOf(b), r: b.getBoundingClientRect() }));
    const painted: Array<{ name: string; r: DOMRect | { left: number; top: number; right: number; bottom: number } }> = [];
    for (const panel of document.querySelectorAll('.tf2g-hud .tf2g-panel')) {
      if (panel.closest('.tf2g-touch') || !visible(panel)) continue;
      const name = desc(panel.firstElementChild ?? panel);
      for (const el of [panel, ...panel.querySelectorAll('*')]) {
        if (!visible(el)) continue;
        const cs = getComputedStyle(el);
        const own = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent?.trim());
        const paints = own || /^(IMG|SVG|CANVAS)$/i.test(el.tagName) || cs.backgroundImage !== 'none' || !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor);
        if (paints) painted.push({ name, r: el.getBoundingClientRect() });
      }
    }
    // A custom HUD's canvas: its scene (private fields, read for the check) is in safe-area coordinates.
    type Node = { name?: string; shown: boolean; ops: unknown[]; rect: { x: number; y: number; w: number; h: number } };
    const custom = (window as unknown as { __rmhCustomHud?: { current?: { nodes: Node[] }; insets?: Insets } }).__rmhCustomHud;
    const canvas = document.querySelector('canvas.tf2g-custom-hud');
    if (canvas && custom?.current) {
      const c = canvas.getBoundingClientRect();
      const ox = c.left + (custom.insets?.left ?? 0);
      const oy = c.top + (custom.insets?.top ?? 0);
      for (const n of custom.current.nodes) {
        if (!n.shown || !n.ops.length || n.rect.w <= 0 || n.rect.h <= 0) continue;
        painted.push({ name: `custom:${n.name ?? '?'}`, r: { left: ox + n.rect.x, top: oy + n.rect.y, right: ox + n.rect.x + n.rect.w, bottom: oy + n.rect.y + n.rect.h } });
      }
    }
    const hits = new Set<string>();
    for (const b of buttons) {
      for (const p of painted) {
        const ix = Math.min(b.r.right, p.r.right) - Math.max(b.r.left, p.r.left);
        const iy = Math.min(b.r.bottom, p.r.bottom) - Math.max(b.r.top, p.r.top);
        if (ix > 3 && iy > 3) hits.add(`${p.name} under "${b.name}"`);
      }
    }
    out.hudOverlap = [...hits].slice(0, 20);
  }
  return out;
}

/* ───────────────────────────── game helpers ───────────────────────────── */

type Debug = { team: number; cls: number; alive: boolean; origin: { x: number; y: number; z: number } | null; stats?: { fps: number; frameMs: number; resolutionScale: number; tier: string } };

const G = (body: string) => `(() => { const g = window.__rmhGame; if (!g) return null; ${body} })()`;
const debug = (p: Phone) => p.game<Debug | null>(G('return g.debug();'));
const localHud = (p: Phone) =>
  p.game<{ cls: number; team: number; alive: boolean; activeSlot: number; ammo: { clip: number; reserve: number; reloading: boolean }; loadoutPending?: boolean } | null>(
    G('const l = g.store.getSnapshot().local; return l ? { cls: l.cls, team: l.team, alive: l.alive, activeSlot: l.activeSlot, ammo: l.ammo, loadoutPending: l.loadoutPending } : null;'),
  );
const heldTouch = (p: Phone) => p.game<string[]>(G('return [...g.input.held.touch];'));
const yaw = (p: Phone) => p.game<number | null>(G('return (g.viewAngles ?? g.angles)?.y ?? null;'));

async function waitFor(p: Phone, what: string, fn: () => Promise<boolean>, ms = 20_000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn().catch(() => false)) return true;
    await p.page.waitForTimeout(300);
  }
  log(`    (timed out waiting for ${what})`);
  return false;
}

/** Bots can kill the player mid-check: wait out the respawn before a check that needs a live player. */
async function ensureAlive(p: Phone): Promise<boolean> {
  return waitFor(p, 'a respawn', async () => !!(await localHud(p))?.alive, 25_000);
}

async function waitRunning(p: Phone): Promise<boolean> {
  try {
    await p.page.waitForFunction(
      () => {
        const ph = document.querySelector('.tf2g-stage')?.getAttribute('data-phase');
        return ph === 'running' || ph === 'error' || ph === 'ended';
      },
      undefined,
      { timeout: LOAD_TIMEOUT, polling: 500 },
    );
  } catch {
    return false;
  }
  return (await p.page.getAttribute('.tf2g-stage', 'data-phase')) === 'running';
}

/** Taps (with a finger) until the game surface mounts: the first taps can land before hydration. */
async function startByTap(p: Phone, name: RegExp): Promise<boolean> {
  // A busy dev server can take minutes to hydrate the first page.
  for (let i = 0; i < 100; i++) {
    await p.tap('button', name);
    try {
      await p.page.waitForSelector('.tf2g-stage', { timeout: 3000 });
      return true;
    } catch {
      /* not hydrated yet */
    }
  }
  return false;
}

/** Records the impulses the input layer queues (the client drains them every frame). */
async function recordImpulses(p: Phone): Promise<void> {
  await p.game(
    G(`let q = g.input.impulses; window.__imp = [];
       const wrap = (a) => { const push = a.push.bind(a); a.push = (...x) => { window.__imp.push(...x); return push(...x); }; return a; };
       Object.defineProperty(g.input, 'impulses', { configurable: true, get: () => q, set: (v) => { q = wrap(v); } });
       q = wrap(q); return true;`),
  );
}
const recordedImpulses = (p: Phone) => p.page.evaluate(() => ((window as unknown as { __imp?: string[] }).__imp ?? []).slice());

/** Holds a touch button down for `ms`, sampling `probe` while held. */
let touchId = 10;
/** Actions a released button left held (a lost pointerup would keep the weapon firing). */
const stuck: string[] = [];

async function holdButton<T>(p: Phone, label: RegExp, ms: number, probe?: () => Promise<T>): Promise<{ found: boolean; samples: T[] }> {
  const c = await p.centre('.tf2g-touch .tf2g-touch-btn', label);
  if (!c) return { found: false, samples: [] };
  const id = ++touchId;
  await p.touch('touchStart', [{ ...c, id }]);
  const samples: T[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (probe) samples.push(await probe());
    await p.page.waitForTimeout(80);
  }
  if (probe) samples.push(await probe());
  await p.touch('touchEnd', []);
  await p.page.waitForTimeout(250);
  const left = await heldTouch(p);
  if (left?.length) stuck.push(`${p.label} ${label.source}: ${left.join(',')}`);
  return { found: true, samples };
}

/** Thumbstick (left) and look (right) at the same time with two fingers. */
async function stickAndLook(p: Phone, ms = 1800): Promise<{ moved: number; turned: number; heldStick: boolean }> {
  const vp = p.page.viewportSize()!;
  const before = await debug(p);
  const yaw0 = await yaw(p);
  const s0 = { x: vp.width * 0.18, y: vp.height * 0.72 };
  const l0 = { x: vp.width * 0.62, y: vp.height * 0.45 };
  await p.touch('touchStart', [{ ...s0, id: 1 }]);
  await p.touch('touchStart', [{ ...s0, id: 1 }, { ...l0, id: 2 }]);
  const steps = 24;
  let heldStick = false;
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    await p.touch('touchMove', [
      { x: s0.x + 10 * k, y: s0.y - 60 * k, id: 1 },
      { x: l0.x + 90 * k, y: l0.y, id: 2 },
    ]);
    if (i === steps / 2) heldStick = !!(await p.game<number | null>(G('return g.input.analog.touch.y;')));
    await p.page.waitForTimeout(ms / steps);
  }
  await p.page.waitForTimeout(400);
  await p.touch('touchEnd', []);
  await p.page.waitForTimeout(300);
  const after = await debug(p);
  const yaw1 = await yaw(p);
  const moved = before?.origin && after?.origin ? Math.hypot(after.origin.x - before.origin.x, after.origin.y - before.origin.y) : 0;
  let turned = yaw0 !== null && yaw1 !== null ? Math.abs(yaw1 - yaw0) : 0;
  if (turned > 180) turned = 360 - turned;
  return { moved, turned, heldStick };
}

/** One finger on the stick, pushed by `dir` px for a second; the distance moved. */
async function stickOnly(p: Phone, dir: { x: number; y: number }): Promise<number> {
  const vp = p.page.viewportSize()!;
  const s0 = { x: vp.width * 0.18, y: vp.height * 0.72 };
  const before = await debug(p);
  await p.touch('touchStart', [{ ...s0, id: 1 }]);
  for (let i = 1; i <= 6; i++) await p.touch('touchMove', [{ x: s0.x + (dir.x * i) / 6, y: s0.y + (dir.y * i) / 6, id: 1 }]);
  await p.page.waitForTimeout(1000);
  await p.touch('touchEnd', []);
  await p.page.waitForTimeout(300);
  const after = await debug(p);
  return before?.origin && after?.origin ? Math.hypot(after.origin.x - before.origin.x, after.origin.y - before.origin.y) : 0;
}

const pauseOpen = (p: Phone) => p.page.evaluate(() => !!document.querySelector('[role=dialog] .tf2hud-title'));
const touchUp = (p: Phone) => p.page.evaluate(() => !!document.querySelector('.tf2g-touch'));
const zonesOff = (p: Phone) =>
  p.page.evaluate(() => {
    const z = [...document.querySelectorAll('.tf2g-touch-zone')];
    return z.length === 0 || z.every((e) => getComputedStyle(e).pointerEvents === 'none');
  });

async function openPause(p: Phone): Promise<boolean> {
  if (await pauseOpen(p)) return true;
  await p.tap('.tf2g-touch .tf2g-touch-btn', /^Menu/);
  return waitFor(p, 'the pause menu', () => pauseOpen(p), 5000);
}

async function closeDialog(p: Phone): Promise<void> {
  await p.tap('[role=dialog] button', /^Close$/);
  await p.page.waitForTimeout(400);
}

async function pauseView(p: Phone, name: RegExp): Promise<boolean> {
  if (!(await openPause(p))) return false;
  // Back to the main list first.
  await p.tap('[role=dialog] button', /^Back$/);
  return p.tap('[role=dialog] button', name);
}

/* ───────────────────────────── flows ───────────────────────────── */

async function lobby(p: Phone): Promise<void> {
  const open = async () => {
    await p.page.goto(`${BASE}/tf2/play`, { waitUntil: 'domcontentloaded' });
    await p.page.waitForSelector('text=Offline practice', { timeout: 180_000 });
    await p.page.waitForTimeout(1500);
  };
  await open();
  for (const o of ['portrait', 'landscape'] as const) {
    await p.rotate(o);
    await p.audit('lobby', { root: 'body' });
  }
  // The server browser's tabs (Internet / Favorites / Recent …), by touch.
  await p.rotate('portrait');
  const tabs = await p.page.evaluate(() =>
    [...document.querySelectorAll('main [role=tablist] [role=tab]')].filter((t) => t.getBoundingClientRect().width > 0).map((t) => t.textContent?.trim() ?? ''),
  );
  for (const name of tabs) {
    const re = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
    await p.tap('main [role=tab]', re);
  }
  if (tabs.length) await p.audit('lobby-browser-tabs', { root: 'body' });
  // The site's other shipped theme (graphite): the TF2 Hub keeps its own palette, which must hold up under it.
  await p.page.evaluate(() => localStorage.setItem('rmh-style', 'graphite'));
  await open();
  for (const o of ['portrait', 'landscape'] as const) {
    await p.rotate(o);
    await p.audit('lobby-graphite', { root: 'body' });
  }
  await p.page.evaluate(() => localStorage.removeItem('rmh-style'));
  await open();
}

async function tf2(p: Phone): Promise<void> {
  const d = p.device.id;
  await lobby(p);
  await p.rotate('portrait');
  await p.page.getByRole('spinbutton').first().fill('2');
  if (!check(d, 'tf2: Play offline starts the game by touch', await startByTap(p, /Play offline/))) {
    await p.shot('tf2-start-failed');
    return;
  }
  if (!check(d, 'tf2: map loads (ctf_2fort)', await waitRunning(p))) {
    await p.shot('tf2-load-failed');
    return;
  }
  await p.page.waitForTimeout(1500);

  // Portrait: the rotate hint, and "Play in portrait anyway".
  const isPhone = Math.min(p.device.width, p.device.height) < 600;
  const rotateShown = await p.page.evaluate(() => !!document.getElementById('tf2g-rotate-title'));
  check(d, isPhone ? 'tf2: portrait shows the rotate prompt' : 'tf2: a tablet plays in portrait (no rotate prompt)', isPhone ? rotateShown : !rotateShown);
  if (rotateShown) {
    await p.audit('rotate-prompt', { root: '.tf2g-play-screen' });
    await p.tap('button', /Play in portrait anyway/);
    check(d, 'tf2: "Play in portrait anyway" dismisses it', !(await p.page.evaluate(() => !!document.getElementById('tf2g-rotate-title'))));
  }

  // The join flow: the team menu when the match asks for a team (offline play auto-assigns one), then the class menu.
  await waitFor(p, 'a join menu', () => p.page.evaluate(() => !!document.querySelector('.tf2g-team-card, .tf2g-class-card')));
  if (await p.page.evaluate(() => !!document.querySelector('.tf2g-team-card'))) {
    await teamMenu(p);
    await p.tap('.tf2g-team-card', /BLU/i);
  } else notes.push(`${d}: offline play put the player on a team itself (the team menu is checked through Change team)`);
  const classMenu = await waitFor(p, 'the class menu', () => p.page.evaluate(() => !!document.querySelector('.tf2g-class-card')), 8000);
  check(d, 'tf2: the class menu opens on joining', classMenu);
  await p.audit('class-menu', { root: '.tf2g-select' });
  await p.rotate('landscape');
  check(d, 'tf2: touch zones stand down under the class menu', await zonesOff(p));
  await p.audit('class-menu', { root: '.tf2g-select' });
  await p.tap('.tf2g-class-card', /Soldier/);
  const alive = await waitFor(p, 'spawn', async () => !!(await localHud(p))?.alive, 30_000);
  check(d, 'tf2: class tap spawns a Soldier', alive);
  if (!alive) return;
  await p.page.waitForTimeout(1500);

  // The game with its touch controls, both orientations.
  await p.audit('game', { root: '.tf2g-touch', hud: true });
  await p.rotate('portrait');
  await p.audit('game', { root: '.tf2g-touch', hud: true });
  await p.rotate('landscape');

  await ensureAlive(p);
  // Two fingers: the stick moves while the other finger looks.
  const sl = await stickAndLook(p);
  check(d, 'tf2: stick + look at once (two fingers)', sl.moved > 20 && sl.turned > 2 && sl.heldStick, `moved ${sl.moved.toFixed(0)}u, turned ${sl.turned.toFixed(1)}°`);

  await ensureAlive(p);
  // Fire (ammo drops), reload, jump (rises), crouch (held), weapon next / previous.
  const before = await localHud(p);
  const fire = await holdButton(p, /^Fire$/, 700, () => heldTouch(p));
  await p.page.waitForTimeout(300);
  const afterFire = await localHud(p);
  check(
    d,
    'tf2: fire button fires',
    fire.found && fire.samples.some((s) => s.includes('attack')) && !!before && !!afterFire && afterFire.ammo.clip < before.ammo.clip,
    `clip ${before?.ammo.clip} → ${afterFire?.ammo.clip}`,
  );
  await ensureAlive(p);
  // Reload: the button holds +reload; the clip (one rocket down) refills or the HUD shows the reload. A bot
  // can kill the player mid-reload: then it is tried again after the respawn.
  let reloadOk = false;
  let reloadDetail = '';
  for (let attempt = 0; attempt < 3 && !reloadOk; attempt++) {
    await ensureAlive(p);
    await holdButton(p, /^Fire$/, 250);
    const clipBefore = (await localHud(p))?.ammo.clip ?? 0;
    const reload = await holdButton(p, /^Reload$/, 2600, async () => ({ held: (await heldTouch(p)).includes('reload'), hud: await localHud(p) }));
    const refilled = reload.samples.some((x) => !!x.hud && (x.hud.ammo.reloading || x.hud.ammo.clip > clipBefore));
    const last = reload.samples.at(-1)?.hud;
    reloadOk = reload.found && reload.samples.some((x) => x.held) && refilled;
    reloadDetail = `clip ${clipBefore} → ${last?.ammo.clip} (reserve ${last?.ammo.reserve}); held ${reload.samples.some((x) => x.held)}; alive ${String(last?.alive)}`;
    if (!reloadOk && last?.alive) break;
  }
  check(d, 'tf2: reload button reloads', reloadOk, reloadDetail);
  await ensureAlive(p);
  const z0 = (await debug(p))?.origin?.z ?? 0;
  const jump = await holdButton(p, /^Jump$/, 500, async () => ({ z: (await debug(p))?.origin?.z ?? 0, held: (await heldTouch(p)).includes('jump') }));
  const rise = Math.max(z0, ...jump.samples.map((x) => x.z)) - z0;
  check(d, 'tf2: jump button jumps', jump.found && jump.samples.some((x) => x.held) && rise > 8, `z +${rise.toFixed(0)}; held ${jump.samples.some((x) => x.held)}; alive ${String((await localHud(p))?.alive)}`);
  const duck = await holdButton(p, /^Crouch$/, 300, () => heldTouch(p));
  check(d, 'tf2: crouch button holds duck', duck.found && duck.samples.some((s) => s.includes('duck')));
  await ensureAlive(p);
  const slot0 = (await localHud(p))?.activeSlot;
  // A weapon switch lands a frame or more later (SwiftShader frames on a tablet-sized canvas are slow).
  await p.tap('.tf2g-touch .tf2g-touch-btn', /^Next weapon/);
  await waitFor(p, 'the next weapon', async () => (await localHud(p))?.activeSlot !== slot0, 4000);
  const slot1 = (await localHud(p))?.activeSlot;
  await p.tap('.tf2g-touch .tf2g-touch-btn', /^Previous weapon/);
  await waitFor(p, 'the previous weapon', async () => (await localHud(p))?.activeSlot === slot0, 4000);
  const slot2 = (await localHud(p))?.activeSlot;
  check(d, 'tf2: next / previous weapon', slot1 !== slot0 && slot2 === slot0, `${slot0} → ${slot1} → ${slot2}`);

  // Scoreboard, chat, voice.
  await p.tap('.tf2g-touch .tf2g-touch-btn', /^Scoreboard/);
  const scores = await p.page.evaluate(() => !!document.querySelector('.tf2g-scores'));
  check(d, 'tf2: scoreboard button shows the scoreboard', scores);
  // The scoreboard is HUD (TF2's own small type, nothing to tap): checked for reach and overflow only.
  if (scores) await p.audit('scoreboard', { root: '.tf2g-scores', comfort: false });
  await p.tap('.tf2g-touch .tf2g-touch-btn', /^Scoreboard/);
  check(d, 'tf2: scoreboard button hides it again', !(await p.page.evaluate(() => !!document.querySelector('.tf2g-scores'))));
  await p.tap('.tf2g-touch .tf2g-touch-btn', /^Chat/);
  const chat = await p.page.evaluate(() => !!document.querySelector('#tf2g-chat-field'));
  check(d, 'tf2: chat button opens the chat field', chat);
  if (chat) {
    check(d, 'tf2: touch zones stand down while chatting', await zonesOff(p));
    await p.audit('chat', { root: '.tf2g-chat-input' });
    // A phone has no Esc: the chat closes from the touch controls.
    await p.tap('.tf2g-chat-input button, .tf2g-touch .tf2g-touch-btn', /^(Close chat|Menu)/);
    await p.page.waitForTimeout(300);
    check(d, 'tf2: chat closes by touch', !(await p.page.evaluate(() => !!document.querySelector('#tf2g-chat-field'))));
    if (await pauseOpen(p)) await closeDialog(p);
  }
  await p.tap('.tf2g-touch .tf2g-touch-btn', /^Voice commands/);
  const voice = await p.page.evaluate(() => !!document.querySelector('.tf2g-menu-list'));
  check(d, 'tf2: voice button opens the voice menu', voice);
  if (voice) {
    check(d, 'tf2: touch zones stand down under the voice menu', await zonesOff(p));
    await p.audit('voice-menu', { root: '.tf2g-menu-list' });
    await p.tap('.tf2g-menu-item', /MEDIC|Medic/i);
    check(d, 'tf2: a voice item tap closes the menu', !(await p.page.evaluate(() => !!document.querySelector('.tf2g-menu-list'))));
  }

  // The pause menu and its views.
  check(d, 'tf2: menu button opens the pause menu', await openPause(p));
  check(d, 'tf2: touch controls stand down under the pause menu', !(await touchUp(p)));
  for (const o of ['landscape', 'portrait'] as const) {
    await p.rotate(o);
    await p.audit('pause');
  }
  await p.rotate('landscape');

  // Options: tabs, a slider dragged by touch, a toggle tapped.
  if (await pauseView(p, /^Options$/)) {
    await p.audit('pause-options');
    await p.tap('[role=dialog] [role=tab], [role=dialog] button', /^Touch$/);
    await p.page.waitForTimeout(300);
    await p.audit('pause-options-touch');
    const slider = await p.centre('[role=dialog] input[type=range]', /Touch look sensitivity/);
    if (slider) {
      const v0 = await p.page.evaluate(() => (document.querySelector('[role=dialog] input[aria-label="Touch look sensitivity"]') as HTMLInputElement | null)?.value);
      await p.touch('touchStart', [{ x: slider.x - 20, y: slider.y, id: 3 }]);
      for (let i = 1; i <= 8; i++) await p.touch('touchMove', [{ x: slider.x - 20 + i * 8, y: slider.y, id: 3 }]);
      await p.touch('touchEnd', []);
      await p.page.waitForTimeout(200);
      const v1 = await p.page.evaluate(() => (document.querySelector('[role=dialog] input[aria-label="Touch look sensitivity"]') as HTMLInputElement | null)?.value);
      check(d, 'tf2: options slider moves by touch drag', v0 !== v1, `${v0} → ${v1}`);
    } else check(d, 'tf2: options slider moves by touch drag', false, 'slider not found');
    const t0 = await p.page.evaluate(() => (document.querySelector('[role=dialog] input[type=checkbox][aria-label="Vibration"]') as HTMLInputElement | null)?.checked);
    await p.tap('[role=dialog] input[type=checkbox]', /Vibration/);
    const t1 = await p.page.evaluate(() => (document.querySelector('[role=dialog] input[type=checkbox][aria-label="Vibration"]') as HTMLInputElement | null)?.checked);
    check(d, 'tf2: options toggle flips by tap', t0 !== undefined && t0 !== t1);
    await p.rotate('portrait');
    await p.audit('pause-options-touch');
    await p.rotate('landscape');
  }

  // HUD: the picker, the editor overlay over the match, Test in game.
  if (await pauseView(p, /^HUD$/)) {
    await waitFor(p, 'the HUD view', () => p.page.evaluate(() => /TF2 Default/.test(document.querySelector('[role=dialog]')?.textContent ?? '')), 8000);
    await p.page.waitForTimeout(800);
    await p.audit('pause-hud');
    await p.rotate('portrait');
    await p.audit('pause-hud');
    await p.rotate('landscape');
    const edit = await p.tap('[role=dialog] button', /^Edit HUD|Edit$/);
    check(d, 'tf2: Edit HUD opens the editor', edit && (await waitFor(p, 'the HUD editor', () => p.page.evaluate(() => !!document.querySelector('.tf2g-hud-editor')), 10_000)));
    await waitFor(p, 'the editor to load', () => p.page.evaluate(() => !document.querySelector('.tf2g-hud-editor [role=status]')), 30_000);
    await p.page.waitForTimeout(1500);
    await p.audit('hud-editor', { root: '.tf2g-hud-editor', comfort: false });
    await p.rotate('portrait');
    await p.audit('hud-editor', { root: '.tf2g-hud-editor', comfort: false });
    await p.rotate('landscape');
    // The editor's phone layout: one pane at a time behind a tab bar.
    if (await p.tap('.tf2g-hud-editor [role=tab], .tf2g-hud-editor button', /^Files$/i)) {
      await p.page.waitForTimeout(600);
      await p.audit('hud-editor-files', { root: '.tf2g-hud-editor', comfort: false });
      await p.tap('.tf2g-hud-editor [role=tab], .tf2g-hud-editor button', /^Preview$/i);
    }
    const tested = await p.tap('.tf2g-hud-editor button', /Test in game/);
    await p.page.waitForTimeout(2500);
    const back = !(await p.page.evaluate(() => !!document.querySelector('.tf2g-hud-editor')));
    // An unedited draft has nothing to test: the game goes back to its own HUD (by design).
    check(d, 'tf2: Test in game closes the editor and resumes the match', tested && back && !(await pauseOpen(p)));
    // A custom HUD on the canvas (TF2 Default through the HUD editor's renderer, as the hud-harness's
    // `base`), applied through the dev build's own module, for the touch-overlap check.
    const applied = await p.page.evaluate(async () => {
      const choice = (await import(/* @vite-ignore */ '/components/tf2-game/custom-hud/hud-choice.ts')) as typeof import('../../components/tf2-game/custom-hud/hud-choice');
      const types = (await import(/* @vite-ignore */ '/lib/tf2-hud/project/types.ts')) as typeof import('../../lib/tf2-hud/project/types');
      return choice.useHudChoice.getState().apply(
        { selection: { kind: 'draft', id: 'phone-check' }, meta: { ...types.DEFAULT_META, name: 'Phone check' }, overlay: new Map() },
        { persist: false },
      );
    });
    const custom = applied && (await waitFor(p, 'the custom HUD', () => p.page.evaluate(() => !!document.querySelector('canvas.tf2g-custom-hud')), 15_000));
    check(d, 'tf2: a custom HUD draws on the canvas', custom);
    if (custom) {
      await p.page.waitForTimeout(1500);
      await p.audit('game-custom-hud', { root: '.tf2g-touch', hud: true });
      await p.rotate('portrait');
      await p.page.waitForTimeout(800);
      await p.audit('game-custom-hud', { root: '.tf2g-touch', hud: true });
      await p.rotate('landscape');
      await p.page.evaluate(async () => {
        const choice = (await import(/* @vite-ignore */ '/components/tf2-game/custom-hud/hud-choice.ts')) as typeof import('../../components/tf2-game/custom-hud/hud-choice');
        await choice.useHudChoice.getState().choose({ kind: 'default' }, { persist: false });
      });
    }
  }

  // Loadout: class tabs, a slot tile, the picker, Customize, Equip and its status.
  if (await pauseView(p, /^Loadout$/)) {
    const loaded = await waitFor(p, 'the loadout view', () => p.page.evaluate(() => !!document.querySelector('[data-testid="tf2-loadout-view"]')), 20_000);
    check(d, 'tf2: loadout view loads (catalog served by interception)', loaded);
    if (loaded) {
      await p.page.waitForTimeout(800);
      await p.audit('pause-loadout');
      await p.rotate('portrait');
      await p.audit('pause-loadout');
      await p.rotate('landscape');
      await p.tap('[role=dialog] [role=tab], [role=dialog] button', /^Soldier$/);
      const slot = await p.tap('[role=dialog] [data-testid="tf2-loadout-view"] button', /Primary/);
      await p.page.waitForTimeout(600);
      check(d, 'tf2: a slot tile opens the item picker', slot && (await p.page.evaluate(() => !!document.querySelector('[role=dialog] [aria-label="Item picker"] [role=option], [role=dialog] [aria-label="Item picker"] button'))));
      await p.audit('pause-loadout-picker');
      const picked = await p.tap('[role=dialog] [aria-label="Item picker"] [role=option], [role=dialog] [aria-label="Item picker"] button', /Direct Hit/);
      await p.page.waitForTimeout(500);
      check(d, 'tf2: picking an item equips it into the slot', picked && (await p.page.evaluate(() => /Direct Hit/.test(document.querySelector('[role=dialog] [aria-label="Loadout slots"]')?.textContent ?? ''))));
      const dialogs = () => p.page.evaluate(() => document.querySelectorAll('[role=dialog]').length);
      const before = await dialogs();
      await p.tap('[role=dialog] button', /^Customi[sz]e/);
      const opened = await waitFor(p, 'the Customize dialog', async () => (await dialogs()) > before, 4000);
      check(d, 'tf2: Customize opens', opened);
      if (opened) {
        await p.page.waitForTimeout(600);
        await p.audit('pause-loadout-customize');
        await closeDialogTop(p);
        check(d, 'tf2: Customize closes by touch', (await dialogs()) === before);
      }
      await p.tap('[role=dialog] button', /^Equip$/);
      const status = await waitFor(p, 'the equip status', () => p.page.evaluate(() => /Equipped|Applies|Saved for|refused/.test(document.querySelector('[role=dialog] [data-testid="tf2-loadout-view"]')?.textContent ?? '')), 5000);
      const statusText = await p.page.evaluate(() => [...document.querySelectorAll('[role=dialog] [data-testid="tf2-loadout-view"] [role=status]')].map((e) => e.textContent).join(' | '));
      await p.audit('pause-loadout-equipped');
      if (!status) {
        // Offline the pause menu holds the match, so the answer comes once play resumes.
        await closeDialog(p);
        const answer = await waitFor(p, 'the loadout answer', async () => !!(await p.game<unknown>(G('return g.store.getSnapshot().loadout;'))), 6000);
        const a = await p.game<{ status: string } | null>(G('return g.store.getSnapshot().loadout;'));
        check(d, 'tf2: Equip is answered (after resuming: offline the pause menu holds the match)', answer, `${a?.status ?? 'none'}; in the paused menu: "${statusText.slice(0, 80)}"`);
        if (answer) notes.push(`${d}: offline, Equip's status only appears after the pause menu closes (the paused listen server answers on its next tick)`);
      } else check(d, 'tf2: Equip answers with a status', status, statusText.slice(0, 120));
    } else {
      await p.audit('pause-loadout');
    }
  }

  // Change class → Engineer: the build PDA by touch.
  if ((await pauseView(p, /^Back$|^Paused$/)) || (await openPause(p))) {
    /* main list */
  }
  await p.tap('[role=dialog] button', /^Change class$/);
  const classMenuUp = () => p.page.evaluate(() => !!document.querySelector('.tf2g-class-card'));
  if (await waitFor(p, 'the class menu', classMenuUp, 5000)) {
    // The class menu covers the touch controls (and the Menu button): it closes by its own button.
    await p.tap('.tf2g-select-close');
    check(d, 'tf2: the class menu closes by touch', !(await classMenuUp()));
    if (await openPause(p)) {
      await p.tap('[role=dialog] button', /^Back$/);
      await p.tap('[role=dialog] button', /^Change class$/);
      await waitFor(p, 'the class menu', classMenuUp, 5000);
    }
    await p.tap('.tf2g-class-card', /Engineer/);
    if (await waitFor(p, 'the Engineer', async () => { const l = await localHud(p); return !!l && l.cls === 9 && l.alive; }, 40_000)) {
      await p.page.waitForTimeout(800);
      await p.audit('game-engineer', { root: '.tf2g-touch', hud: true });
      await p.tap('.tf2g-touch .tf2g-touch-btn', /^Build$/);
      const build = await waitFor(p, 'the build menu', () => p.page.evaluate(() => !!document.querySelector('.tf2g-pda')), 4000);
      check(d, 'tf2: Build button opens the build PDA', build);
      if (build) {
        check(d, 'tf2: touch zones stand down under the PDA', await zonesOff(p));
        await p.audit('engineer-build', { root: '.tf2g-pda' });
        await p.rotate('portrait');
        await p.audit('engineer-build', { root: '.tf2g-pda' });
        await p.rotate('landscape');
        await p.tap('.tf2g-pda-item', /Sentry/i);
        await p.page.waitForTimeout(500);
      }
      await p.tap('.tf2g-touch .tf2g-touch-btn', /^Next weapon/);
    } else check(d, 'tf2: change class to Engineer', false);
  } else check(d, 'tf2: Change class opens the class menu', false);

  // Spy: the disguise kit.
  if (await openPause(p)) {
    await p.tap('[role=dialog] button', /^Back$/);
    await p.tap('[role=dialog] button', /^Change class$/);
    if (await waitFor(p, 'the class menu', () => p.page.evaluate(() => !!document.querySelector('.tf2g-class-card')), 5000)) {
      await p.tap('.tf2g-class-card', /Spy/);
      if (await waitFor(p, 'the Spy', async () => { const l = await localHud(p); return !!l && l.cls === 8 && l.alive; }, 40_000)) {
        await p.page.waitForTimeout(800);
        await p.tap('.tf2g-touch .tf2g-touch-btn', /^Disguise$/);
        const kit = await waitFor(p, 'the disguise kit', () => p.page.evaluate(() => !!document.querySelector('.tf2g-pda')), 4000);
        check(d, 'tf2: Disguise button opens the disguise kit', kit);
        if (kit) {
          await p.audit('spy-disguise', { root: '.tf2g-pda' });
          await p.rotate('portrait');
          await p.audit('spy-disguise', { root: '.tf2g-pda' });
          await p.rotate('landscape');
          await p.tap('.tf2g-pda-item', /Scout/i);
        }
      } else check(d, 'tf2: change class to Spy', false);
    }
  }

  // Change team: the team menu by touch, BLU, then the class menu again; then Disconnect.
  if (await openPause(p)) {
    await p.tap('[role=dialog] button', /^Back$/);
    await p.tap('[role=dialog] button', /^Change team$/);
    const tm = await waitFor(p, 'the team menu', () => p.page.evaluate(() => !!document.querySelector('.tf2g-team-card')), 5000);
    check(d, 'tf2: Change team opens the team menu', tm);
    if (tm) {
      await teamMenu(p);
      await p.tap('.tf2g-team-card', /BLU/i);
      const cm = await waitFor(p, 'the class menu', () => p.page.evaluate(() => !!document.querySelector('.tf2g-class-card')), 8000);
      check(d, 'tf2: a team tap opens the class menu', cm);
      if (cm) {
        await p.tap('.tf2g-class-card', /Soldier/);
        check(d, 'tf2: BLU Soldier spawns', await waitFor(p, 'spawn', async () => { const l = await localHud(p); return !!l && l.team === 3 && l.cls === 3 && l.alive; }, 40_000));
      }
    }
    await perf(p, 'tf2');
    await openPause(p);
    await p.tap('[role=dialog] button', /^Back$/);
    await p.tap('[role=dialog] button', /^Disconnect$/);
    check(d, 'tf2: Disconnect returns to the lobby', await waitFor(p, 'the lobby', () => p.page.evaluate(() => !document.querySelector('.tf2g-stage')), 8000));
  }

  check(d, 'tf2: released buttons hold nothing', !stuck.some((x) => x.startsWith(d)), stuck.filter((x) => x.startsWith(d)).join(' | '));
  // Performance on phone settings.
}

async function teamMenu(p: Phone): Promise<void> {
  for (const o of ['portrait', 'landscape'] as const) {
    await p.rotate(o);
    await p.audit('team-menu', { root: '.tf2g-select' });
  }
  check(p.device.id, 'tf2: touch zones stand down under the team menu', await zonesOff(p));
}

async function closeDialogTop(p: Phone): Promise<void> {
  await p.page.evaluate(() => {
    const ds = [...document.querySelectorAll('[role=dialog]')];
    const top = ds.at(-1);
    const btn = [...(top?.querySelectorAll('button') ?? [])].find((b) => /^(Close|Done)$/i.test(b.getAttribute('aria-label') ?? b.textContent?.trim() ?? ''));
    btn?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  });
  const c = await p.page.evaluate(() => {
    const top = [...document.querySelectorAll('[role=dialog]')].at(-1);
    const btn = [...(top?.querySelectorAll('button') ?? [])].find((b) => /^(Close|Done)$/i.test(b.getAttribute('aria-label') ?? b.textContent?.trim() ?? ''));
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (c) await p.tapAt(c.x, c.y);
  await p.page.waitForTimeout(400);
}

async function perf(p: Phone, game: string): Promise<void> {
  const samples: Array<{ fps: number; frameMs: number; scale: number }> = [];
  for (let i = 0; i < 8; i++) {
    const s = (await debug(p))?.stats;
    if (s) samples.push({ fps: Math.round(s.fps), frameMs: Math.round(s.frameMs), scale: Number(s.resolutionScale.toFixed(2)) });
    await p.page.waitForTimeout(1000);
  }
  const tier = (await debug(p))?.stats?.tier;
  const quality = await p.page.evaluate(() => {
    const c = document.querySelector('.tf2g-stage canvas') as HTMLCanvasElement | null;
    return c ? { w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight } : null;
  });
  const scales = samples.map((s) => s.scale);
  check(p.device.id, `${game}: quality tier is 'mobile'`, tier === 'mobile', `tier ${tier}`);
  check(
    p.device.id,
    `${game}: governor holds the frame time (no runaway)`,
    samples.length > 0 && scales.every((s) => s > 0 && s <= 1),
    `scale ${scales.join(' ')}; frame ms ${samples.map((s) => s.frameMs).join(' ')}; canvas ${quality?.w}×${quality?.h} for ${quality?.cssW}×${quality?.cssH} css`,
  );
}

async function sp(p: Phone, game: 'hl2' | 'portal'): Promise<void> {
  const d = p.device.id;
  await p.page.goto(`${BASE}/${game === 'hl2' ? 'half-life-2' : 'portal'}`, { waitUntil: 'domcontentloaded' });
  await p.page.waitForSelector('button', { timeout: 120_000 });
  await p.page.waitForTimeout(2000);
  for (const o of ['portrait', 'landscape'] as const) {
    await p.rotate(o);
    await p.audit(`${game}-menu`, { root: 'body' });
  }
  if (!check(d, `${game}: New game starts by touch`, await startByTap(p, /New game|Start|Play/))) return;
  if (!check(d, `${game}: the level loads`, await waitRunning(p))) {
    await p.shot(`${game}-load-failed`);
    return;
  }
  await p.page.waitForTimeout(3000);
  await p.audit(`${game}-game`, { root: '.tf2g-touch', hud: true });
  await p.rotate('portrait');
  if (await p.page.evaluate(() => !!document.getElementById('tf2g-rotate-title'))) {
    await p.audit(`${game}-rotate-prompt`, { root: '.tf2g-play-screen' });
    await p.tap('button', /Play in portrait anyway/);
  }
  await p.audit(`${game}-game`, { root: '.tf2g-touch', hud: true });
  await p.rotate('landscape');
  // A level can open with the player held by a scripted camera (Portal's wake-up, HL2's arrival): wait it out.
  const free = await waitFor(p, 'the intro camera to hand over control', async () => (await p.game<number | null>(G('return g.debug().viewControl;'))) === null, 60_000);
  const sl = await stickAndLook(p);
  // Facing a wall (Portal's relaxation vault is small) the push forward goes nowhere: try the other directions.
  let moved = sl.moved;
  for (const dir of [{ x: 0, y: 60 }, { x: -60, y: 0 }, { x: 60, y: 0 }]) {
    if (moved > 10) break;
    moved = Math.max(moved, await stickOnly(p, dir));
  }
  // Still nowhere: is the player stuck for the keyboard too? Then it is the level, not the touch controls.
  let keyMoved = Infinity;
  if (free && moved <= 10) {
    const o0 = (await debug(p))?.origin;
    await p.game(G("g.input.held.key.add('forward'); return true;"));
    await p.page.waitForTimeout(1500);
    await p.game(G("g.input.held.key.delete('forward'); return true;"));
    const o1 = (await debug(p))?.origin;
    keyMoved = o0 && o1 ? Math.hypot(o1.x - o0.x, o1.y - o0.y) : 0;
    if (keyMoved <= 10) notes.push(`${d} ${game}: the player does not move at the start of the level with the keyboard either (a game issue, not the touch controls)`);
  }
  if (free)
    check(
      d,
      `${game}: stick + look at once (two fingers)`,
      sl.turned > 2 && (moved > 10 || (keyMoved <= 10 && sl.heldStick)),
      `moved ${moved.toFixed(0)}u, turned ${sl.turned.toFixed(1)}°${keyMoved <= 10 ? '; stuck for the keyboard too: stick checked at the input' : ''}`,
    );
  else {
    check(d, `${game}: the stick drives the input (the level's intro camera still holds the player)`, sl.heldStick);
    notes.push(`${d} ${game}: the opening camera (point_viewcontrol) still held the player after 60 s, so movement was checked at the input only`);
  }
  await recordImpulses(p);
  if (game === 'hl2') {
    const use = await holdButton(p, /^Use$/, 300, () => heldTouch(p));
    check(d, 'hl2: use button holds use', use.found && use.samples.some((x) => x.includes('use')));
    const sprint = await holdButton(p, /^Sprint$/, 300, () => heldTouch(p));
    check(d, 'hl2: sprint button holds speed', sprint.found && sprint.samples.some((x) => x.includes('speed')));
    const hl2 = () => p.game<{ hasSuit: boolean; flashlightOn: boolean } | null>(G('return g.store.getSnapshot().hl2 ?? null;'));
    const fl0 = await hl2();
    const fl = await p.tap('.tf2g-touch .tf2g-touch-btn', /^Flashlight$/);
    await p.page.waitForTimeout(500);
    const fl1 = await hl2();
    const sent = (await recordedImpulses(p)).includes('flashlight');
    check(
      d,
      'hl2: flashlight button toggles',
      fl && sent && (!fl0?.hasSuit || fl0.flashlightOn !== fl1?.flashlightOn),
      fl0?.hasSuit ? `${fl0.flashlightOn} → ${fl1?.flashlightOn}` : 'impulse sent (no suit yet: the flashlight needs the HEV suit)',
    );
  } else {
    const portals0 = await p.game<unknown[]>(G('return g.debug().portals ?? [];'));
    const blue = await holdButton(p, /^Fire blue portal$/, 200, () => heldTouch(p));
    await p.page.waitForTimeout(800);
    await stickAndLook(p, 600);
    const orange = await holdButton(p, /^Fire orange portal$/, 200, () => heldTouch(p));
    await p.page.waitForTimeout(1200);
    const portals1 = await p.game<unknown[]>(G('return g.debug().portals ?? [];'));
    const held = blue.samples.some((x) => x.includes('attack')) && orange.samples.some((x) => x.includes('attack2'));
    const opened = JSON.stringify(portals0) !== JSON.stringify(portals1);
    check(d, 'portal: blue / orange portal buttons fire', held, opened ? `portals ${JSON.stringify(portals1).slice(0, 120)}` : 'held attack / attack2 (no portal opened: the first chamber has no portal gun yet)');
  }
  // Captions: readable size where shown.
  const captions = await p.page.evaluate(() =>
    [...document.querySelectorAll('.tf2g-captions, [class*="caption"]')]
      .filter((e) => e.textContent?.trim())
      .map((e) => parseFloat(getComputedStyle(e).fontSize)),
  );
  if (captions.length) check(d, `${game}: captions ≥ 12px`, captions.every((s) => s >= 12), `${captions.join(', ')} px`);
  else notes.push(`${d} ${game}: no caption was on screen during the check`);
  await perf(p, game);
  check(d, `${game}: menu button opens the pause menu`, await openPause(p));
  for (const o of ['landscape', 'portrait'] as const) {
    await p.rotate(o);
    await p.audit(`${game}-pause`);
  }
  await p.rotate('landscape');
  if (await pauseView(p, /^Options$/)) await p.audit(`${game}-pause-options`);
  await openPause(p);
  await p.tap('[role=dialog] button', /^Back$/);
  await p.tap('[role=dialog] button', /^Quit game$/);
  await p.page.waitForTimeout(1500);
}

/* ───────────────────────────── main ───────────────────────────── */

const RETRIES = 3;

/** MemAvailable in MB (Linux), or Infinity where /proc is not there. */
function availableMb(): number {
  try {
    const m = /MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo', 'utf8'));
    return m ? Number(m[1]) / 1024 : Infinity;
  } catch {
    return Infinity;
  }
}

/** Waits (up to 10 min) for room for a SwiftShader renderer on a shared machine. */
async function waitForMemory(mb = Number(arg('min-memory-mb', '3500'))): Promise<void> {
  const t0 = Date.now();
  while (availableMb() < mb && Date.now() - t0 < 600_000) await new Promise((r) => setTimeout(r, 5000));
}

/** Waits (up to 5 min) for the dev server to answer. */
async function waitForServer(): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < 300_000) {
    try {
      if ((await fetch(`${BASE}/tf2/play`, { signal: AbortSignal.timeout(120_000) })).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

/** One game on one device in a fresh context; true when the page crashed. */
async function runOne(browser: Browser, device: Device, game: 'tf2' | 'hl2' | 'portal', catalog: Buffer | null): Promise<boolean> {
  const ctx = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.dpr,
    isMobile: true,
    hasTouch: true,
    userAgent: device.ua,
  });
  // tsx (esbuild keepNames) wraps the functions passed to page.evaluate in `__name(…)`.
  await ctx.addInitScript('globalThis.__name = (f) => f;');
  if (catalog)
    await ctx.route('**/api/tf2-loadout/catalog*', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: catalog }));
  const page = await ctx.newPage();
  const errors: string[] = [];
  let crashed = false;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('crash', () => (crashed = true));
  const cdp = await ctx.newCDPSession(page);
  const p = new Phone(device, ctx, page, cdp);
  try {
    await p.rotate('portrait');
    if (game === 'tf2') await tf2(p);
    else await sp(p, game);
  } catch (e) {
    const msg = e instanceof Error ? e.message.split('\n')[0] : String(e);
    // A crashed renderer, or a dev server that went away or stalled mid-run, is retried.
    crashed ||= /crash|net::ERR_|page.goto: Timeout|waitForSelector: Timeout/i.test(msg);
    check(device.id, `${game}: run`, false, msg);
    await p.shot(`${game}-failure`).catch(() => {});
  }
  if (errors.length) notes.push(`${device.id} ${game}: page errors: ${[...new Set(errors)].slice(0, 5).join(' | ')}`);
  await ctx.close().catch(() => {});
  return crashed;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: findChromium(),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const catalog = CATALOG ? readFileSync(CATALOG) : null;
  if (!catalog) notes.push('No --catalog: the Loadout view was checked without an item catalog.');
  else notes.push('The item catalog (/api/tf2-loadout/catalog) was served from --catalog by route interception (no Postgres).');
  for (const device of DEVICES) {
    if (ONLY_DEVICES && !ONLY_DEVICES.includes(device.id)) continue;
    log(`\n${device.id} (${device.width}×${device.height} @${device.dpr}x)`);
    for (const game of ['tf2', 'hl2', 'portal'] as const) {
      if (!GAMES.has(game)) continue;
      // A renderer killed for memory (SwiftShader holds a lot; a busy machine) is not a finding: retry.
      for (let attempt = 1; attempt <= RETRIES; attempt++) {
        const mark = { results: results.length, checks: checks.length, notes: notes.length };
        await waitForMemory();
        await waitForServer();
        const crashed = await runOne(browser, device, game, catalog);
        if (!crashed || attempt === RETRIES) break;
        log(`  (${device.id} ${game}: the page crashed — attempt ${attempt + 1} of ${RETRIES})`);
        results.length = mark.results;
        checks.length = mark.checks;
        notes.length = mark.notes;
      }
    }
  }
  await browser.close();

  const failedViews = results.filter((r) => !r.ok);
  const failedChecks = checks.filter((c) => !c.ok);
  const matrix: Record<string, Record<string, string>> = {};
  for (const r of results) {
    const col = `${r.device}/${r.orient === 'portrait' ? 'P' : 'L'}`;
    (matrix[r.view] ??= {})[col] = matrix[r.view]?.[col] === 'FAIL' || !r.ok ? 'FAIL' : 'pass';
  }
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ matrix, checks, results, notes }, null, 2));
  log(`\n${results.length} views audited, ${failedViews.length} failed; ${checks.length} checks, ${failedChecks.length} failed.`);
  for (const n of notes) log(`note: ${n}`);
  log(`report → ${path.join(OUT, 'report.json')}`);
  process.exit(failedViews.length || failedChecks.length ? 1 : 0);
}

void main();
