/**
 * /optimization — legacy redirect.
 *
 * "Speed & Optimization" is an RMH Research report now, at
 * /rmh-research/reports/optimization (app/routes/rmh-research_.reports.optimization.tsx),
 * listed in the research archive. This keeps old links landing on it.
 */
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/optimization')({
  beforeLoad: () => {
    throw redirect({ href: '/rmh-research/reports/optimization', statusCode: 301 });
  },
});
