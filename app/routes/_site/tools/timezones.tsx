import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { TimezonesTool } from '@/components/toolbox/timezones/TimezonesTool';

export const Route = createFileRoute('/_site/tools/timezones')({
  head: definePage({
    path: '/tools/timezones',
    title: 'Time Zone Converter | RMH Studios',
    description:
      'See one moment in several time zones at once, with offsets, day changes and working hours, for planning a call.',
  }),
  component: TimezonesTool,
});
