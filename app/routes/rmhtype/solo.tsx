/**
 * RMH Type Solo Route
 *
 * `?text=<id>` practises one of the member's saved texts (unranked; s10-05).
 */

import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import RmhTypeSoloPage from '@/components/rmhtype/RmhTypeSoloPage';

export const Route = createFileRoute('/rmhtype/solo')({
  validateSearch: (search: Record<string, unknown>): { text?: string } =>
    typeof search.text === 'string' && search.text.length > 0 && search.text.length <= 40 ? { text: search.text } : {},
  head: () => noindexHead('Typing Practice'),
  component: RmhTypeSoloPage,
});
