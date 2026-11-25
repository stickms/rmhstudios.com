/**
 * RMH Type Solo Route
 *
 * `?text=<id>` practises one of the member's saved texts (unranked; s10-05).
 * `?challenge=<id>` races a challenge the member received (s11-12): the server checks it is theirs and starts it once.
 */

import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import RmhTypeSoloPage from '@/components/rmhtype/RmhTypeSoloPage';

export const Route = createFileRoute('/rmhtype/solo')({
  validateSearch: (search: Record<string, unknown>): { text?: string; challenge?: string } => ({
    ...(typeof search.text === 'string' && search.text.length > 0 && search.text.length <= 40
      ? { text: search.text }
      : {}),
    ...(typeof search.challenge === 'string' && search.challenge.length > 0 && search.challenge.length <= 40
      ? { challenge: search.challenge }
      : {}),
  }),
  head: () => noindexHead('Typing Practice'),
  component: RmhTypeSoloPage,
});
