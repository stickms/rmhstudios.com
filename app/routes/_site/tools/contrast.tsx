import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { ContrastTool } from '@/components/toolbox/contrast/ContrastTool';
import { parseColor, toHex } from '@/lib/toolbox/contrast';

interface ContrastSearch {
  fg?: string;
  bg?: string;
}

/** Only well-formed colours survive into the page; anything else falls back to the defaults. */
function validateSearch(search: Record<string, unknown>): ContrastSearch {
  const out: ContrastSearch = {};
  for (const key of ['fg', 'bg'] as const) {
    const raw = search[key];
    const parsed = typeof raw === 'string' ? parseColor(raw) : null;
    if (parsed) out[key] = toHex(parsed).slice(1);
  }
  return out;
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
  const { fg, bg } = Route.useSearch();
  const navigate = useNavigate({ from: '/tools/contrast' });
  return (
    <ContrastTool
      {...(fg ? { initialForeground: `#${fg}` } : {})}
      {...(bg ? { initialBackground: `#${bg}` } : {})}
      onPairChange={(nextFg, nextBg) =>
        void navigate({ search: { fg: nextFg.slice(1), bg: nextBg.slice(1) }, replace: true })
      }
    />
  );
}
