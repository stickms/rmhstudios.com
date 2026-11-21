import type { RefObject } from 'react';
import { PenSquare, Repeat } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem } from '@/components/ui/menu';
import { QuotesMenuItem } from './QuotesMenuItem';

/**
 * A post's repost menu: repost (or undo), quote, and view quotes.
 *
 * Its own chunk, mounted by `RMHarkActions` the first time the menu is opened and
 * fetched when the reader reaches for the button (pointer or focus), because every
 * post row used to carry the menu primitive it is drawn with, on the home feed's
 * critical path, for a menu most visits never open and a signed-out visitor never
 * can (low-bandwidth audit, 2026-11-18). AnchoredMenu portals to <body> and owns the
 * open and close animation, as before.
 */
export default function RepostMenu({
  open,
  onClose,
  anchorRef,
  label,
  reposted,
  repostCount,
  onRepost,
  onQuote,
  onViewQuotes,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
  label: string;
  reposted: boolean;
  repostCount: number;
  onRepost: () => void;
  onQuote: () => void;
  onViewQuotes: () => void;
}) {
  const { t } = useTranslation('feed');
  return (
    <AnchoredMenu
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      align="start"
      // Named after its trigger, so the panel's accessible name is not English-only.
      label={label}
      // Wide enough that "Undo repost" does not truncate inside the panel's own padding.
      className="w-48"
    >
      <MenuItem icon={Repeat} onSelect={onRepost}>
        {reposted
          ? t('action-undo-repost', {
              defaultValue: 'Undo repost',
            })
          : label}
      </MenuItem>
      <MenuItem icon={PenSquare} onSelect={onQuote}>
        {t('quote', {
          defaultValue: 'Quote',
        })}
      </MenuItem>
      {repostCount > 0 && <QuotesMenuItem onSelect={onViewQuotes} />}
    </AnchoredMenu>
  );
}
