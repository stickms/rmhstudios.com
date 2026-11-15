import { useState } from 'react';
import { EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Wraps post media (images/GIF) flagged as sensitive. Until the viewer opts in,
 * the children are blurred behind a"Sensitive content"cover; clicking reveals
 * them. When `sensitive`is false this renders the children unchanged.
 */
export function SensitiveMedia({
  sensitive,
  children,
  className = '',
}: {
  sensitive?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const { t } = useTranslation('feed');
  const [revealed, setRevealed] = useState(false);

  // The pass-through case still has to WEAR the caller's className. It used to
  // return a bare fragment, which silently dropped it — and since callers pass
  // the media block's gutter here (`mt-2`in the feed card,`mb-3`on the post
  // page), every non-sensitive post — i.e. nearly all of them — rendered its
  // image flush against the text below it.
  if (!sensitive || revealed) {
    return className ? <div className={className}>{children}</div> : <>{children}</>;
  }

  // Not blurred (R1, B2: no filter on the site tier) and not mounted either: a solid cover in a reserved box, so the
  // picture is not fetched until the viewer opts in.
  return (
    <div className={className}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setRevealed(true);
        }}
        className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-1 rounded-site border border-site-border bg-site-bg-subtle text-center hover:bg-site-surface-hover"
      >
        <EyeOff className="size-5 text-site-text-muted" aria-hidden="true" />
        <span className="text-sm font-semibold text-site-text">
          {t('sensitive-content', { defaultValue: 'Sensitive content' })}
        </span>
        <span className="text-xs text-site-text-muted">
          {t('sensitive-content-reveal', { defaultValue: 'Click to view' })}
        </span>
      </button>
    </div>
  );
}
