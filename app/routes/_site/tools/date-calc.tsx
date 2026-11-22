import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { DateCalcTool } from '@/components/toolbox/date-calc/DateCalcTool';

export const Route = createFileRoute('/_site/tools/date-calc')({
  head: definePage({
    path: '/tools/date-calc',
    title: 'Date Calculator: Days Between Dates | RMH Studios',
    description: 'Count the days, weeks, months and weekdays between two dates, or add and subtract time from a date.',
  }),
  component: DateCalcTool,
});
