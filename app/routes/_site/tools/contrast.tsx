import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { ContrastTool } from '@/components/toolbox/contrast/ContrastTool';
import { parseColor, toHex } from '@/lib/toolbox/contrast';

interface ContrastSearch {
  fg?: string;
  bg?: string;
}

/**
 * Bounded strings survive the URL; they are parsed into colours in the page (below), so the colour parser stays in
 * the page's own chunk instead of the entry every route loads (`routeTree.gen.ts` imports each route's validateSearch).
 */
function validateSearch(search: Record<string, unknown>): ContrastSearch {
  const out: ContrastSearch = {};
  for (const key of ['fg', 'bg'] as const) {
    const raw = search[key];
    if (typeof raw === 'string' && raw.length <= 64) out[key] = raw;
  }
  return out;
}

/** A well-formed colour as `#rrggbb`; anything else is undefined and the tool keeps its default. */
function hexOf(raw: string | undefined): string | undefined {
  const parsed = raw ? parseColor(raw) : null;
  return parsed ? toHex(parsed) : undefined;
}

export const Route = createFileRoute('/_site/tools/contrast')({
  head: definePage({
    path: '/tools/contrast',
    title: 'Colour Contrast Checker (WCAG 2.2) | RMH Studios',
    description:
      'Check a text and background colour pair against WCAG 2.2 AA and AAA, and get the nearest passing colour.',
  }),
  validateSearch,
  component: ContrastRoute,
});

function ContrastRoute() {
  const search = Route.useSearch();
  const fg = hexOf(search.fg);
  const bg = hexOf(search.bg);
  const navigate = useNavigate({ from: '/tools/contrast' });
  return (
    <ContrastTool
      {...(fg ? { initialForeground: fg } : {})}
      {...(bg ? { initialBackground: bg } : {})}
      onPairChange={(nextFg, nextBg) =>
        void navigate({ search: { fg: nextFg.slice(1), bg: nextBg.slice(1) }, replace: true })
      }
    />
  );
}
