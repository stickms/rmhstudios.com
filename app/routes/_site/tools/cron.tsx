import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { CronTool } from '@/components/toolbox/cron/CronTool';
import { parseCron } from '@/lib/toolbox/cron';

interface CronSearch {
  expr?: string;
}

/** Only a valid expression survives into the page, so a shared link always opens on something that parses. */
function validateSearch(search: Record<string, unknown>): CronSearch {
  const expr = search.expr;
  return typeof expr === 'string' && expr.length <= 200 && parseCron(expr).ok ? { expr } : {};
}

export const Route = createFileRoute('/_site/tools/cron')({
  head: definePage({
    path: '/tools/cron',
    title: 'Cron Expression Helper | RMH Studios',
    description:
      'Check a cron expression field by field and see the next times it runs, in your time zone or UTC.',
  }),
  validateSearch,
  component: CronRoute,
});

function CronRoute() {
  const { expr } = Route.useSearch();
  const navigate = useNavigate({ from: '/tools/cron' });
  return (
    <CronTool
      {...(expr ? { initialExpression: expr } : {})}
      onExpressionChange={(next) => void navigate({ search: { expr: next }, replace: true })}
    />
  );
}
