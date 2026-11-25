import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { CronTool } from '@/components/toolbox/cron/CronTool';
import { parseCron } from '@/lib/toolbox/cron';

interface CronSearch {
  expr?: string;
}

/**
 * A bounded string survives the URL; whether it parses is checked in the page (below), so the parser stays in the
 * page's own chunk instead of the entry every route loads (`routeTree.gen.ts` imports each route's validateSearch).
 */
function validateSearch(search: Record<string, unknown>): CronSearch {
  const expr = search.expr;
  return typeof expr === 'string' && expr.length <= 200 ? { expr } : {};
}

export const Route = createFileRoute('/_site/tools/cron')({
  head: definePage({
    path: '/tools/cron',
    title: 'Cron Expression Helper | RMH Studios',
    description: 'Check a cron expression field by field and see the next times it runs, in your time zone or UTC.',
  }),
  validateSearch,
  component: CronRoute,
});

function CronRoute() {
  const { expr: raw } = Route.useSearch();
  // Only a valid expression opens the page, so a shared link always opens on something that parses.
  const expr = raw && parseCron(raw).ok ? raw : undefined;
  const navigate = useNavigate({ from: '/tools/cron' });
  return (
    <CronTool
      {...(expr ? { initialExpression: expr } : {})}
      onExpressionChange={(next) => void navigate({ search: { expr: next }, replace: true })}
    />
  );
}
