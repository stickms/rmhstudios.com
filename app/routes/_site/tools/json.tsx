import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { JsonTool } from '@/components/toolbox/json/JsonTool';

export const Route = createFileRoute('/_site/tools/json')({
  head: definePage({
    path: '/tools/json',
    title: 'JSON Formatter and Validator | RMH Studios',
    description:
      'Validate JSON with the exact line and column of any error, then format, minify or sort it. Runs in your browser.',
  }),
  component: JsonTool,
});
