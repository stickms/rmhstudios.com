/**
 * Steel M9: content that arrives after the view has painted fades in (docs/plans/2026-11-11-steel-design-implementation.md
 * section 11; components/ui/arrive.tsx). This holds the two shapes a scan can see:
 *
 *  1. A `<Suspense>` with a visible fallback is a loading state the reader sees, so its content arrives. It is written
 *     `<ArrivalSuspense>`, which fades the content in when the fallback actually showed. A bare `<Suspense>` or
 *     `fallback={null}` is allowed: that is usually a lazy dialog or a chunk with its own motion, and where it is inline
 *     content the component owns its arrival (`useArrival`).
 *  2. A file that draws a skeleton is a file where content replaces it, so it says how that content arrives: it uses one
 *     of the arrival tools. A file that only DEFINES a placeholder rendered somewhere else is listed in
 *     {@link PLACEHOLDER_ONLY} with that place; the list is checked to stay true.
 *
 * What a scan cannot see (a spinner or "Loading…" text swapped for content, a list that grows) is the same rule; the
 * component's docs in arrive.tsx say which tool fits.
 */
import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Files that only define a placeholder; the content that replaces it arrives in the named file. */
const PLACEHOLDER_ONLY: Record<string, string> = {
  'components/ui/skeletons/PostCardSkeleton.tsx':
    'a post row placeholder; each caller owns the swap',
  'components/feed/CommunitiesSkeleton.tsx':
    'the communities placeholder; components/feed/CommunitiesColumn.tsx swaps it',
};

/**
 * Suspense boundaries inside a three.js scene graph (react-three-fiber): the fallback is a 3D placeholder and the content
 * is scene objects, so there is no DOM element to fade. The arrival there is the game's own rendering.
 */
const SCENE_GRAPH_SUSPENSE: Record<string, string> = {
  'components/kowloon-knockout/arena/Fighter.tsx': 'fighter model loading inside the arena scene',
};

const ARRIVAL_TOOLS =
  /\b(useArrival|ArrivalSuspense|useSuspenseArrival|useArrivingKeys|useStableListMotion|markRouteArrival|ARRIVE)\b|['"`]arrive(-group)?['"`]|\barrive-group\b/;

function sources(): string[] {
  return globSync('{app/routes,components,features}/**/*.tsx', {
    exclude: (f) => /node_modules|__tests__|\.test\.|routeTree\.gen/.test(String(f)),
  })
    .map(String)
    .filter((f) => f !== 'components/ui/arrive.tsx')
    .sort();
}

describe('Steel M9: arriving content fades in', () => {
  const files = sources();

  it('a Suspense with a visible fallback is an ArrivalSuspense', () => {
    const bad: string[] = [];
    for (const f of files) {
      if (f in SCENE_GRAPH_SUSPENSE) continue;
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/<(?:React\.)?Suspense\b([^>]*?)>/gs)) {
        const attrs = m[1] ?? '';
        if (/\bfallback=/.test(attrs) && !/\bfallback=\{\s*null\s*\}/.test(attrs)) {
          bad.push(`${f}:${src.slice(0, m.index).split('\n').length}`);
        }
      }
    }
    expect(
      bad,
      'Write <ArrivalSuspense fallback={…}> from @/components/ui/arrive: the content after a visible fallback fades in (M9).',
    ).toEqual([]);
  });

  it('a file that draws a skeleton says how the content after it arrives', () => {
    const bad = files.filter((f) => {
      if (f in PLACEHOLDER_ONLY) return false;
      const src = readFileSync(f, 'utf8');
      return /<\w*Skeleton\b/.test(src) && !ARRIVAL_TOOLS.test(src);
    });
    expect(
      bad,
      'Put useArrival(ready) on the root of what replaces the skeleton (or ArrivalSuspense / useArrivingKeys), from @/components/ui/arrive.',
    ).toEqual([]);
  });

  it('the scene-graph list stays true', () => {
    const stale = Object.keys(SCENE_GRAPH_SUSPENSE).filter(
      (f) =>
        !files.includes(f) ||
        !/<Suspense\b[^>]*\bfallback=\{(?!\s*null)/.test(readFileSync(f, 'utf8')),
    );
    expect(
      stale,
      'Delete these entries: the file is gone or has no Suspense with a visible fallback.',
    ).toEqual([]);
  });

  it('the placeholder-only list stays true', () => {
    const stale = Object.keys(PLACEHOLDER_ONLY).filter((f) => {
      if (!files.includes(f)) return true;
      const src = readFileSync(f, 'utf8');
      return !/<\w*Skeleton\b/.test(src) || ARRIVAL_TOOLS.test(src);
    });
    expect(
      stale,
      'Delete these entries: the file is gone, draws no skeleton, or now owns an arrival.',
    ).toEqual([]);
  });
});
