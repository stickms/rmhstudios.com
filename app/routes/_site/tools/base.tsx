import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { BaseTool } from '@/components/toolbox/base/BaseTool';

export const Route = createFileRoute('/_site/tools/base')({
  head: definePage({
    path: '/tools/base',
    title: 'Number Base Converter | RMH Studios',
    description:
      'Convert integers between binary, octal, decimal, hex and any base to 36, exactly, with two’s-complement views.',
  }),
  component: BaseTool,
});
