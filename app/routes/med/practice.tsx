import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { PracticePage } from '@features/medschools/ui/PracticePage';

/**
 * /med/practice: general interview questions by program, with practice mode. Noindex and out of the sitemap
 * like Ask; no loader (a static set), and practice needs no account.
 */
export const Route = createFileRoute('/med/practice')({
  head: definePage({
    path: '/med/practice',
    title: 'Interview practice | RMH Med Schools',
    description: 'General medical school interview questions by program, with a practice timer.',
    noIndex: true,
  }),
  component: PracticePage,
});
