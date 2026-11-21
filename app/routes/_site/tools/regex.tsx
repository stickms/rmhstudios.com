import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { RegexTool } from '@/components/toolbox/regex/RegexTool';

export const Route = createFileRoute('/_site/tools/regex')({
  head: definePage({
    path: '/tools/regex',
    title: 'Regex Tester (JavaScript) | RMH Studios',
    description:
      'Test a JavaScript regular expression: highlighted matches, numbered and named groups, flags and a replace preview.',
  }),
  component: RegexTool,
});
