import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { TimestampTool } from '@/components/toolbox/timestamp/TimestampTool';

export const Route = createFileRoute('/_site/tools/timestamp')({
  head: definePage({
    path: '/tools/timestamp',
    title: 'Unix Timestamp Converter | RMH Studios',
    description:
      'Convert Unix timestamps in seconds, milliseconds, microseconds or nanoseconds to dates, and dates back to timestamps.',
  }),
  component: TimestampTool,
});
