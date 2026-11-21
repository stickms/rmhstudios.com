import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { IdsTool } from '@/components/toolbox/ids/IdsTool';

export const Route = createFileRoute('/_site/tools/ids')({
  head: definePage({
    path: '/tools/ids',
    title: 'UUID, ULID and Nano ID Generator | RMH Studios',
    description:
      'Generate UUID v4 and v7, ULIDs and nano IDs in bulk, and read the version and creation time inside an ID.',
  }),
  component: IdsTool,
});
