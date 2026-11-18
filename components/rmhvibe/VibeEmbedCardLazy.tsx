import { lazy } from 'react';
import { ArrivalSuspense } from '@/components/ui/arrive';

// The card, its client module and its runner load only for posts that HAVE a
// vibe — the feed card is in the client entry, so a normal post pays nothing.
const VibeEmbedCard =
  lazy(
    () =>
      import('./VibeEmbedCard').then(
        (
          m,
        ) => ({
          default:
            m.VibeEmbedCard,
        }),
      ),
  );

export function VibeEmbedCardLazy({
  postId,
}: {
  postId: string;
}) {
  return (
    <ArrivalSuspense
      fallback={
        null
      }
    >
      <VibeEmbedCard
        postId={
          postId
        }
      />
    </ArrivalSuspense>
  );
}
