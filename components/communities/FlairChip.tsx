import { cn } from '@/lib/utils';
import { FLAIR_CHIP_CLASSES, isFlairColor } from '@/lib/communities/plus-schema';

/**
 * N1 — a community flair chip. Colour is a token preset (never a raw colour),
 * so it reads on every theme. No strings of its own: the label is mod-authored.
 */
export function FlairChip({
  flair,
  className,
  as: Tag = 'span',
  ...rest
}: {
  flair: { name: string; color: string };
  className?: string;
  as?: 'span' | 'button';
} & Omit<React.HTMLAttributes<HTMLElement>, 'className'>) {
  const color = isFlairColor(flair.color) ? flair.color : 'accent';
  return (
    <Tag
      {...(Tag === 'button' ? { type: 'button' as const } : {})}
      {...rest}
      className={cn(
        'inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold leading-none',
        FLAIR_CHIP_CLASSES[color],
        className,
      )}
    >
      <span className="truncate">{flair.name}</span>
    </Tag>
  );
}
