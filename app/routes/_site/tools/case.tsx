import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { CaseTool } from '@/components/toolbox/case/CaseTool';

export const Route = createFileRoute('/_site/tools/case')({
  head: definePage({
    path: '/tools/case',
    title: 'Case Converter | RMH Studios',
    description:
      'Convert text between camelCase, PascalCase, snake_case, kebab-case, CONSTANT_CASE, Title Case and more, line by line.',
  }),
  component: CaseTool,
});
