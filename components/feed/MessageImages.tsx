import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PostImageGrid } from '@/components/feed/PostImageGrid';
import { cn } from '@/lib/utils';

/**
 * The images of a message, with their descriptions. Each image takes its
 * description as `alt`; the ALT button beside it names itself ("Show description
 * of image 2") and shows the text to sighted members, as on posts. An image with
 * no description keeps `alt=""` and gets visually hidden text, so a screen reader
 * still announces that an image is there and that it has no description.
 */
export function MessageImages({
  urls,
  alts,
  className,
}: {
  urls: string[];
  /** Index-aligned with `urls`; may be absent or short on a message from before descriptions. */
  alts?: string[] | undefined;
  className?: string | undefined;
}) {
  const { t } = useTranslation('message-alt-text');
  const base = useId();
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  if (urls.length === 0) return null;
  const several = urls.length > 1;
  const descriptions = urls.map((_, i) => alts?.[i]?.trim() ?? '');
  const anyDescribed = descriptions.some(Boolean);
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(i)) next.add(i);
      return next;
    });

  return (
    <div className={className}>
      <PostImageGrid urls={urls} alts={descriptions} altChip={false} className="overflow-hidden rounded-site" />
      <ul className={cn('flex flex-wrap items-start gap-1', anyDescribed ? 'mt-1' : 'sr-only')}>
        {descriptions.map((description, i) => {
          if (!description) {
            return (
              <li key={urls[i]} className="sr-only">
                {several
                  ? t('image-n-without-description', {
                      n: i + 1,
                      defaultValue: 'Image {{n}} without description',
                    })
                  : t('without-description', {
                      defaultValue: 'Image without description',
                    })}
              </li>
            );
          }
          const shown = open.has(i);
          return (
            <li key={urls[i]} className="flex max-w-full flex-col items-start gap-1">
              <button
                type="button"
                aria-expanded={shown}
                aria-controls={`${base}-${i}`}
                aria-label={
                  shown
                    ? t('hide-description', {
                        n: i + 1,
                        defaultValue: 'Hide description of image {{n}}',
                      })
                    : t('show-description', {
                        n: i + 1,
                        defaultValue: 'Show description of image {{n}}',
                      })
                }
                onClick={() => toggle(i)}
                className="t-meta inline-flex h-7 items-center rounded-site-sm border border-current px-2 pointer-coarse:h-11"
              >
                {several
                  ? t('alt-badge-n', {
                      n: i + 1,
                      defaultValue: 'ALT {{n}}',
                    })
                  : t('alt-badge', {
                      defaultValue: 'ALT',
                    })}
              </button>
              <p
                id={`${base}-${i}`}
                hidden={!shown}
                className={cn('t-body whitespace-pre-wrap break-words', !shown && 'hidden')}
              >
                {description}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
