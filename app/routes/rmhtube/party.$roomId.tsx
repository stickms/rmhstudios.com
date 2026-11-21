/**
 * RMHTube watch party page — /rmhtube/party/$roomId. Sits under the RMHTube layout (sign-in gate and theme).
 * Never indexed: the page is behind the sign-in, and a link-only party must not be found by search.
 */
import { createFileRoute } from '@tanstack/react-router';
import {
  buildMeta,
  ogCardPath,
} from '@/lib/seo';
import PartyPage from '@/components/rmhtube/party/PartyPage';

export const Route =
  createFileRoute(
    '/rmhtube/party/$roomId',
  )(
    {
      head: () => ({
        meta: [
          ...buildMeta(
            {
              title:
                'RMHTube watch party | RMH Studios',
              description:
                'A scheduled watch party on RMHTube: when it starts, who is going, and a link to join.',
              path: '/rmhtube',
              image:
                ogCardPath(
                  'app',
                  'rmhtube',
                ),
              imageAlt:
                'RMHTube on RMH Studios.',
            },
          ),
          {
            name: 'robots',
            content:
              'noindex, follow',
          },
        ],
      }),
      component:
        PartyPage,
    },
  );
