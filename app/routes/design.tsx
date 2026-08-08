import { createFileRoute } from '@tanstack/react-router';
import { LiquidGlassPage } from '@/components/design/LiquidGlassPage';
import { buildCanonical, buildMeta } from '@/lib/seo';

/**
 * `/design` — the statement of the design language.
 *
 * The head used to hand-roll its own `og:*` block and a literal
 * `https://rmhstudios.com/...` canonical. `buildMeta` owns the whole Open Graph
 * block (CLAUDE.md §6) — absolute `og:image` with declared dimensions, the
 * matching `twitter:card`, the section-card fallback — and the hand-written
 * version had none of the image half, so this page shared as a bare link while
 * every other marketing page shared as a card.
 */
export const Route = createFileRoute('/design')({
  head: () => ({
    meta: buildMeta({
      title: 'Spatial Minimalism | RMH Studios',
      description:
        'The spatial-minimal design system behind RMH Studios: simple color, editorial hierarchy, purposeful motion, and a quieter interface.',
      path: '/design',
    }),
    links: [buildCanonical('/design')],
  }),
  component: LiquidGlassPage,
});
