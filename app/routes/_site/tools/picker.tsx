import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { PickerTool } from '@/components/toolbox/picker/PickerTool';

export const Route = createFileRoute('/_site/tools/picker')({
  head: definePage({
    path: '/tools/picker',
    title: 'Random Name Picker and Team Generator | RMH Studios',
    description:
      'Draw fair random winners from a list, shuffle it, or split it into balanced teams. Runs in your browser.',
  }),
  component: PickerTool,
});
