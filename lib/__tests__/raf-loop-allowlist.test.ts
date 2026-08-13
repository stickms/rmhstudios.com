import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * §17.3 — "animations always end": a `requestAnimationFrame` file allowlist so a
 * NEW unbounded rAF loop cannot land silently.
 *
 * Every rAF loop in the repo must have a provable settle/stop condition — the
 * §16.4 idle-at-rest pattern for the shared motion tier (samplers idle when
 * nothing animates), or an unmount `cancelAnimationFrame` for the self-contained
 * games/apps (their loops run only while the game is mounted/active). This test
 * enumerates every source that calls `requestAnimationFrame` and asserts the set
 * exactly matches {@link ALLOW}. When it fails:
 *   - a NEW file appears → prove it has a settle/stop condition (idle-at-rest for
 *     the design tier, unmount cancel for a game), THEN add it here. Never add a
 *     file that spins a rAF loop forever while the page is at rest.
 *   - a listed file no longer uses rAF → remove it from the list (keep it honest).
 *
 * The shared MOTION-TIER files below are the freeze-relevant ones; each is
 * verified idle-at-rest / one-shot:
 *   - components/ui/liquid-morph.tsx  — idle sampler, stops after SETTLE_FRAMES.
 *                                       NOT a shared motion-tier file, despite
 *                                       having been listed as one that "mounts on
 *                                       every page": its only consumer is the
 *                                       internal /liquid-glass demo route. The
 *                                       entry stays because the rAF is real and
 *                                       still needs sanctioning; the CLAIM is
 *                                       corrected, because an allowlist whose
 *                                       reasons are wrong is one nobody can audit.
 *                                       `liquid-tabs.tsx:243` — the component its
 *                                       docblock names first — uses a plain
 *                                       `layoutId` spring and no morph at all.
 *   - components/ui/liquid-tabs.tsx   — one-shot rAF to move focus after a tab key.
 *   - hooks/useLiquidBackground.ts    — rAF used as a per-event THROTTLE
 *                                       (one-shot). `useGlassLight.ts`,
 *                                       `useCardSheen.ts` and `useParallax.ts` were
 *                                       here too; all were cursor-tracking effects
 *                                       and all are deleted (§5.1.1). So was
 *                                       `lib/glass-lens.ts`, whose rAF belonged to
 *                                       a generator with no caller.
 *   - components/radial/RadialWheel.tsx — rAF used as a SCROLL THROTTLE (one
 *                                       frame per scroll burst); cancels on unmount.
 *   - components/radial/RadialHub.tsx, components/radial/QuickPanel.tsx —
 *                                       one-shot rAF to move focus after the
 *                                       menu/panel opens; cancelled in cleanup.
 *   - components/ui/anchored-menu.tsx — two one-shots, no loop: the same
 *                                       move-focus-after-open frame as QuickPanel,
 *                                       and a re-anchor THROTTLE that coalesces a
 *                                       scroll/resize burst into one frame (the
 *                                       handler no-ops while a frame is already
 *                                       pending and never schedules from inside
 *                                       its own callback). Both are cancelled in
 *                                       cleanup, and both effects only run while
 *                                       the menu is open — a page at rest has
 *                                       neither.
 *   - components/radial/LiquidGlobe.tsx — the navigation globe's spin/dwell loop.
 *                                       Bounded by MOUNT, like a game's: RadialHub
 *                                       renders it only while the hub is open, and
 *                                       the effect cancels the frame on unmount, so
 *                                       a page at rest (menu closed) has no loop at
 *                                       all. While it does run it writes only
 *                                       transform/opacity/custom properties, skips
 *                                       every write on a frame where nothing moved,
 *                                       and reads no layout.
 *   - components/temple-of-joy/TempleGlobes.tsx — the temple's globe field: the
 *                                       spin/ripple/wobble loop for one to eight
 *                                       liquid globes. Bounded by MOUNT, like the
 *                                       navigation globe's and like the game's own
 *                                       tick: the temple renders it only while the
 *                                       game is open and the effect cancels the
 *                                       frame on unmount, so a page at rest has no
 *                                       loop. While it runs it writes only
 *                                       transform/opacity/custom properties and
 *                                       strokes one canvas, and reads no layout.
 *   - app/routes/_site/library/index.tsx — one-shot rAF that starts the
 *                                       scroll-settle glide after a category
 *                                       switch; cancelled in cleanup and on the
 *                                       next switch.
 *   - components/laundry-sort/hud/HudReadout.tsx — writes score/clock/combo to its
 *                                       own text nodes instead of re-rendering the
 *                                       overlay 60× a second. Starts only while a
 *                                       round is running and cancels on unmount and
 *                                       whenever the round stops.
 *   - hooks/useDeviceAttitude.ts      — gyroscope lerp: a frame is scheduled only
 *                                       while the smoothed rotation is still short
 *                                       of the latest sensor reading, and the loop
 *                                       stops the frame it arrives; the effect
 *                                       cancels it when motion is switched off,
 *                                       when the sensor is absent, and on unmount.
 *   - hooks/useFluidPress.ts          — the site-wide press layer's spring loop.
 *                                       Idle-at-rest by construction: the loop is
 *                                       started by a pointerdown on a
 *                                       [data-fluid-press] element and returns 0
 *                                       from its own rAF call the frame the last
 *                                       press finishes springing, so a page at
 *                                       rest runs no loop. Cancelled on unmount.
 *   - hooks/useFluidDrag.ts           — one settle-spring loop per mounted drag
 *                                       surface. Runs only between a release and
 *                                       the spring arriving; stops itself on
 *                                       settle and cancels on unmount.
 *   - hooks/useSpatialParallax.ts     — pointer-event throttle; cancels on unmount.
 *   - hooks/useScrollRestoration.ts, hooks/useCelebration.ts,
 *     components/ui/AnimatedCount.tsx,
 *     components/ui/TwemojiProvider.tsx — one-shot / self-terminating.
 * Everything else is a self-contained game/app or media widget whose loop is
 * bounded by mount lifetime (unmount cancels the rAF).
 */

const ROOT = process.cwd();
const SCAN_DIRS = ['components', 'app', 'hooks', 'lib', 'stores'];

/** Files permitted to call requestAnimationFrame (see the doc block above). */
const ALLOW = new Set<string>([
  'app/routes/_site/library/index.tsx',
  'app/routes/_site/rmhladder/pipeline.tsx',
  'components/assistant/ConciergePanel.tsx',
  'components/breakpoint/GameView.tsx',
  // Bum's Rush runs exactly ONE loop for the whole game — engine step, render,
  // input polling and the host's network tick all ride it, which is why the
  // HUD can exist without a second rAF anywhere in `components/bums-rush/`.
  // It meets the game/app standard: the effect that starts it returns a
  // teardown whose first statement is `cancelAnimationFrame`, and which then
  // disposes the simulation, the renderer, the host, both input devices and
  // every listener. Leaving a level unmounts the hook, so there is no path
  // where the frame outlives the screen.
  'components/bums-rush/useLevelSession.ts',
  'components/cursed-logic/MinigameOverlay.tsx',
  'components/dream-rift/MenuBackdrop.tsx',
  // One-shot, not a loop: a single deferred frame that restores the caret after
  // a smart-paste rewrites the textarea value (B16). It schedules no successor,
  // so it settles by construction.
  'components/feed/ComposeBox.tsx',
  'components/feed/GhostTextArea.tsx',
  'components/feed/HandleInput.tsx',
  'components/feed/MentionTextarea.tsx',
  'components/forest-explorer/story/StoryGame.tsx',
  'components/forest-explorer/story/StoryNarration.tsx',
  'components/forest-explorer/story/StoryToast.tsx',
  // The ONE loop behind the debt counter's three spatial views (the 3D terrain,
  // the 4D projection and the debt globe). It is a `_site` page rather than a
  // game, so it is held to the idle-at-rest standard and meets it three times
  // over: a frame is scheduled only while the canvas is intersecting AND the tab
  // is foreground AND either React says it is animating or the renderer's own
  // return value says it has not settled. That last channel is what lets a
  // thrown globe coast to a stop and a ripple finish travelling and then have
  // the loop STOP — states React never sees, because they are integrated in refs
  // inside the loop. Cancelled on unmount, on leaving the viewport, and on the
  // tab going to the background. A page parked on the analytics panel with
  // nothing moving schedules no frames at all.
  'components/kaikai-debt/stats/canvas-stage.ts',
  'components/slice-it/GameCanvas.tsx',
  'components/slice-it/HUD.tsx',
  // Replay playback (R4). Idle at rest: the loop only exists while the replay
  // is *playing* — a paused or finished one paints once and schedules nothing —
  // and it stops itself at the end of the track. `cancelAnimationFrame` on
  // unmount and on every dependency change besides.
  'components/slice-it/ReplayViewer.tsx',
  // Chart editor playtest (C1 phase 4). Idle at rest in the strongest sense:
  // the effect returns before creating a loop unless `playtesting` is true, so
  // an editor sitting open schedules no frames at all. It also stops itself
  // past the end of the song, and cancels on unmount.
  'components/slice-it/editor/PlaytestControls.tsx',
  // Chart editor timeline. Dirty-flag gated — the loop schedules, but returns
  // immediately unless an edit, a seek or a zoom marked the canvas dirty, so a
  // still timeline does no work per frame. Cancels on unmount.
  //
  // This one is a scheduling-at-rest loop rather than a true idle one; it stays
  // because the alternative (re-arming rAF from every mutation site) puts the
  // scheduling decision in a dozen places instead of one.
  'components/slice-it/editor/Timeline.tsx',
  'components/kowloon-knockout/arena/GameView.tsx',
  'components/laundry-sort/hud/HudReadout.tsx',
  'components/library/AlbumUploader.tsx',
  'components/library/BookReader.tsx',
  'components/library/EpubReader.tsx',
  'components/library/LibraryReveal.tsx',
  'components/library/UploadModal.tsx',
  'components/massive-march/world/WorldView.tsx',
  'components/radial/LiquidGlobe.tsx',
  'components/neon-driftway/NeonDriftwayGame.tsx',
  'components/nightrail/NightrailGame.tsx',
  'components/news/NewsHero.tsx',
  'components/rmh-capital/ContactPage.tsx',
  // `components/rmh-capital/shared.tsx` came OUT on 2026-08-12: its rAF was the
  // deferred `querySelectorAll` inside `useReveal(key)`, and the reveal is now a
  // scroll-driven CSS animation with no JS at all. (`rmh-pmc/shared.tsx` stays —
  // it lost the same hook, but has a separate counter tick that still uses rAF.)
  // See docs/performance-audit-2026-08-12.md §1.4.
  'components/rmh-pmc/ContactPage.tsx',
  'components/rmh-pmc/shared.tsx',
  'components/rmhcalculator/ScientificCalculator.tsx',
  'components/rmhcoins/PlinkoGame.tsx',
  'components/radial/QuickPanel.tsx',
  'components/radial/RadialHub.tsx',
  'components/radial/RadialWheel.tsx',
  'components/rmhtech/RmhtechLanding.tsx',
  'components/signal-forge/SignalForgeGame.tsx',
  'components/site/LanguageSwitcher.tsx',
  'components/studio/arrangement/PlayheadCursor.tsx',
  'components/studio/mixer/VUMeter.tsx',
  'components/synapse-storm/PuzzleCard.tsx',
  'components/temple-of-joy/TempleGlobes.tsx',
  'components/temple-of-joy/TempleOfJoyGame.tsx',
  // The headline joy/rate readouts write textContent on a frame loop
  // rather than re-rendering their subtree 60 times a second.
  'components/temple-of-joy/ui.tsx',
  'components/ui/AnimatedCount.tsx',
  'components/ui/TwemojiProvider.tsx',
  'components/ui/anchored-menu.tsx',
  'components/ui/liquid-morph.tsx',
  'components/ui/liquid-tabs.tsx',
  'components/velum2099/game/main.ts',
  'components/void-breaker/VoidBreakerGame.tsx',
  'hooks/useCelebration.ts',
  'hooks/useDeviceAttitude.ts',
  'hooks/useFluidDrag.ts',
  'hooks/useFluidPress.ts',
  'hooks/useLiquidBackground.ts',
  'hooks/useScrollRestoration.ts',
  'hooks/useSpatialParallax.ts',
  'lib/altair/engine/game-loop.ts',
  'lib/dream-rift/net/session.ts',
  'lib/emoji/use-emoji-insert.ts',
  'lib/emoji/use-emoji-shortcodes.tsx',
  'lib/house-always-wins/engine/GameEngine.ts',
  'lib/kowloon-knockout/net/session.ts',
  'lib/library/epub-raster.ts',
  'lib/library/page-store.ts',
  'lib/rmhmusic/spotify-player.ts',
  'lib/rmhvibe/vibe.server.ts',
  'lib/vega/VegaGame.ts',
]);

function collect(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      collect(rel, out);
    } else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx') &&
      entry.name !== 'routeTree.gen.ts'
    ) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * Comments are stripped before the search, because a file that DOCUMENTS not
 * owning a loop — "this renderer does not call `requestAnimationFrame`; the
 * component that mounts it owns the loop and its cancel-on-unmount" — is
 * exactly the ownership statement this gate wants people to write, and a bare
 * substring match punished it by demanding an allowlist entry for a file with
 * no loop in it. An allowlist that fills up with non-loops stops meaning
 * anything, which is the failure mode this test exists to prevent.
 *
 * Stripping cannot hide a real call: code that runs is code outside a comment.
 */
function usesRaf(file: string): boolean {
  const src = readFileSync(join(ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  return src.includes('requestAnimationFrame');
}

describe('§17.3 requestAnimationFrame loop allowlist', () => {
  const found = SCAN_DIRS.flatMap((d) => collect(d)).filter(usesRaf);

  it('scans a non-trivial source set', () => {
    expect(found.length).toBeGreaterThan(40);
  });

  it('no rAF file lands outside the reviewed allowlist', () => {
    const unlisted = found.filter((f) => !ALLOW.has(f)).sort();
    expect(
      unlisted,
      `\nNew requestAnimationFrame loop(s) not in the §17.3 allowlist:\n` +
        unlisted.map((f) => `  ${f}`).join('\n') +
        `\n\nProve each has a settle/stop condition (idle-at-rest for the shared ` +
        `motion tier, or an unmount cancelAnimationFrame for a game/app), then add ` +
        `it to ALLOW in lib/__tests__/raf-loop-allowlist.test.ts.\n`,
    ).toEqual([]);
  });

  it('the allowlist has no stale entries', () => {
    const foundSet = new Set(found);
    const stale = [...ALLOW].filter((f) => !foundSet.has(f)).sort();
    expect(
      stale,
      `\nAllowlisted files that no longer call requestAnimationFrame (remove them):\n` +
        stale.map((f) => `  ${f}`).join('\n') +
        `\n`,
    ).toEqual([]);
  });
});
