/**
 * A notehead, the app's marker glyph: filled (done, a star earned), open (started / not yet), or
 * dashed (coming soon). Decoration only — every state it marks is also written out in words.
 */

import { cn } from '@/lib/utils';

export type NoteheadKind =
  | 'filled'
  | 'open'
  | 'dashed';

export function Notehead({
  kind,
  className,
}: {
  kind: NoteheadKind;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 12"
      aria-hidden="true"
      focusable="false"
      className={cn(
        'h-3 w-4 shrink-0 overflow-visible',
        className,
      )}
    >
      <ellipse
        cx="8"
        cy="6"
        rx="6.5"
        ry="4.4"
        transform="rotate(-20 8 6)"
        fill={
          kind ===
          'filled'
            ? 'currentColor'
            : 'none'
        }
        stroke="currentColor"
        strokeWidth="1.6"
        strokeDasharray={
          kind ===
          'dashed'
            ? '2.4 2'
            : undefined
        }
      />
    </svg>
  );
}
