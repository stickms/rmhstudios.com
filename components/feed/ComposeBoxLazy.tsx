'use client';

import { Suspense, lazy, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession, useResolvedUser } from '@/components/Providers';
import { buildOptimizedUrl } from '@/components/ui/OptimizedImage';
import { useIdleReady } from '@/hooks/useIdleReady';
import { readComposeDraft } from '@/hooks/useComposeDraft';

/**
 * Deferred wrapper around {@link ComposeBox}.
 *
 * The composer is the single largest deferrable module on the feed route: ~55 KB
 * of source that statically pulls in the GIF picker, the AI generate/image
 * buttons, mention/hashtag/`:emoji` autocomplete, and the compose-assist stack —
 * none of which the reader needs to see the feed. Loading all of that in the feed
 * route's initial chunk delays hydration (the tab keeps "loading" while it parses)
 * for UI that is idle until someone actually decides to post.
 *
 * So `ComposeBox` becomes its own async chunk, and this wrapper holds its place
 * with a layout-matched placeholder (no CLS) until either:
 *   - the browser goes idle after first paint (`useIdleReady`) — the common case,
 *     so the real composer is ready well before anyone reaches for it; or
 *   - the reader interacts with the placeholder; or
 *   - a saved draft is waiting (its restore prompt must surface immediately).
 *
 * The placeholder and the real composer share the same wrapper/avatar/spacing, so
 * the swap is invisible.
 */
const ComposeBox = lazy(() => import('./ComposeBox').then((m) => ({ default: m.ComposeBox })));

interface ComposeBoxLazyProps {
  communityId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onPosted?: (item: any) => void;
}

export function ComposeBoxLazy(props: ComposeBoxLazyProps) {
  const [activated, setActivated] = useState(false);
  const idle = useIdleReady();

  // A waiting draft must surface its restore prompt without a click, so mount the
  // real composer right away when one exists.
  useEffect(() => {
    try {
      if (readComposeDraft()?.content) setActivated(true);
    } catch {
      /* localStorage unavailable — fall through to idle/interaction mount */
    }
  }, []);

  if (activated || idle) {
    return (
      <Suspense fallback={<ComposePlaceholder />}>
        <ComposeBox {...props} />
      </Suspense>
    );
  }
  return <ComposePlaceholder onActivate={() => setActivated(true)} />;
}

/**
 * Static, dependency-free stand-in that mirrors the composer's resting layout
 * (avatar + input area + a faint toolbar row) so its height matches and swapping
 * in the real composer causes no layout shift. Purely presentational.
 */
function ComposePlaceholder({ onActivate }: { onActivate?: () => void }) {
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const { resolved } = useResolvedUser();

  const image = resolved?.image || session?.user?.image || null;
  const name = resolved?.name || session?.user?.name || null;
  const activate = onActivate ?? (() => {});

  return (
    <div className="px-4 py-3 border-b border-site-border">
      <div className="flex gap-3">
        {/* Avatar — matches ComposeBox's resting avatar exactly */}
        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-site-text font-bold text-sm ring-2 ring-site-bg shrink-0 overflow-hidden">
          {image ? (
            // Optimized at ~2x the 40px display size (avoids the raw CDN original).
            <img
              src={buildOptimizedUrl(image, 80, 80)}
              alt={name || t('user-alt', { defaultValue: 'User' })}
              loading="lazy"
              decoding="async"
              width={40}
              height={40}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            (name?.[0] || 'U').toUpperCase()
          )}
        </div>

        {/* Input area — a button that reads as the textarea's placeholder and
            mounts the real composer on focus/click. */}
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={activate}
            onFocus={activate}
            className="w-full min-h-[4.5rem] text-left text-base text-site-text-dim cursor-text py-1"
          >
            {t('compose-placeholder', { defaultValue: "What's on your mind?" })}
          </button>
          {/* Faint toolbar row so the placeholder's height tracks the real one. */}
          <div className="mt-1 flex items-center gap-2" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="h-8 w-8 rounded-full bg-site-surface/60" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
