import { crestSrc } from '../engine/crests';

export type CrestSize = 20 | 24 | 40;

const BOX: Record<CrestSize, string> = { 20: 'size-5', 24: 'size-6', 40: 'size-10' };
const SKIP = new Set(['the', 'of', 'at', 'and', 'for']);

/** Up to two capitals from the significant words of a school name ("Harvard Medical School" is "HM"). */
export function crestInitials(name: string): string {
  return name
    .split(/[\s\-–,()]+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !SKIP.has(w.toLowerCase()))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/**
 * A school's crest in a picture box (--site-bg-subtle, 1px rule, 4px radius), or its initials when there is none.
 * Decorative: the school's name is always printed beside it, so the image has an empty alt and the initials are
 * hidden from assistive technology.
 */
export function SchoolCrest({ slug, name, size = 24 }: { slug: string; name: string; size?: CrestSize }) {
  const src = crestSrc(slug);
  return (
    <span
      className={`${BOX[size]} bg-site-bg-subtle border-site-border rounded-site-sm inline-flex shrink-0 items-center justify-center overflow-hidden border`}
    >
      {src ? (
        <img src={src} width={size} height={size} loading="lazy" decoding="async" alt="" className="object-contain" />
      ) : (
        <span className="t-meta" aria-hidden="true">
          {crestInitials(name)}
        </span>
      )}
    </span>
  );
}
