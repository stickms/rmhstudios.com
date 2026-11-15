import { Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';

interface AutomatedBadgeProps {
  /** Size of the glyph. It defaults to 14px, the size of the other marks beside a name. */
  className?: string;
  /** What the tooltip says, where a surface has more to say than "Automated" (the profile). */
  tip?: string;
}

/**
 * D4: marks posts, conversations and profiles from accounts flagged as automated.
 *
 * It is the bot icon alone, in muted ink (owner, 2026-11-13: "instead of saying 'automated' just show the bot icon
 * (and on hover show 'automated' in a popover)"). The word arrives in the shared `Tooltip` on hover and on keyboard
 * focus; the icon's accessible name is "Automated account" either way.
 *
 * Everywhere it renders it sits inside a link (the author line, a conversation row), so it cannot be a button. It is a
 * focusable image instead, and a press on it belongs to it: the press focuses it, which shows the tooltip, and is not
 * passed to the link. That is what makes the word reachable by touch, where there is no hover. Its hit area is 44px on
 * a coarse pointer, and it stacks above a row link's stretched `::after` so the pointer reaches it.
 */
export function AutomatedBadge({ className, tip }: AutomatedBadgeProps) {
  const { t } = useTranslation('f-devplatform');
  return (
    <Tooltip content={tip ?? t('automated-label', { defaultValue: 'Automated' })}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- an image with a tooltip: focus is how a keyboard and a finger reach it, and the press only keeps the surrounding link from firing */}
      <span
        role="img"
        tabIndex={0}
        data-slot="automated-badge"
        aria-label={t('automated-hint', { defaultValue: 'Automated account' })}
        className="relative z-content inline-flex shrink-0 cursor-default rounded-site-sm text-site-text-muted after:absolute after:-inset-1 after:content-[''] pointer-coarse:after:-inset-3.5"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.focus();
        }}
      >
        <Bot className={cn('size-3.5', className)} aria-hidden />
      </span>
    </Tooltip>
  );
}
