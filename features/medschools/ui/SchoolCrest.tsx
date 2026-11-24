import { crestSrc } from '../engine/crests';

export type CrestSize = 20 | 24 | 40 | 76;

const BOX: Record<CrestSize, string> = {
  20: 'medapp-crest--20',
  24: 'medapp-crest--24',
  40: 'medapp-crest--40',
  76: 'medapp-crest--76',
};
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
 * A school's crest in a small rounded picture box (`.medapp-crest`: `--app-bg-subtle`, 1px `--app-border`), or its initials when there is none.
 * Decorative: the school's name is always printed beside it, so the image has an empty alt and the initials are
 * hidden from assistive technology.
 */
export function SchoolCrest({ slug, name, size = 24 }: { slug: string; name: string; size?: CrestSize }) {
  const src = crestSrc(slug);
  return (
    <span className={`medapp-crest ${BOX[size]}`}>
      {src ? (
        <img src={src} width={size} height={size} loading="lazy" decoding="async" alt="" />
      ) : (
        <span aria-hidden="true">{crestInitials(name)}</span>
      )}
    </span>
  );
}
