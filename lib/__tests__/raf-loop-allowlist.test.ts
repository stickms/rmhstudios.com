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
 * The shared MOTION-TIER files below are the freeze-relevant ones (they mount on
 * every page); each is verified idle-at-rest / one-shot:
 *   - components/ui/liquid-morph.tsx  — idle sampler, stops after SETTLE_FRAMES.
 *   - components/ui/liquid-pop.tsx    — rAF runs ONLY while the pop is animating.
 *   - components/ui/liquid-tabs.tsx   — one-shot rAF to move focus after a tab key.
 *   - lib/liquid-gl/index.ts          — render loop: idle-damped, paused on hide,
 *                                       torn down on teardown (no layout reads).
 *   - lib/liquid-gl/renderer-webgl2.ts — one-shot shader-compile polling; stops
 *                                       when compilation completes or context is lost.
 *   - hooks/useGlassLight.ts, hooks/useLiquidBackground.ts, lib/glass-lens.ts —
 *                                       rAF used as a per-event THROTTLE (one-shot).
 *   - hooks/useParallax.ts            — pointer lerp stops once it settles at target.
 *   - hooks/useSpatialParallax.ts     — pointer-event throttle; cancels on unmount.
 *   - hooks/useScrollRestoration.ts, hooks/useCardSheen.ts, hooks/useCelebration.ts,
 *     components/ui/back-to-top.tsx, components/ui/AnimatedCount.tsx,
 *     components/ui/TwemojiProvider.tsx — one-shot / self-terminating.
 * Everything else is a self-contained game/app or media widget whose loop is
 * bounded by mount lifetime (unmount cancels the rAF).
 */

const ROOT = process.cwd();
const SCAN_DIRS = ['components', 'app', 'hooks', 'lib', 'stores'];

/** Files permitted to call requestAnimationFrame (see the doc block above). */
const ALLOW = new Set<string>([
  'app/routes/_site/rmhladder/pipeline.tsx',
  'components/assistant/ConciergePanel.tsx',
  'components/breakpoint/GameView.tsx',
  'components/cursed-logic/MinigameOverlay.tsx',
  'components/dream-rift/MenuBackdrop.tsx',
  'components/feed/GhostTextArea.tsx',
  'components/feed/HandleInput.tsx',
  'components/feed/MentionTextarea.tsx',
  'components/forest-explorer/story/StoryGame.tsx',
  'components/forest-explorer/story/StoryNarration.tsx',
  'components/forest-explorer/story/StoryToast.tsx',
  'components/game/GameCanvas.tsx',
  'components/game/HUD.tsx',
  'components/kowloon-knockout/arena/GameView.tsx',
  'components/laundry-sort/LaundryGame.tsx',
  'components/library/AlbumUploader.tsx',
  'components/library/BookReader.tsx',
  'components/library/EpubReader.tsx',
  'components/library/LibraryReveal.tsx',
  'components/library/UploadModal.tsx',
  'components/neon-driftway/NeonDriftwayGame.tsx',
  'components/news/NewsHero.tsx',
  'components/rmh-capital/ContactPage.tsx',
  'components/rmh-capital/shared.tsx',
  'components/rmh-pmc/ContactPage.tsx',
  'components/rmh-pmc/shared.tsx',
  'components/rmhcoins/PlinkoGame.tsx',
  'components/rmhtech/RmhtechLanding.tsx',
  'components/signal-forge/SignalForgeGame.tsx',
  'components/site/LanguageSwitcher.tsx',
  'components/studio/arrangement/PlayheadCursor.tsx',
  'components/studio/mixer/VUMeter.tsx',
  'components/synapse-storm/PuzzleCard.tsx',
  'components/temple-of-joy/TempleOfJoyGame.tsx',
  'components/ui/AnimatedCount.tsx',
  'components/ui/TwemojiProvider.tsx',
  'components/ui/back-to-top.tsx',
  'components/ui/liquid-morph.tsx',
  'components/ui/liquid-pop.tsx',
  'components/ui/liquid-tabs.tsx',
  'components/velum2099/game/main.ts',
  'components/void-breaker/VoidBreakerGame.tsx',
  'hooks/useCardSheen.ts',
  'hooks/useCelebration.ts',
  'hooks/useGlassLight.ts',
  'hooks/useLiquidBackground.ts',
  'hooks/useParallax.ts',
  'hooks/useScrollRestoration.ts',
  'hooks/useSpatialParallax.ts',
  'lib/altair/engine/game-loop.ts',
  'lib/dream-rift/net/session.ts',
  'lib/emoji/use-emoji-insert.ts',
  'lib/emoji/use-emoji-shortcodes.tsx',
  'lib/glass-lens.ts',
  'lib/house-always-wins/engine/GameEngine.ts',
  'lib/kowloon-knockout/net/session.ts',
  'lib/library/epub-raster.ts',
  'lib/library/page-store.ts',
  'lib/liquid-gl/index.ts',
  'lib/liquid-gl/renderer-webgl2.ts',
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

function usesRaf(file: string): boolean {
  return readFileSync(join(ROOT, file), 'utf8').includes('requestAnimationFrame');
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
