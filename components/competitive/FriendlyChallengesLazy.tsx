import { lazy, Suspense, useEffect, useState } from 'react';
import { useSession } from '@/components/Providers';

const FriendlyChallenges = lazy(() => import('./FriendlyChallenges'));

/** Below-the-fold on /ranked: nothing loads until the page is idle and the viewer is signed in. */
export function FriendlyChallengesLazy() {
  const { data: session } = useSession();
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => setIdle(true));
    else setIdle(true);
  }, []);
  if (!idle || !session?.user?.id) return null;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-8">
      <Suspense fallback={null}>
        <FriendlyChallenges />
      </Suspense>
    </div>
  );
}
