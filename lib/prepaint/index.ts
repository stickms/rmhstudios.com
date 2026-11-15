/**
 * The pre-paint stack: everything that must be on <html> before the first frame,
 * as ordinary TypeScript, in one place.
 *
 * `scripts/build-prepaint.ts` bundles `./entry.ts` (which calls {@link prepaint})
 * into the single minified IIFE in `./generated.ts`; `app/routes/__root.tsx`
 * emits that string once, preceded by the `rmh-prepaint` JSON config block
 * (`./config.ts`). It replaces nine hand-written ES5 template strings, one of
 * which re-implemented `isAppThemeRoute` and had to be kept in sync by hand.
 *
 * Rules for a step (docs/fouc.md):
 *  - it is `(ctx) => void`, reads storage through the `localStorage` global and
 *    writes only to `<html>`;
 *  - it must not throw past its own boundary — {@link prepaint} wraps every step
 *    in its own try/catch so one failing step (storage blocked, a corrupt JSON
 *    value, a missing config table) never stops the others or blocks paint;
 *  - ORDER MATTERS. The account seed writes localStorage that the theme step
 *    reads; platform runs first because the theme step reads `ios-webkit`;
 *  - keep it small: it is render-blocking inline JS on every document.
 */
import { accessStep } from './access';
import { accountSeedStep } from './account-seed';
import { cookieConsentStep } from './cookie-consent';
import { delightStep } from './delight';
import { localeStep } from './locale';
import { mediaRevealStep } from './media-reveal';
import { platformStep } from './platform';
import { themeStep } from './theme';
import type { PrepaintCtx } from './types';

export type PrepaintStep = (ctx: PrepaintCtx) => void;

/** The steps in run order. `discord: false` marks the ones the Discord Activity head never ran. */
export const PREPAINT_STEPS: ReadonlyArray<{ name: string; run: PrepaintStep; discord: boolean }> =
  [
    { name: 'platform', run: platformStep, discord: true },
    // Must precede every <img>.
    { name: 'media-reveal', run: mediaRevealStep, discord: false },
    { name: 'account-seed', run: accountSeedStep, discord: true },
    { name: 'theme', run: themeStep, discord: true },
    { name: 'access', run: accessStep, discord: true },
    { name: 'delight', run: delightStep, discord: true },
    { name: 'locale', run: localeStep, discord: true },
    { name: 'cookie-consent', run: cookieConsentStep, discord: false },
  ];

export function prepaint(ctx: PrepaintCtx): void {
  for (const step of PREPAINT_STEPS) {
    if (ctx.cfg.discord && !step.discord) continue;
    try {
      step.run(ctx);
    } catch {
      /* a failing step must never block paint */
    }
  }
}
