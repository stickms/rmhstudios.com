import { createFileRoute } from '@tanstack/react-router';
import { TranslatePage } from '@/components/delight/TranslatePage';
import { noindexHead } from '@/lib/seo';

export const Route = createFileRoute('/_site/translate')({
  head: () => noindexHead('Community translations'),
  component: TranslatePage,
});
