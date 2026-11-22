/**
 * The two framer-motion internals behind the site's own lazy-motion provider
 * (components/motion/LazyMotionProvider.tsx, aliased in framer-motion-internals.mjs as
 * `FRAMER_MOTION_INTERNALS`) must stay where framer-motion keeps them.
 *
 * The provider replaces framer-motion's `<LazyMotion>` so motion-dom's
 * `VisualElement` (~8 KB brotli) leaves the entry of every page. It only works if
 * it provides the SAME `LazyContext` object the `m` component reads: a second copy
 * of the context would leave every `m` element without a renderer, and nothing on
 * the site would animate, without a single error. An upgrade that moves or renames
 * either file fails here, at the upgrade, instead.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FRAMER_MOTION_INTERNALS } from '../../framer-motion-internals.mjs';

const LAZY_CONTEXT = FRAMER_MOTION_INTERNALS['framer-motion-internal/lazy-context'];
const LOAD_FEATURES = FRAMER_MOTION_INTERNALS['framer-motion-internal/load-features'];
const ES = dirname(dirname(LAZY_CONTEXT)); // …/framer-motion/dist/es

describe('framer-motion internals used by LazyMotionProvider', () => {
  it('the aliased files exist and export what the provider and the bundle import', () => {
    expect(existsSync(LAZY_CONTEXT), LAZY_CONTEXT).toBe(true);
    expect(existsSync(LOAD_FEATURES), LOAD_FEATURES).toBe(true);
    expect(readFileSync(LAZY_CONTEXT, 'utf8')).toMatch(/export\s*\{\s*LazyContext\s*\}/);
    expect(readFileSync(LOAD_FEATURES, 'utf8')).toMatch(/export\s*\{\s*loadFeatures\s*\}/);
  });

  it('the `m` component reads the very LazyContext the provider supplies', () => {
    const motion = readFileSync(join(ES, 'motion/index.mjs'), 'utf8');
    expect(motion).toMatch(/import\s*\{\s*LazyContext\s*\}\s*from\s*'\.\.\/context\/LazyContext\.mjs'/);
    expect(motion).toMatch(/useContext\(LazyContext\)/);
  });

  it("framer-motion's own LazyMotion still works the way the replacement copies", () => {
    const lazyMotion = readFileSync(join(ES, 'components/LazyMotion/index.mjs'), 'utf8');
    expect(lazyMotion).toMatch(/from '\.\.\/\.\.\/context\/LazyContext\.mjs'/);
    expect(lazyMotion).toMatch(/from '\.\.\/\.\.\/motion\/features\/load-features\.mjs'/);
    expect(lazyMotion).toMatch(
      /LazyContext\.Provider,\s*\{\s*value:\s*\{\s*renderer:\s*loadedRenderer\.current,\s*strict\s*\}/,
    );
  });
});
