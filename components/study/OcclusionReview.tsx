import { useTranslation } from 'react-i18next';
import type { CardImage } from '@/lib/study/card-images';
import { labelOf, maskLayout, partOf, type OcclusionReviewData } from '@/lib/study/occlusion';

/** A picture-relative number as a CSS percentage, without float noise (0.3 * 100 is 30.000000000000004). */
export const pct = (n: number): string => `${Math.round(n * 10_000) / 100}%`;

/**
 * A picture with its masks drawn over it (s09-03). The masks are absolutely positioned elements over the `<img>`, in
 * picture-relative percentages (no canvas: the site tier draws none, B3). The one being asked is filled in the ink
 * colour and outlined; in hide-all mode every other mask is filled in the muted colour; on the reveal the target mask
 * lifts and the others stay. Flat fills on tokens, nothing animates. The masks are decoration for the eye: the screen
 * reader hears the picture's description, then which part is covered (`OcclusionAnnouncement`).
 */
export function OcclusionPicture({
  image,
  data,
  reveal,
  eager = true,
  className = '',
}: {
  image: CardImage;
  data: OcclusionReviewData;
  reveal: boolean;
  eager?: boolean;
  className?: string;
}) {
  const drawn = maskLayout({ mode: data.mode, masks: data.masks }, data.targetId, reveal);
  return (
    <div
      className={`relative inline-block max-w-full overflow-hidden rounded-site border border-site-border bg-site-bg-subtle ${className}`}
    >
      <img
        src={image.url}
        alt={image.alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className="block max-h-[45vh] w-auto max-w-full"
      />
      {drawn.map((m) => (
        <span
          key={m.id}
          aria-hidden="true"
          data-mask={m.state}
          className={`pointer-events-none absolute ${
            m.state === 'target' ? 'border-2 border-site-bg bg-site-text' : 'bg-site-text-muted'
          }`}
          style={{
            left: pct(m.x),
            top: pct(m.y),
            width: pct(m.w),
            height: pct(m.h),
          }}
        />
      ))}
    </div>
  );
}

/** "Covered part N of M", read by a screen reader after the picture's description (visually hidden). */
export function OcclusionAnnouncement({ data }: { data: OcclusionReviewData }) {
  const { t } = useTranslation('occlusion-cards');
  const { n, of } = partOf({ mode: data.mode, masks: data.masks }, data.targetId);
  return <p className="sr-only">{t('covered-part', { defaultValue: 'Covered part {{n}} of {{of}}', n, of })}</p>;
}

/**
 * The review face of an occlusion card: the prompt (the author's, or "Name the covered part"), the picture with its
 * masks, and after the reveal the target's label (announced politely) and the author's note. The answer is always
 * text, never only a region of the picture.
 */
export function OcclusionReview({
  image,
  prompt,
  data,
  revealed,
}: {
  image: CardImage;
  prompt: string;
  data: OcclusionReviewData;
  revealed: boolean;
}) {
  const { t } = useTranslation('occlusion-cards');
  const label = labelOf({ mode: data.mode, masks: data.masks }, data.targetId);
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <p dir="auto" className="t-heading break-words">
        {prompt.trim() || t('default-prompt', { defaultValue: 'Name the covered part' })}
      </p>
      <OcclusionPicture image={image} data={data} reveal={revealed} />
      <OcclusionAnnouncement data={data} />
      <div aria-live="polite" className="flex flex-col items-center gap-2">
        {revealed && label !== null && (
          <>
            <p dir="auto" className="t-prose break-words text-site-text">
              <span className="sr-only">{t('answer-prefix', { defaultValue: 'Answer: ' })}</span>
              {label}
            </p>
            {data.note !== '' && (
              <p dir="auto" className="t-prose whitespace-pre-wrap break-words text-site-text-muted">
                {data.note}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
