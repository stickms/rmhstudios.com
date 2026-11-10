import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, posix } from 'node:path';

/**
 * §17.3 — "animations always end": a `requestAnimationFrame` file allowlist so a
 * NEW unbounded rAF loop cannot land silently.
 *
 * Every rAF loop in the repo must have a provable settle/stop condition — the
 * §16.4 idle-at-rest pattern for the shared motion tier (samplers idle when
 * nothing animates), or an unmount `cancelAnimationFrame` for the self-contained
 * games/apps (their loops run only while the game is mounted/active).
 *
 * Two standards since Plasmatic Jelly (master plan R7, 2026-10-23):
 *   - IDLE-AT-REST — everything, including every jelly driver.
 *   - IDLE-WHEN-UNSEEN — exactly ONE exception, the engine's ambient haze clock: it keeps
 *     waking its driver (15 Hz idle floor) while a haze surface is visible and stops
 *     (0 Hz, no wake) when nobody can see it.
 *   Since #989 the jelly has ONE rAF, `lib/jelly/frame.ts`; the engine, physics, arc
 *   renderer and fallback light are drivers on it and call no rAF of their own.
 *   `jelly-ownership.test.ts` (N2b) pins that single owner; `jelly-contract.test.ts`
 *   (N1) pins the clock's stop conditions. This test
 * enumerates every source that calls `requestAnimationFrame` and asserts the set
 * exactly matches {@link ALLOW}. When it fails:
 *   - a NEW file appears → prove it has a settle/stop condition (idle-at-rest for
 *     the design tier, unmount cancel for a game), THEN add it here. Never add a
 *     file that spins a rAF loop forever while the page is at rest.
 *   - a listed file no longer uses rAF → remove it from the list (keep it honest).
 *
 * The shared MOTION-TIER files below are the freeze-relevant ones; each is
 * verified idle-at-rest / one-shot:
 *   - components/ui/tabs.tsx   — one-shot rAF to move focus after a tab key.
 *   - hooks/useLiquidBackground.ts    — rAF used as a per-event THROTTLE
 *                                       (one-shot). `useGlassLight.ts`,
 *                                       `useCardSheen.ts` and `useParallax.ts` were
 *                                       here too; all were cursor-tracking effects
 *                                       and all are deleted (§5.1.1). So was
 *                                       `lib/glass-lens.ts`, whose rAF belonged to
 *                                       a generator with no caller.
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
 *   - lib/jelly/frame.ts            — the jelly frame driver (#989): the ONE rAF behind
 *                                       the engine's ambient clock and rim draws, the
 *                                       soft body, the arc renderer and the fallback
 *                                       light. Settle proof: a frame is requested only
 *                                       while at least one registered driver is awake;
 *                                       a driver stays awake only by returning `true`
 *                                       from its frame, so when every driver has settled
 *                                       NO frame is requested; `stop()` cancels a pending
 *                                       frame nobody else needs. The ambient clock wakes
 *                                       its driver from a timer (60 Hz engaged, 15 Hz
 *                                       idle floor, 0 when unseen — `policy.ts`
 *                                       `ambientHz`), never by spinning; physics and arcs
 *                                       wake only on input, a strike or a live arc.
 *                                       Proven in lib/jelly/__tests__/frame.test.ts.
 *   - components/radial/LiquidGlobe.tsx — the navigation globe's spin/dwell loop.
 *                                       NOT bounded by mount: the desktop shell
 *                                       DOCKS it (`RadialGlobeDock`), on every page,
 *                                       for the whole visit. So it is idle-at-rest
 *                                       like a jelly driver: it runs every vsync
 *                                       only while something moves (a hand on it,
 *                                       a settle, a ripple, the dwell ring, the
 *                                       soft body, an eversion); otherwise it
 *                                       sleeps on a timer to the next jelly
 *                                       ambient tick (drift + coat haze: engaged
 *                                       rate, then the 15 Hz idle floor after
 *                                       IDLE_AFTER_MS, on the grid it shares with
 *                                       the globe worker's coat clock) — and with NOTHING
 *                                       scheduled under jellyMotion `still`, the
 *                                       degraded tiers, a hidden/unfocused tab or
 *                                       off screen. Every handler that moves it
 *                                       wakes it (raising `dirty`). It writes only
 *                                       transform/opacity/custom properties and
 *                                       reads no layout; unmount cancels both.
 *   - components/rideshare/cars/LiquidCarStage.tsx — the RMH family of cars'
 *                                       turntable. Idle-at-rest by construction
 *                                       and NOT bounded by mount, which matters
 *                                       because unlike the globe it sits on a
 *                                       content page you might read for a
 *                                       minute: the scene's `frame()` returns
 *                                       false the instant the throw has settled,
 *                                       the wobble has died and the last ripple
 *                                       has expired, and the loop is not
 *                                       rescheduled. Drag, poke, a body swap, a
 *                                       resize and a theme change each start it
 *                                       again. There is deliberately no idle
 *                                       spin, so a car nobody is touching runs
 *                                       no loop at all; an IntersectionObserver
 *                                       stops it off-screen on top of that, and
 *                                       the effect cancels the pending frame on
 *                                       unmount.
 *   - components/rmhfashion/FashionStage.tsx — RMH Fashion's figure turntable.
 *                                       The same construction as the car stage
 *                                       above and idle-at-rest for the same
 *                                       reason: `frame()` returns false once the
 *                                       throw has settled, the sway has died and
 *                                       the last ripple has expired, and the
 *                                       loop is not rescheduled. Dressing,
 *                                       dyeing, a figure slider, a drag, a poke
 *                                       and a theme change each start it again.
 *                                       There is no idle spin, so a dressed
 *                                       figure nobody is touching runs no loop;
 *                                       an IntersectionObserver stops it
 *                                       off-screen, and the effect cancels the
 *                                       pending frame on unmount.
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
 *   - components/elections/GlobeCanvas.tsx — the election page's 3D lean globe (two liquids, a needle, rotatable).
 *                                       IDLE-AT-REST: the loop runs for ~7 s when the globe scrolls into view,
 *                                       when its lean changes, or when it is touched, and while a drag/flick/reset
 *                                       is moving, then ends once the spring and the view have settled (`frame()` does not reschedule), so a page at rest runs no
 *                                       loop. It also stops while off screen (IntersectionObserver) or the tab is
 *                                       hidden, draws one still frame under jellyMotion `still`, and cancels its
 *                                       pending frame on unmount.
 *   - components/radial/eversion/useEversionController.ts — the eversion controller's two
 *                                       one-shot rAF waits (`nextFrame()`): each resolves one
 *                                       promise and never re-requests a frame.
 *   - lib/eversion/gl/host.ts — the globe-eversion
 *                                       navigation effect's frame loop (its
 *                                       worker, lib/eversion/gl/worker.ts, is a
 *                                       dedicated worker and exempt, see
 *                                       `isWorkerOnlyRaf`; this is the same
 *                                       core's in-thread scheduler where workers
 *                                       cannot present). Bounded by the
 *                                       navigation: the loop starts at `start`
 *                                       and stops at `done`/`abort`/
 *                                       `context-lost`; no loop runs at rest.
 *                                       The core requests a frame only while a
 *                                       run is live and the page is visible, and
 *                                       `host.ts` disposes it on `pagehide`.
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
 *   - hooks/useSpatialParallax.ts     — pointer-event throttle; cancels on unmount.
 *   - hooks/useScrollRestoration.ts, hooks/useCelebration.ts,
 *     components/ui/AnimatedCount.tsx,
 *     components/ui/TwemojiProvider.tsx — one-shot / self-terminating.
 * Everything else is a self-contained game/app or media widget whose loop is
 * bounded by mount lifetime (unmount cancels the rAF).
 */

const ROOT = process.cwd();
const SCAN_DIRS = ['components', 'app', 'hooks', 'lib', 'stores', 'features'];

/** Files permitted to call requestAnimationFrame (see the doc block above). */
const ALLOW = new Set<string>([
  // Altair co-op match: the draw loop is cancelled in the effect cleanup (unmount); it only draws.
  'features/altair/ui/multiplayer/MultiplayerGameScreen.tsx',
  // Altair main-menu backdrop (pixel-art corridor). Bounded by MOUNT and by visibility: the effect
  // cancels the frame on unmount, a hidden tab cancels it and `visibilitychange` restarts it, and it
  // is capped at 30 fps with a fixed-size buffer (no per-frame canvas reallocation).
  'features/altair/ui/menu/MenuBackdrop.tsx',
  // Kowloon Knockout main-menu backdrop (pixel-art street). Same bounds as the Altair one: the effect
  // cancels the frame on unmount, a hidden tab cancels it and `visibilitychange` restarts it, Jelly
  // motion Still draws one frame and stops (a MutationObserver restarts it), and it is capped at 30 fps
  // (15 on the Low graphics preference) with a fixed-size buffer (no per-frame canvas reallocation).
  'components/kowloon-knockout/MenuBackdrop.tsx',
  // RMH Music's paper backdrop (notes drifting on staff paper). Same bounds as the Kowloon one: the
  // effect cancels the frame on unmount, a hidden tab cancels it and `visibilitychange` restarts it,
  // the band scrolling out of view stops it (IntersectionObserver), Jelly motion Still draws one
  // frame and stops (a MutationObserver restarts it), and it is capped at 30 fps (15 on handhelds and
  // low-end devices) with a buffer sized per layout (no per-frame canvas reallocation).
  'components/rmhmusic/learn/PaperBackdrop.tsx',
  // The ONE jelly frame (#989). The engine, the soft body, the arc renderer and
  // the fallback cursor light are drivers on it (`drive(fn, { order })`) and call
  // no rAF themselves. No frame is requested while no driver is awake; `stop()`
  // cancels. Settle proven in lib/jelly/__tests__/frame.test.ts.
  'lib/jelly/frame.ts',
  // The TF2 HUD editor's preview canvas. Not a loop: it requests ONE frame per
  // change (scene, zoom, selection) to coalesce redraws, and the effect's cleanup
  // cancels any pending frame on re-run and on unmount. Nothing is scheduled at rest.
  'components/tf2-hud/Preview.tsx',
  'app/routes/_site/library/index.tsx',
  'app/routes/_site/rmhladder/pipeline.tsx',
  'components/assistant/ConciergePanel.tsx',
  'components/canvas/CanvasReplay.tsx', // P19 Z5: stops at the last pixel; cancelled on unmount/pause
  'components/cursed-logic/MinigameOverlay.tsx',
  // GlobeSet's globe: the seven cards of the daily deal pinned to a sphere you
  // turn. Idle-at-rest, which is the standard this has to meet because /daily
  // is a game surface a player leaves open. A frame is scheduled only while a
  // finger is down, while the release is still coasting (the coast decays to a
  // hard REST_DEG_PER_S floor, then stops), while a focused card is gliding to
  // the front (which converges and clears its own target), or while the
  // gyroscope is live — and the sensor's own loop is the one in
  // `useDeviceAttitude`, already listed below. The effect that starts it
  // returns a teardown whose first statement is `cancelAnimationFrame`, so
  // switching to the flat board or leaving the page ends it.
  // Dunesday 7 desktop: the draggable soap-bubble physics (BubbleWorld) and the
  // wallpaper parallax throttle (`rafThrottle`, one-shot per pointer event). The
  // bubble loop is a self-contained toy like the games': it runs only while the
  // desktop (or the screen saver) is mounted, skips frames while
  // `document.hidden`, is never started under reduced motion, and is cancelled
  // on unmount. Transform-only, writes nothing to <html>.
  'components/dunesday/os/frame.ts',
  // R3F menu-backdrop cap: while a menu covers a `frameloop="demand"` scene it
  // invalidates on the vsync ticks `FrameCap` lets through. It runs only while
  // `fps` is non-null (a menu is open); the effect's teardown cancels it, and a
  // hidden tab runs no rAF callbacks.
  'components/render/FrameCap.tsx',
  'components/daily-puzzles/globeset/GlobeSetGlobe.tsx',
  // One-shot, not a loop: a single deferred frame that restores the caret after
  // a smart-paste rewrites the textarea value (B16). It schedules no successor,
  // so it settles by construction.
  'components/feed/ComposeBox.tsx',
  // One-shot, no loop: the search field's autofocus waits one frame (rAF →
  // setTimeout) so `focus()` reads the layout the frame already computed instead
  // of forcing one mid page switch; both handles are cancelled on unmount.
  'components/feed/ExploreColumn.tsx',
  'components/feed/GhostTextArea.tsx',
  'components/feed/HandleInput.tsx',
  'components/feed/MentionTextarea.tsx',
  // The ONE loop behind every canvas view on the site tier: the debt counter's
  // three spatial views (the 3D terrain, the 4D projection and the debt globe)
  // and the Rebar & Rutabaga menu globe. These are `_site` pages rather than
  // games, so it is held to the idle-at-rest standard and meets it three times
  // over: a frame is scheduled only while the canvas is intersecting AND the tab
  // is foreground AND either React says it is animating or the renderer's own
  // return value says it has not settled. That last channel is what lets a
  // thrown globe coast to a stop and a ripple finish travelling and then have
  // the loop STOP — states React never sees, because they are integrated in refs
  // inside the loop. Cancelled on unmount, on leaving the viewport, and on the
  // tab going to the background. A page parked on the analytics panel with
  // nothing moving schedules no frames at all.
  'hooks/useCanvasStage.ts',
  'features/slice-it/ui/GameCanvas.tsx',
  'features/slice-it/ui/HUD.tsx',
  // The music in the margins of a wide screen. Idle at rest: it only exists while
  // the playfield is locked to its ratio in landscape, it advances motion only while
  // there is sound, and once every bar, the thump and the sparks have settled it
  // stops asking for frames and polls on a 4 Hz TIMER for the music to return — a
  // paused run schedules no animation frames. Hidden tabs poll the same way. The
  // effect cancels the frame and the timer on unmount.
  'features/slice-it/ui/SideWaves.tsx',
  // Replay playback (R4). Idle at rest: the loop only exists while the replay
  // is *playing* — a paused or finished one paints once and schedules nothing —
  // and it stops itself at the end of the track. `cancelAnimationFrame` on
  // unmount and on every dependency change besides.
  'features/slice-it/ui/ReplayViewer.tsx',
  // Chart editor playtest (C1 phase 4). Idle at rest in the strongest sense:
  // the effect returns before creating a loop unless `playtesting` is true, so
  // an editor sitting open schedules no frames at all. It also stops itself
  // past the end of the song, and cancels on unmount.
  'features/slice-it/ui/editor/PlaytestControls.tsx',
  // Chart editor timeline. Dirty-flag gated — the loop schedules, but returns
  // immediately unless an edit, a seek or a zoom marked the canvas dirty, so a
  // still timeline does no work per frame. Cancels on unmount.
  //
  // This one is a scheduling-at-rest loop rather than a true idle one; it stays
  // because the alternative (re-arming rAF from every mutation site) puts the
  // scheduling decision in a dozen places instead of one.
  'features/slice-it/ui/editor/Timeline.tsx',
  'components/kowloon-knockout/arena/GameView.tsx',
  'components/laundry-sort/hud/HudReadout.tsx',
  'components/library/AlbumUploader.tsx',
  'components/library/BookReader.tsx',
  'components/library/EpubReader.tsx',
  'components/library/LibraryReveal.tsx',
  'components/library/UploadModal.tsx',
  'components/elections/GlobeCanvas.tsx',
  'components/radial/LiquidGlobe.tsx',
  'components/neon-driftway/NeonDriftwayGame.tsx',
  'features/nightrail/ui/NightrailGame.tsx',
  'components/news/NewsHero.tsx',
  'components/rideshare/cars/LiquidCarStage.tsx',
  'components/rmhfashion/FashionStage.tsx',
  'components/rmh-capital/ContactPage.tsx',
  // `components/rmh-capital/shared.tsx` came OUT on 2026-08-12: its rAF was the
  // deferred `querySelectorAll` inside `useReveal(key)`, and the reveal is now a
  // scroll-driven CSS animation with no JS at all. (`rmh-pmc/shared.tsx` stays —
  // it lost the same hook, but has a separate counter tick that still uses rAF.)
  // See docs/archive/2026/performance-audit-2026-08-12.md §1.4.
  'components/rmh-pmc/ContactPage.tsx',
  'components/rmh-pmc/shared.tsx',
  'components/rmhcalculator/ScientificCalculator.tsx',
  'components/rmhcoins/PlinkoGame.tsx',
  'components/radial/QuickPanel.tsx',
  'components/radial/RadialHub.tsx',
  'components/rmhtech/RmhtechLanding.tsx',
  'features/signal-forge/ui/SignalForgeGame.tsx',
  'components/site/LanguageSwitcher.tsx',
  'components/studio/arrangement/PlayheadCursor.tsx',
  'components/studio/mixer/VUMeter.tsx',
  'features/synapse-storm/ui/PuzzleCard.tsx',
  'components/temple-of-joy/TempleGlobes.tsx',
  // Globe eversion (T25): bounded by the navigation — the loop starts at `start` and stops at
  // `done`/`abort`/`context-lost`; no loop runs at rest.
  'lib/eversion/gl/host.ts',
  // Globe eversion (T31): ONE-SHOT rAFs, never a loop. `nextFrame()` resolves a single promise
  // (the two-frame waits before the AFTER capture and before `reveal`, spec §6.3/§6.6), with a
  // 100 ms timer so a hidden tab cannot hang it. Nothing re-requests a frame from the callback.
  'components/radial/eversion/useEversionController.ts',
  'components/temple-of-joy/TempleOfJoyGame.tsx',
  // The headline joy/rate readouts write textContent on a frame loop
  // rather than re-rendering their subtree 60 times a second.
  'components/temple-of-joy/ui.tsx',
  'components/ui/AnimatedCount.tsx',
  'components/ui/TwemojiProvider.tsx',
  'components/ui/anchored-menu.tsx',
  'components/ui/tabs.tsx',
  'components/velum2099/game/main.ts',
  'features/void-breaker/ui/VoidBreakerGame.tsx',
  'hooks/useCelebration.ts',
  'hooks/useDeviceAttitude.ts',
  'hooks/useLiquidBackground.ts',
  'hooks/useScrollRestoration.ts',
  'hooks/useSpatialParallax.ts',
  'features/altair/engine/engine/game-loop.ts',
  // Balatro: the render governor's frame sampler runs while the engine does and is cancelled in
  // stop(); the phone keyboard's key queue is a one-shot chain that ends when the queue is empty.
  'features/balatro/engine/runtime.ts',
  'features/balatro/engine/text-input.ts',
  'features/dream-rift/engine/net/session.ts',
  'lib/emoji/use-emoji-insert.ts',
  'lib/emoji/use-emoji-shortcodes.tsx',
  'lib/house-always-wins/engine/GameEngine.ts',
  'lib/kowloon-knockout/net/session.ts',
  'lib/library/epub-raster.ts',
  'lib/library/page-store.ts',
  // Display refresh-rate probe for the 3D governor's target. Bounded by
  // construction, not by mount: exactly SAMPLE_FRAMES (40) callbacks, once per
  // document, then it stops for good and only the cached number is read. It
  // runs only on pages that mount a governed Canvas, and writes nothing to the
  // DOM.
  'lib/render/refresh-rate.ts',
  'lib/rmhvibe/vibe.server.ts',
  'features/vega/engine/VegaGame.ts',
  // The browser TF2 / Half-Life 2 / Portal clients' ONE frame loop (`GameLoop`). Every
  // part of a running game — input, simulation/command ticks, rendering, audio, the
  // HUD — rides this callback; nothing else in lib/tf2-game or components/tf2-game
  // calls rAF. Bounded by mount: the client's `dispose()` (the play page's unmount)
  // calls `stop()`, which cancels the pending frame and unsubscribes from visibility.
  // It also schedules NOTHING while the tab is hidden (resuming with a zero-length
  // frame), and the jelly material is off for the whole run (`markGamePlaying`).
  'lib/tf2-game/client/loop.ts',
]);

function collect(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = join(dir, entry.name).replaceAll('\\', '/');
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
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const WORKER_URL = /new\s+Worker\(\s*new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g;

/**
 * Every file some source starts as a dedicated worker — `new Worker(new URL('./x.worker.ts', import.meta.url))` — as a
 * repo-relative path. Comments are stripped first, so a doc block quoting the pattern does not count.
 */
function workerTargets(sources: ReadonlyArray<{ file: string; src: string }>): Set<string> {
  const out = new Set<string>();
  for (const { file, src } of sources) {
    for (const m of stripComments(src).matchAll(WORKER_URL)) {
      out.add(posix.normalize(posix.join(posix.dirname(file), m[1]!)));
    }
  }
  return out;
}

/**
 * A dedicated worker's own `requestAnimationFrame` (e.g. the liquid globe's `components/radial/globe-worker.ts`) is
 * not a page frame: it never wakes the page's frame driver or its main thread, which is what this gate guards. Exempt
 * only a file that IS started as a worker somewhere in the repo AND touches no `document.` / `window.` — not a file
 * that merely carries `/// <reference lib="webworker" />` (a directive anyone can add to a page module).
 */
function isWorkerOnlyRaf(file: string, strippedSrc: string, targets: Set<string>): boolean {
  return targets.has(file) && !/\b(?:document|window)\./.test(strippedSrc);
}

let targetsCache: Set<string> | null = null;
function repoWorkerTargets(): Set<string> {
  if (!targetsCache) {
    targetsCache = workerTargets(
      SCAN_DIRS.flatMap((d) => collect(d)).map((file) => ({
        file,
        src: readFileSync(join(ROOT, file), 'utf8'),
      })),
    );
  }
  return targetsCache;
}

function usesRaf(file: string): boolean {
  const src = stripComments(readFileSync(join(ROOT, file), 'utf8'));
  if (!src.includes('requestAnimationFrame')) return false;
  return !isWorkerOnlyRaf(file, src, repoWorkerTargets());
}

describe('the worker exemption bites (fixtures)', () => {
  const host = {
    file: 'components/radial/globe-worker-host.ts',
    src: "const w = new Worker(new URL('./globe-worker.ts', import.meta.url), { type: 'module' });",
  };
  const targets = workerTargets([
    host,
    {
      file: 'fixture/a/b/client.ts',
      src: "new Worker(new URL('../c/tick.worker.ts', import.meta.url))",
    },
    // A comment quoting the pattern is not a worker.
    { file: 'fixture/doc.ts', src: "/** new Worker(new URL('./ghost.ts', import.meta.url)) */" },
  ]);

  it('resolves worker URLs relative to the file that starts them', () => {
    expect([...targets].sort()).toEqual([
      'components/radial/globe-worker.ts',
      'fixture/a/c/tick.worker.ts',
    ]);
  });

  it('exempts a real worker that touches no DOM', () => {
    const src = stripComments(
      '/// <reference lib="webworker" />\nscope.requestAnimationFrame(onFrame);',
    );
    expect(isWorkerOnlyRaf('components/radial/globe-worker.ts', src, targets)).toBe(true);
  });

  it('does NOT exempt a page module that only carries the webworker directive', () => {
    const src = stripComments('/// <reference lib="webworker" />\nrequestAnimationFrame(loop);');
    expect(isWorkerOnlyRaf('fixture/Spinner.tsx', src, targets)).toBe(false);
  });

  it('does NOT exempt a worker target that reaches for the page (document. / window.)', () => {
    expect(
      isWorkerOnlyRaf(
        'components/radial/globe-worker.ts',
        'window.requestAnimationFrame(f);',
        targets,
      ),
    ).toBe(false);
    expect(
      isWorkerOnlyRaf(
        'fixture/a/c/tick.worker.ts',
        'document.title = "x"; requestAnimationFrame(f);',
        targets,
      ),
    ).toBe(false);
  });

  it('does NOT exempt a file only a comment points at', () => {
    expect(isWorkerOnlyRaf('fixture/ghost.ts', 'requestAnimationFrame(f);', targets)).toBe(false);
  });

  it("the repo's worker rAF loops are the exempt ones", () => {
    const real = repoWorkerTargets();
    expect(real.has('components/radial/globe-worker.ts')).toBe(true);
    expect(usesRaf('components/radial/globe-worker.ts')).toBe(false);
    expect(usesRaf('components/radial/LiquidGlobe.tsx')).toBe(true);
  });
});

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
        `it to ALLOW in lib/__tests__/raf-loop-allowlist.test.ts. Idle-when-unseen ` +
        `(a loop that keeps ticking while visible) is reserved for the jelly engine's ` +
        `ambient clock (docs/plasmatic-jelly-system.md) — ambient motion goes through it.\n`,
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
