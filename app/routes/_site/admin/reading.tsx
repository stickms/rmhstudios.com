/**
 * /admin/reading — glossary terms (L6) and news stories (L5). Admin gating lives
 * once, in `/_site/admin/route.tsx`.
 */

import { createFileRoute } from '@tanstack/react-router';
import { AdminReadingPage } from '@/components/reading/admin/AdminReadingPage';

export const Route = createFileRoute('/_site/admin/reading')({
  head: () => ({
    meta: [
      { title: 'Reading tools | Admin | RMH Studios' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminReadingPage,
});
