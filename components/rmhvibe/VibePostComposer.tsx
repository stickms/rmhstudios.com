import { lazy, Suspense } from 'react';

// The composer loads only when a signed-in viewer presses Post.
const ComposeModal = lazy(() =>
  import('@/components/feed/ComposeModal').then((m) => ({ default: m.ComposeModal })),
);

/** The feed composer with a vibe already attached (pinned to a version). Mount it to open it. */
export function VibePostComposer({
  vibe,
  onClose,
}: {
  vibe: { slug: string; versionId: string; title: string };
  onClose: () => void;
}) {
  return (
    <Suspense fallback={null}>
      <ComposeModal open initialVibe={vibe} onClose={onClose} />
    </Suspense>
  );
}
