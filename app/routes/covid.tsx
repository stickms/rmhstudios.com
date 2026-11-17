/**
 * /covid — legacy redirect.
 *
 * "Feature Leak: The True Origins of X" is an RMH Research report now, at
 * /rmh-research/reports/feature-leak (app/routes/rmh-research_.reports.feature-leak.tsx),
 * listed in the research archive. This keeps old links and shares landing on it.
 */
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/covid')({
  beforeLoad: () => {
    throw redirect({ href: '/rmh-research/reports/feature-leak', statusCode: 301 });
  },
});
