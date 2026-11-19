import { NATIVE_MATERIAL_BASES } from '../native-material-routes';
import { isAppRoute, pathUnder } from './route';
import type { PrepaintCtx, PrepaintTheme } from './types';

const has = (o: object, k: unknown): boolean =>
  Object.prototype.hasOwnProperty.call(o, k as string);

/**
 * The pre-paint theme step: applies the persisted theme class and any bought theme to
 * <html> before React hydrates, preventing a flash-of-unstyled-content (FOUC).
 * The theme→background map and the route tables come from the `rmh-prepaint` config
 * block (lib/prepaint/config.ts), serialized from stores/themeStore.ts and
 * lib/prepaint/theme-routes.ts, so this never drifts from the runtime that
 * mirrors it. The route predicate is the runtime's own (lib/prepaint/route.ts).
 *
 * ## Why `theme-color` is not set on iOS
 *
 * `<meta name="theme-color">` is how a page tells the browser what colour to
 * paint its own chrome, and iOS Safari takes it literally: the strip behind and
 * around the floating bottom tab bar (and the one behind the status bar) is
 * filled with that FLAT colour. The site's chrome is not flat — the page paints
 * an aurora canvas edge to edge under `viewport-fit=cover`, and `globals.css`
 * goes out of its way to mirror that canvas onto the root element on mobile iOS
 * precisely so those strips carry it. A `theme-color` covers all of that with
 * one solid `--site-bg`, which is the coloured band that shows up under the tab
 * bar and does not match the page above it.
 *
 * So on iOS the tag is simply not written, and Safari is left to tint its bars
 * from the page itself. Everywhere else it still is: an Android address bar
 * that matches the theme is exactly what the tag is for.
 *
 * A route may still set its own `theme-color` through `head()` (covid does, and
 * that page IS a flat colour, so a matching bar is right there; rmh-capital and
 * rmh-pmc follow the site's editions now and write none).
 * Ours carries `data-rmh-theme` so the two are never confused —
 * the runtime mirror in `Providers.tsx` only ever touches the marked one.
 *
 * ## `data-app-dark`
 *
 * For a page in `APP_ROUTE_THEME_BG` the script already parses that page's own
 * persisted light/dark preference to pick the pre-paint background. It publishes
 * the answer on <html> as `data-app-dark="1"|"0"` as well, because painting the
 * root the right colour is only half the problem: the page's own token block is
 * selected by a class the SERVER has to guess at (the store default) and only
 * gets right after hydration. The attribute is the one piece of that state that
 * exists before first paint, so the page's stylesheet keys its tokens off it and
 * both halves agree from frame 0 — see `pf2ecal.css`. Each
 * scopes it to its own descendants, so neither can touch the site theme.
 *
 * The entry's shape is documented where it lives (`APP_ROUTE_THEME_BG` in
 * `stores/themeStore.ts`); the three options this script has to honour are
 * `system` (start from `prefers-color-scheme` rather than from a fixed default,
 * for a page that follows the OS and persists nothing), `defaultDark` (what to
 * assume when nothing is stored — true unless the page opens light, as Temple of
 * Joy does) and `darkWhen` (for a page that stores a NAMED theme instead of a
 * boolean). `appRouteGround` in `stores/themeStore.ts` is the same resolution in
 * TypeScript, for the runtime after hydration — change the two together.
 *
 * ## `app-route`
 *
 * The same `app` boolean that picks the ground also stamps `html.app-route`,
 * because that class is not decoration either — `app/globals.css` keys three
 * things off it that are visible from the first frame:
 *
 *  - `--site-surface` and friends resolve to their OPAQUE twins (the aurora is
 *    gated off on these routes, so a translucent surface has no shared scene to
 *    sample and just greys out — the block's own comment says light-theme apps
 *    composited to ≈#8a8a8a and "lost all their contrast").
 *  - `scrollbar-gutter: stable` is withheld, because an app route does not scroll
 *    the document.
 *  - the `.site-aurora` layers paint nothing.
 *
 * It used to be applied ONLY by the `useEffect` in `components/Providers.tsx`,
 * i.e. after hydration, so every game and full-screen app loaded with the site's
 * translucent surfaces, a reserved scrollbar gutter and a live aurora, and then
 * snapped out of all three at once — a full-width horizontal jog plus a contrast
 * pop, measured at ~1.9s after first contentful paint on `/hearthworks` by
 * `testing/e2e/fouc.mjs`. The effect STAYS: it is the client-navigation path (a
 * soft nav from a site page into a game never re-runs this script) and the
 * recovery path if this one throws. What changed is that it is now a no-op on a hard load, which is
 * where the flash was.
 */
export function themeStep({ html, doc, win, path, cfg }: PrepaintCtx): void {
  const t = cfg.theme as PrepaintTheme;
  const m = t.bg;
  const B = t.appBg;
  const RB = t.routeBg;
  const D = t.defaultStyle;
  const ls = localStorage;
  let s = ls.getItem('rmh-style');
  if (!s || !has(m, s)) {
    // Nothing chosen (or a retired id, which is dropped): follow the device, Day when it says nothing. Nothing is
    // written, so the next load asks the device again (DEFAULT_STYLE in stores/themeStore.ts).
    if (s) ls.removeItem('rmh-style');
    s = !!win.matchMedia && win.matchMedia('(prefers-color-scheme: dark)').matches && has(m, 'graphite') ? 'graphite' : D;
  }
  // The route predicate is the runtime's own (lib/prepaint/route.ts).
  const app = !cfg.nf && isAppRoute(path, t.excluded, t.exceptions);
  if (s !== 'default' && !app) html.classList.add('style-' + s);
  if (app) html.classList.add('app-route');
  for (let nk = 0; nk < NATIVE_MATERIAL_BASES.length; nk++) {
    if (pathUnder(path, NATIVE_MATERIAL_BASES[nk])) {
      html.classList.add('native-material');
      break;
    }
  }
  ls.removeItem('rmh-glass-level');
  ls.removeItem('rmh-reduce-transparency');
  let bg: string = app ? B : m[s];
  if (app) {
    for (const rk in RB) {
      if (pathUnder(path, rk)) {
        const ro = RB[rk];
        let rd = ro.system
          ? !!win.matchMedia && win.matchMedia('(prefers-color-scheme: dark)').matches
          : ro.defaultDark !== false;
        try {
          const rj = JSON.parse(ls.getItem(ro.key) || 'null');
          const rs = rj && rj.state ? rj.state : rj;
          const rf = rs ? rs[ro.darkFlag] : undefined;
          if (ro.darkWhen !== undefined) {
            if (typeof rf === 'string') rd = rf === ro.darkWhen;
          } else if (typeof rf === 'boolean') rd = rf;
        } catch {
          /* an unreadable stored preference keeps the default */
        }
        bg = rd ? ro.dark : ro.light;
        html.setAttribute('data-app-dark', rd ? '1' : '0');
        break;
      }
    }
  }
  const UT = ls.getItem('rmh-user-theme');
  let utOn = false;
  if (UT && !app) {
    try {
      const utj = JSON.parse(UT);
      if (utj && utj.vars) {
        const uts = html.style;
        for (const uk in utj.vars) uts.setProperty(uk, utj.vars[uk]);
        if (typeof utj.bg === 'string') {
          bg = utj.bg;
          utOn = true;
        }
      }
    } catch {
      /* a corrupt user theme is ignored */
    }
  }
  (win as unknown as { __themeBg?: string }).__themeBg = bg;
  html.style.backgroundColor = bg;
  let hx = ('' + bg).replace(/^#/, '');
  if (hx.length === 3) {
    hx = hx.charAt(0) + hx.charAt(0) + hx.charAt(1) + hx.charAt(1) + hx.charAt(2) + hx.charAt(2);
  }
  if (/^[0-9a-fA-F]{6}$/.test(hx)) {
    const cv = (x: number) => {
      x /= 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    const lm =
      0.2126 * cv(parseInt(hx.substr(0, 2), 16)) +
      0.7152 * cv(parseInt(hx.substr(2, 2), 16)) +
      0.0722 * cv(parseInt(hx.substr(4, 2), 16));
    html.style.colorScheme = lm < 0.5 ? 'dark' : 'light';
    // A bought theme picks its edition from its own ground (`editionForBackground` in stores/themeStore.ts, the
    // same 0.5 threshold), so the class the globe and the islands read matches what is painted.
    if (utOn) {
      html.classList.remove('style-graphite');
      if (lm < 0.5) html.classList.add('style-graphite');
    }
  }
  if (!html.classList.contains('ios-webkit')) {
    let tc = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"][data-rmh-theme]');
    if (tc) tc.content = bg;
    else {
      tc = doc.createElement('meta');
      tc.name = 'theme-color';
      tc.content = bg;
      tc.setAttribute('data-rmh-theme', '');
      doc.head.appendChild(tc);
    }
  }
  // The retired accent presets and custom accent (owner, 2026-11-18) are dropped, not applied.
  ls.removeItem('rmh-accent');
  ls.removeItem('rmh-custom-accent');
  const fs = ls.getItem('rmh-font-scale');
  if (fs && /^(875|1125|1250)$/.test(fs)) html.style.fontSize = parseInt(fs, 10) / 10 + '%';
  // Density is retired (settings audit, 2026-11-19); drop a stored value, never apply it.
  ls.removeItem('rmh-density');
  if (ls.getItem('rmh-readable-font') === '1') html.classList.add('readable-font');
  ls.removeItem('rmh-reduce-motion');
  const cvm = ls.getItem('rmh-color-vision');
  if (cvm === 'deuteranopia' || cvm === 'protanopia' || cvm === 'tritanopia')
    html.setAttribute('data-color-vision', cvm);
  const jm = ls.getItem('rmh-jelly-motion');
  if (jm === 'still') html.setAttribute('data-jelly-motion', jm);
}
