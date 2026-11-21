import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, MailOpen, MoreHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem } from '@/components/ui/menu';

/**
 * The per-row actions of an inbox notification (or of a collapsed group, where each action applies to every row in
 * it): mark as read or unread, and dismiss. One menu button per row, named after the row it belongs to.
 */
export function NotificationRowMenu({
  summary,
  read,
  onToggleRead,
  onDismiss,
}: {
  /** What the row says ("Ana replied to you"), for the button's accessible name. */
  summary: string;
  read: boolean;
  onToggleRead: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation('notifications-inbox');
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('row-actions-label', {
          summary,
          defaultValue: 'Actions for: {{summary}}',
        })}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal aria-hidden />
      </Button>
      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        label={t('row-actions-menu', { defaultValue: 'Notification actions' })}
        className="w-48"
      >
        <MenuItem
          icon={read ? Mail : MailOpen}
          onSelect={() => {
            setOpen(false);
            onToggleRead();
          }}
        >
          {read
            ? t('mark-unread', { defaultValue: 'Mark as unread' })
            : t('mark-read', { defaultValue: 'Mark as read' })}
        </MenuItem>
        <MenuItem
          icon={Trash2}
          tone="danger"
          onSelect={() => {
            setOpen(false);
            onDismiss();
          }}
        >
          {t('dismiss', { defaultValue: 'Dismiss' })}
        </MenuItem>
      </AnchoredMenu>
    </>
  );
}
