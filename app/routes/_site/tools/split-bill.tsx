import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { SplitBillTool } from '@/components/toolbox/split-bill/SplitBillTool';

export const Route = createFileRoute('/_site/tools/split-bill')({
  head: definePage({
    path: '/tools/split-bill',
    title: 'Tip Calculator and Bill Splitter | RMH Studios',
    description:
      'Add tax and tip, then split a bill evenly or by shares, to the cent, with optional rounding up for cash.',
  }),
  component: SplitBillTool,
});
