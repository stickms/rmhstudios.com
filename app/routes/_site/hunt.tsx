import { createFileRoute } from '@tanstack/react-router';
import { HuntPage } from '@/components/delight/HuntPage';
import { noindexHead } from '@/lib/seo';

export const Route = createFileRoute('/_site/hunt')({
  head: () => noindexHead('The hunt'),
  component: HuntPage,
});
