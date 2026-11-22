import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { LoanTool } from '@/components/toolbox/loan/LoanTool';

export const Route = createFileRoute('/_site/tools/loan')({
  head: definePage({
    path: '/tools/loan',
    title: 'Loan and Mortgage Calculator | RMH Studios',
    description:
      'Monthly payment, total interest and a full amortization schedule, with the effect of paying extra each month.',
  }),
  component: LoanTool,
});
