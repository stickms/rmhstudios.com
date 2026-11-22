import { createContext, useContext, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CoveredLine } from '@/components/feed/CoveredLine';
import { useAppliedContentWarning } from '@/components/feed/use-show-content-warnings';
import type { ContentWarningSubject } from '@/lib/feed/content-warning';

/** True inside a post the viewer has revealed, so the media cover inside it does not ask a second time. */
export const WarningRevealedContext = createContext(false);

/**
 * The covered state of a post with a content warning reason (sprint 06 #16): a line of text on a rule with one button,
 * not a blurred or tinted box (R1, B2). The reason is read before the button; "Show post" is a button with
 * `aria-expanded` that controls the revealed region, and "Hide" covers the post again. Revealing is per post per page
 * view and is never saved. The children (text and media) are not mounted until revealed, so no picture is fetched.
 *
 * A viewer who chose "Show them", and the author, see the post with the reason as a plain label. A post without a
 * reason passes through untouched: its media is covered by `SensitiveMedia`, as it always was.
 */
export function ContentWarningCover({
  post,
  children,
  className = '',
}: {
  post: ContentWarningSubject;
  children: React.ReactNode;
  className?: string;
}) {
  const { t } = useTranslation('content-warnings');
  const applied = useAppliedContentWarning(post);
  const [revealed, setRevealed] = useState(false);
  const regionId = useId();
  const reasonId = useId();

  if (!applied.coverText && !applied.showLabel) return <>{children}</>;

  if (applied.showLabel) {
    return (
      <div className={className}>
        <p className="t-meta mt-1 break-words border-b border-site-border pb-1">
          {t('label', { reason: applied.reason, defaultValue: 'Content warning: {{reason}}' })}
        </p>
        <WarningRevealedContext.Provider value={true}>{children}</WarningRevealedContext.Provider>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="mt-1 flex items-center justify-between gap-3 border-b border-site-border pb-2">
        <CoveredLine id={reasonId} reason={applied.reason} className="t-body min-w-0 break-words text-site-text" />
        <Button
          type="button"
          size="sm"
          aria-expanded={revealed}
          aria-controls={regionId}
          aria-describedby={reasonId}
          onClick={(e) => {
            e.stopPropagation();
            setRevealed((v) => !v);
          }}
        >
          {revealed ? t('hide-post', { defaultValue: 'Hide' }) : t('show-post', { defaultValue: 'Show post' })}
        </Button>
      </div>
      <div id={regionId} hidden={!revealed}>
        {revealed ? <WarningRevealedContext.Provider value={true}>{children}</WarningRevealedContext.Provider> : null}
      </div>
    </div>
  );
}

/** Whether a surrounding cover has been opened (read by `SensitiveMedia`). */
export function useWarningRevealed(): boolean {
  return useContext(WarningRevealedContext);
}
