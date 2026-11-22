import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { DiceTool } from '@/components/toolbox/dice/DiceTool';

export const Route = createFileRoute('/_site/tools/dice')({
  head: definePage({
    path: '/tools/dice',
    title: 'Dice Roller | RMH Studios',
    description: 'Roll any dice in standard notation: 2d6+3, 4d6kh3, advantage with 2d20kh1, exploding dice and more.',
  }),
  component: DiceTool,
});
