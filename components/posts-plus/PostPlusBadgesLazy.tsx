import { Suspense, lazy, type ComponentProps } from 'react';

/**
 * `PostPlusBadges` for the feed's rows, loaded only for a post that has a series or an
 * expiry: the badges render nothing for any other post, yet every row imported them
 * statically, so the home page's critical path carried them for every visitor
 * (low-bandwidth audit, 2026-11-18). The server still renders them in full and
 * hydration keeps that markup while the code loads. The fallback is `null`, which is
 * what the series chip already shows until its own lookup returns.
 */
const PostPlusBadgesInner = lazy(() =>
  import('./PostPlusBadges').then((m) => ({
    default: m.PostPlusBadges,
  })),
);

export function PostPlusBadges(props: ComponentProps<typeof PostPlusBadgesInner>) {
  if (!props.seriesId && !props.expiresAt) return null;
  return (
    <Suspense fallback={null}>
      <PostPlusBadgesInner {...props} />
    </Suspense>
  );
}
