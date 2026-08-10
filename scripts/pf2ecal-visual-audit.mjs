/**
 * Visual audit for `/pf2ecal` across a resolution matrix.
 *
 * Screenshots are the deliverable, but the *checks* are the point: a person
 * looking at 22 screenshots will not reliably notice a 3px horizontal overflow
 * or a 38px tap target, and those are exactly the defects that only show up on
 * one device. So each viewport is measured as well as photographed:
 *
 *   1. **Document overflow** — `scrollWidth > clientWidth` means the page
 *      scrolls sideways. Always a bug here; nothing on this page is meant to.
 *   2. **Element overflow** — any element whose box extends past the viewport's
 *      right edge, which is what actually causes (1) and names the culprit.
 *   3. **Overlap** — pairs of visible text-bearing elements whose boxes
 *      intersect. Catches a sticky header eating content, an absolutely
 *      positioned control landing on a label, a grid cell colliding with its
 *      neighbour.
 *   4. **Unreachable sticky content** — a `position: sticky` element taller
 *      than the window it is pinned within, with no scroller of its own. Its
 *      bottom is unreachable until the page ends; nothing else here sees it,
 *      because it overflows nothing.
 *   5. **Premature truncation** — an ellipsis on text that would have fitted if
 *      the element were sized correctly. Looks identical to a legitimate
 *      ellipsis in a screenshot.
 *   6. **Touch targets** — interactive elements under 44×44 CSS px, the iOS
 *      minimum. The one rule a hand-rolled control set most often breaks.
 *   7. **Console/page errors**, including React hydration mismatches.
 *
 * Usage: node scripts/pf2ecal-visual-audit.mjs [baseUrl] [outDir]
 * Exits non-zero if any hard check fails, so it can gate a change.
 */

/* eslint-disable no-console -- this is a CLI reporter; stdout is its entire
   output, and the repo's other scripts carry the same warning. */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = process.argv[2] ?? 'http://127.0.0.1:7005';
const OUT = process.argv[3] ?? '.cache/pf2ecal-audit';
const URL_PATH = '/pf2ecal';

/**
 * The matrix. Real device sizes rather than round numbers, plus the two
 * extremes that break naive layouts: a 320px phone (iPhone SE 1st gen, still
 * the narrowest thing in circulation) and an ultrawide desktop.
 */
const VIEWPORTS = [
  { name: 'iphone-se-320', width: 320, height: 568 },
  { name: 'iphone-se-375', width: 375, height: 667 },
  { name: 'iphone-13', width: 390, height: 844 },
  { name: 'iphone-15-pro-max', width: 430, height: 932 },
  { name: 'pixel-7', width: 412, height: 915 },
  { name: 'phone-landscape', width: 844, height: 390 },
  { name: 'ipad-mini', width: 744, height: 1133 },
  { name: 'ipad-pro-11', width: 834, height: 1194 },
  { name: 'ipad-pro-landscape', width: 1194, height: 834 },
  { name: 'laptop-1280', width: 1280, height: 800 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
  { name: 'ultrawide-2560', width: 2560, height: 1080 },
];

const SCHEMES = ['light', 'dark'];

/**
 * Signed-out misses most of the UI — the availability pills, the add button and
 * every sheet only exist for an editor. The audit signs up a throwaway account
 * and runs the whole matrix again, then opens each sheet at a phone and a
 * desktop width, because a modal is where overflow actually bites.
 */
const SHEET_STATES = [
  {
    name: 'sheet-add',
    open: async (page) => {
      await page
        .getByRole('button', { name: /add a session/i })
        .first()
        .click();
    },
  },
  {
    name: 'sheet-settings',
    open: async (page) => {
      await page
        .getByRole('button', { name: /^settings$/i })
        .first()
        .click();
    },
  },
  {
    name: 'sheet-session',
    open: async (page) => {
      await page.locator('.pf2e-titlebtn').first().click();
    },
  },
  {
    name: 'assistant',
    open: async (page) => {
      await page.locator('.pf2e-fab').click();
    },
  },
];

/**
 * The appearance control, driven AGAINST the OS preference in both directions.
 *
 * The point is the combination the media query alone cannot produce: a browser
 * reporting `prefers-color-scheme: dark` on a page the visitor has explicitly
 * set to Light, and the reverse. Both halves of the theme — the `.pf2e` tokens
 * and the document ground — have to follow the choice rather than the OS, and
 * the `ground-mismatch` check above is what proves they moved together.
 */
const THEME_STATES = [
  { name: 'theme-forced-light', scheme: 'dark', pick: 'Light' },
  { name: 'theme-forced-dark', scheme: 'light', pick: 'Dark' },
].map((state) => ({
  ...state,
  open: async (page) => {
    await page
      .locator('.pf2e-theme-toggle [role="radio"]')
      .filter({ hasText: new RegExp(`^${state.pick}$`) })
      .click();
    // Assert the click LANDED. A no-op click leaves the page on its OS
    // preference, where every other check still passes — which is exactly how
    // this state managed to be green while testing nothing.
    await page.waitForFunction(
      (pick) =>
        document.querySelector('.pf2e-theme-toggle [role="radio"][aria-checked="true"]')
          ?.textContent === pick,
      state.pick,
      { timeout: 5000 },
    );
  },
}));

const SHEET_VIEWPORTS = [
  { name: 'iphone-se-320', width: 320, height: 568 },
  { name: 'iphone-13', width: 390, height: 844 },
  { name: 'ipad-mini', width: 744, height: 1133 },
  { name: 'desktop-1440', width: 1440, height: 900 },
];

/**
 * Wait until nothing is still moving.
 *
 * A fixed `waitForTimeout` after opening a sheet is a guess, and it was the
 * wrong one: the panel arrives on a spring, and measuring it two frames early
 * reports a 44px control as 43.99 and fails the touch-target check on a design
 * that is correct. Retuning the spring should not be able to break the audit, so
 * the audit stops guessing — it watches the moving element until its box is the
 * same on two consecutive frames.
 */
async function settle(page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('.pf2e-sheet, .pf2e-assistant');
      if (!el) return true;
      const r = el.getBoundingClientRect();
      const key = `${r.top.toFixed(1)}:${r.left.toFixed(1)}:${r.width.toFixed(1)}:${r.height.toFixed(1)}`;
      const previous = window.__pf2eSettleKey;
      window.__pf2eSettleKey = key;
      return previous === key;
    },
    null,
    { timeout: 8000, polling: 'raf' },
  );
  // One more frame so anything keyed off the same spring (a scrim's opacity, a
  // cross-fading body) has committed too.
  await page.waitForTimeout(120);
}

/** Sign up a throwaway account and return its cookies. */
async function signIn(browser, base) {
  const context = await browser.newContext();
  const response = await context.request.post(`${base}/api/auth/sign-up/email`, {
    data: {
      email: `audit-${Date.now()}@example.test`,
      password: 'Sup3rSecret!pass',
      name: 'Audit Player',
    },
  });
  if (!response.ok()) {
    console.warn('audit: could not sign in, editor UI will not be measured');
    await context.close();
    return null;
  }
  const cookies = await context.cookies();
  await context.close();
  return cookies;
}

/** Runs in the page. Returns every measured problem for this viewport. */
const AUDIT = () => {
  const problems = [];
  const vw = document.documentElement.clientWidth;

  if (document.documentElement.scrollWidth > vw + 1) {
    problems.push({
      kind: 'document-overflow',
      detail: `scrollWidth ${document.documentElement.scrollWidth} > clientWidth ${vw}`,
    });
  }

  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls =
      typeof el.className === 'string' && el.className
        ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
        : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };

  // Measure ONCE, up front. `getBoundingClientRect()` forces a layout flush,
  // and the overlap pass below is O(n^2) — calling it inside that loop meant
  // ~125k flushes per page and a run that never finished.
  const all = Array.from(document.querySelectorAll('.pf2e *'));
  const measured = [];
  for (const el of all) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0')
      continue;
    measured.push({ el, rect, style });
  }

  // 2. Elements pushing past the right edge.
  for (const { el, rect } of measured) {
    if (rect.right > vw + 1) {
      // An element inside its own horizontal scroller is allowed to be wider.
      let scrollableAncestor = false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'auto' || o === 'scroll') {
          scrollableAncestor = true;
          break;
        }
      }
      if (!scrollableAncestor) {
        problems.push({
          kind: 'element-overflow',
          detail: `${describe(el)} right=${Math.round(rect.right)} > ${vw}`,
        });
      }
    }
  }

  // 2b. Elements wider than their own PARENT.
  //
  // Checking only against the viewport misses the most common responsive bug
  // there is: a grid or flex item defaults to `min-width: auto` — min-CONTENT
  // width, not zero — so one unbreakable string makes the column wider than
  // its container and the contents clip inside a card that still fits the
  // screen. The viewport check cannot see it because nothing crosses the
  // screen edge. This found exactly that on the 320px layout.
  for (const { el, rect } of measured) {
    const parent = el.parentElement;
    if (!parent) continue;
    const pr = parent.getBoundingClientRect();
    if (pr.width < 1) continue;
    const po = getComputedStyle(parent).overflowX;
    // A parent that scrolls or clips is entitled to hold something wider.
    if (po === 'auto' || po === 'scroll' || po === 'hidden') continue;
    if (rect.right > pr.right + 1 || rect.left < pr.left - 1) {
      problems.push({
        kind: 'parent-overflow',
        detail:
          `${describe(el)} [${Math.round(rect.left)}..${Math.round(rect.right)}]` +
          ` escapes ${describe(parent)} [${Math.round(pr.left)}..${Math.round(pr.right)}]`,
      });
    }
  }

  // 2c. Sticky content that cannot be reached.
  //
  // `position: sticky` pins an element's TOP. Once the element is taller than
  // the window it is pinned within, its bottom sits below the fold forever —
  // you can only see the end of it by scrolling the whole document past the end
  // of the sticky CONTAINER. A sidebar that "won't scroll until you reach the
  // bottom of the page" is exactly this, and nothing else in the audit sees it,
  // because the element is not overflowing anything.
  for (const { el, rect, style } of measured) {
    if (style.position !== 'sticky') continue;
    const overflows = style.overflowY === 'auto' || style.overflowY === 'scroll';
    if (overflows) continue; // it can scroll itself; the content is reachable
    const top = parseFloat(style.top);
    const available = window.innerHeight - (Number.isFinite(top) ? top : 0);
    if (rect.height > available + 1) {
      problems.push({
        kind: 'unreachable-sticky',
        detail:
          `${describe(el)} is ${Math.round(rect.height)}px tall in a ` +
          `${Math.round(available)}px sticky window and does not scroll itself`,
      });
    }
  }

  // 2d. Text truncated with room to spare.
  //
  // An ellipsis is correct when the content genuinely does not fit and a defect
  // when it does — "August 2…" in a rail with 60px of slack is the latter, and
  // it looks identical to the former in a screenshot. Reported when the
  // element's own box could not hold the text AND its parent had spare width,
  // which is the signature of a sizing bug rather than a real overflow.
  for (const { el, rect, style } of measured) {
    if (style.textOverflow !== 'ellipsis') continue;
    if (el.scrollWidth <= Math.ceil(rect.width) + 1) continue; // not truncating
    const parent = el.parentElement;
    if (!parent) continue;
    const slack = parent.getBoundingClientRect().width - parent.scrollWidth;
    if (slack > 8) {
      problems.push({
        kind: 'premature-truncation',
        detail:
          `${describe(el)} "${(el.textContent ?? '').trim().slice(0, 24)}" clipped at ` +
          `${Math.round(rect.width)}px (needs ${el.scrollWidth}px) with ` +
          `${Math.round(slack)}px spare in ${describe(parent)}`,
      });
    }
  }

  // 3. Overlap between leaf elements that actually paint text.
  //
  // Anything inside a fixed/absolute ANCESTOR is excluded, not just anything
  // positioned itself. A sheet is `position: fixed` and its contents are
  // static within it, so every label in an open dialog "overlaps" whatever it
  // is covering — which is the dialog working, not a defect. The first version
  // of this check only skipped the positioned element itself and reported 398
  // of those.
  const inOverlay = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const pos = getComputedStyle(p).position;
      if (pos === 'fixed' || pos === 'absolute' || pos === 'sticky') return true;
    }
    return false;
  };

  const leaves = measured.filter(({ el, style }) => {
    if (el.children.length > 0) return false;
    if (!(el.textContent ?? '').trim()) return false;
    if (style.position !== 'static' && style.position !== 'relative') return false;
    return !inOverlay(el);
  });

  // Sorted by top edge so the inner loop can stop as soon as a candidate
  // starts below the current element's bottom — O(n log n) in practice
  // instead of a full n^2 sweep.
  leaves.sort((a, b) => a.rect.top - b.rect.top);

  for (let i = 0; i < leaves.length; i++) {
    const a = leaves[i];
    for (let j = i + 1; j < leaves.length; j++) {
      const b = leaves[j];
      if (b.rect.top >= a.rect.bottom - 2) break;
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const horizontal = a.rect.left < b.rect.right - 2 && b.rect.left < a.rect.right - 2;
      if (horizontal) {
        problems.push({
          kind: 'overlap',
          detail:
            `${describe(a.el)} "${(a.el.textContent ?? '').trim().slice(0, 20)}"` +
            ` ∩ ${describe(b.el)} "${(b.el.textContent ?? '').trim().slice(0, 20)}"`,
        });
      }
    }
  }

  // 4. Touch targets, measured as the EFFECTIVE hit area.
  //
  // A control may paint smaller than 44px and expand its target with a
  // transparent `::after` (see `.pf2e-hit` / `.pf2e-btn-sm` in pf2ecal.css).
  // Measuring only `getBoundingClientRect()` would report those as failures
  // and push someone to fatten the visual design to satisfy the check, which
  // is the wrong fix. So the pseudo-element's box counts.
  const controls = measured.filter(({ el }) =>
    el.matches('button, a[href], input, select, textarea, [role="switch"], [role="radio"]'),
  );
  for (const { el, rect } of controls) {
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;

    let hitW = rect.width;
    let hitH = rect.height;
    // BOTH pseudo-elements. `.pf2e-switch` already uses `::after` for its
    // sliding knob, so its expander has to be a `::before` — checking only
    // `::after` reported the switch as a 51×31 failure it was not.
    for (const pseudo of ['::before', '::after']) {
      const box = getComputedStyle(el, pseudo);
      if (!box || box.content === 'none' || box.position !== 'absolute') continue;
      const h = parseFloat(box.height);
      const w = parseFloat(box.width);
      if (Number.isFinite(h)) hitH = Math.max(hitH, h);
      if (Number.isFinite(w)) hitW = Math.max(hitW, w);
    }

    // Documented exception: a 7-column month grid cannot give every day a
    // 44px-wide cell on a 320px screen — seven columns need 308px before any
    // padding at all. iOS Calendar has the same constraint. The cell is held
    // to 44px of HEIGHT and to whatever width the screen allows, with a floor
    // that still comfortably clears a fingertip.
    const isDenseGridCell = el.classList.contains('pf2e-daycell');
    const minW = isDenseGridCell ? 32 : 44;

    if (hitW < minW || hitH < 44) {
      problems.push({
        kind: 'small-target',
        detail: `${describe(el)} ${Math.round(hitW)}×${Math.round(hitH)}`,
      });
    }
  }

  // 5. The document ground versus the page's own.
  //
  // This is the check for the bug that prompted it: `.pf2e` painted itself
  // black from `prefers-color-scheme` while the site theme painted <html> and
  // <body> Daylight white underneath. On a desktop it is invisible — the page
  // covers the viewport — and on a phone every rubber-band overscroll flashes a
  // white gutter above a black page. Nothing in a screenshot shows it, because
  // the overscroll region is not in one.
  const shell = document.querySelector('.pf2e');
  if (shell) {
    const pageBg = getComputedStyle(shell).backgroundColor;
    for (const [what, node] of [
      ['html', document.documentElement],
      ['body', document.body],
    ]) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg !== pageBg) {
        problems.push({
          kind: 'ground-mismatch',
          detail: `${what} is ${bg} under a .pf2e of ${pageBg}`,
        });
      }
    }
  }

  // 6. The stacked order on a phone.
  //
  // Below the `lg` breakpoint the rail leads the agenda, and inside it the
  // order is announcements → next session → month → subscribe. That is a
  // deliberate arrangement expressed entirely in `order-*` utilities, which is
  // exactly the kind of thing that silently inverts when someone moves a block
  // in the JSX.
  if (vw < 1024) {
    const rail = document.querySelector('.pf2e-rail');
    const agenda = document.querySelector('.pf2e-shell main');
    if (rail && agenda && rail.getBoundingClientRect().top >= agenda.getBoundingClientRect().top) {
      problems.push({ kind: 'mobile-order', detail: 'the agenda is above the rail on a phone' });
    }

    const expected = ['announcements', 'next', 'month', 'subscribe'];
    const tops = expected.map((name) => {
      const el = document.querySelector(`[data-rail="${name}"]`);
      return el ? el.getBoundingClientRect().top : null;
    });
    for (let i = 1; i < tops.length; i++) {
      if (tops[i] === null || tops[i - 1] === null) continue;
      if (tops[i] <= tops[i - 1]) {
        problems.push({
          kind: 'mobile-order',
          detail: `${expected[i]} (${Math.round(tops[i])}) is not below ${expected[i - 1]} (${Math.round(
            tops[i - 1],
          )})`,
        });
      }
    }
  }

  // 7. Culling still culls.
  //
  // The board's window is six months, so a weekly game materialises ~26
  // upcoming rows; `useProgressiveList` renders eight at a time. If that ever
  // regresses the page still LOOKS right — it just mounts every card, every
  // availability picker and every layout animation on load, which is invisible
  // in a screenshot and very visible on a phone. The ceiling is generous
  // (two pages plus slack) so a taller viewport legitimately revealing a second
  // page does not trip it.
  if (window.innerHeight <= 950) {
    const rendered = document.querySelectorAll('.pf2e-cull').length;
    if (rendered > 20) {
      problems.push({
        kind: 'not-culled',
        detail: `${rendered} session cards in the DOM at ${window.innerHeight}px tall`,
      });
    }
  }

  return problems;
};

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  });

  const report = [];
  let hardFailures = 0;

  /** Measure + shoot one page state. */
  async function check(context, label, prepare) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const text = m.text();
      // Two site-wide, environment-only noises that this page does not cause
      // and cannot fix, filtered so a real error is not lost in them:
      //  * Google Fonts is blocked by the sandbox's egress policy and is
      //    loaded from `__root.tsx` for every route.
      //  * The voice-calls client in `Providers.tsx` throws when its realtime
      //    URL is unset, which it is in any environment without the socket
      //    tier running. Signed-in only, hence 57 of them in the first run.
      if (text.includes('Failed to load resource')) return;
      if (text.includes('Realtime URL is not configured')) return;
      errors.push(text.slice(0, 200));
    });

    await page.goto(`${BASE}${URL_PATH}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.pf2e-shell');
    // `.pf2e-shell` is server-rendered, so waiting for it proves only that HTML
    // arrived. Every `prepare` below clicks something, and a click before
    // hydration lands on a button React has not claimed yet: nothing happens and
    // nothing complains. That is not hypothetical — it is what made the theme
    // states pass while doing nothing at all, and in a dev build hydration here
    // takes well over a second. The assistant launcher is the signal, because it
    // only renders after `useIdleReady` fires, which is client React running.
    await page.waitForSelector('.pf2e-fab', { timeout: 15_000 });
    await page.waitForTimeout(350);
    if (prepare) {
      // A prepare step that fails is a HARD failure, not a skip. It used to
      // print SKIP and pass, which meant a button that had stopped opening its
      // sheet looked identical to a state that was never measured.
      try {
        await prepare(page);
        await settle(page);
      } catch (cause) {
        const detail = String(cause).split('\n')[0].slice(0, 120);
        console.log(`${label.padEnd(40)} FAILED TO OPEN: ${detail}`);
        report.push({ label, problems: [{ kind: 'prepare-failed', detail }], errors: [] });
        hardFailures += 1;
        await page.close();
        return;
      }
    }

    const problems = await page.evaluate(AUDIT);
    await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: false });

    // Overlap is reported but not fatal: two inline siblings on one line can
    // legitimately share a row of pixels, and a false positive that blocks a
    // build is worse than one that prints.
    const hard = problems.filter((p) => p.kind !== 'overlap');
    hardFailures += hard.length + errors.length;
    report.push({ label, problems, errors });

    const summary =
      problems.length || errors.length
        ? `${hard.length} hard, ${problems.length - hard.length} overlap, ${errors.length} errors`
        : 'clean';
    console.log(`${label.padEnd(40)} ${summary}`);
    for (const p of hard.slice(0, 5)) console.log(`    ${p.kind}: ${p.detail}`);
    for (const e of errors.slice(0, 3)) console.log(`    error: ${e}`);
    await page.close();
  }

  const cookies = await signIn(browser, BASE);

  // Pass 1 — the full matrix, both schemes, signed out and signed in.
  for (const auth of cookies ? ['out', 'in'] : ['out']) {
    for (const scheme of SCHEMES) {
      for (const vp of VIEWPORTS) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          colorScheme: scheme,
          timezoneId: 'America/Denver',
          deviceScaleFactor: 1,
        });
        if (auth === 'in' && cookies) await context.addCookies(cookies);
        await check(context, `${auth}-${scheme}-${vp.name}`, null);
        await context.close();
      }
    }
  }

  // Pass 2 — every sheet, at the widths where a modal actually breaks.
  if (cookies) {
    for (const scheme of SCHEMES) {
      for (const vp of SHEET_VIEWPORTS) {
        for (const state of SHEET_STATES) {
          const context = await browser.newContext({
            viewport: { width: vp.width, height: vp.height },
            colorScheme: scheme,
            timezoneId: 'America/Denver',
            deviceScaleFactor: 1,
          });
          await context.addCookies(cookies);
          await check(context, `${state.name}-${scheme}-${vp.name}`, state.open);
          await context.close();
        }
      }
    }
  }

  // Pass 3 — the appearance control fighting the OS preference, at a phone and
  // a desktop width. Signed out, because the control needs no account.
  for (const state of THEME_STATES) {
    for (const vp of [SHEET_VIEWPORTS[1], SHEET_VIEWPORTS[3]]) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: state.scheme,
        timezoneId: 'America/Denver',
        deviceScaleFactor: 1,
      });
      await check(context, `${state.name}-${vp.name}`, state.open);
      await context.close();
    }
  }

  await writeFile(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  console.log(`\n${report.length} states measured. Screenshots + report → ${OUT}`);
  console.log(
    hardFailures === 0 ? 'PASS — no hard failures' : `FAIL — ${hardFailures} hard issues`,
  );
  await browser.close();
  process.exit(hardFailures === 0 ? 0 : 1);
}

await main();
