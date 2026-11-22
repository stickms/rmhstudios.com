import { useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquareText, Settings2 } from 'lucide-react';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/menu';
import { FILTER_THRESHOLD, firstLine, rankReplies, type SavedReplyRow } from '@/lib/messages/saved-replies';
import { cn } from '@/lib/utils';

/**
 * "Saved replies" in a composer's tool row: a menu of the member's replies by recent use, a filter field once there
 * are more than eight, and "Manage saved replies". Choosing a reply only hands it to `onInsert`; nothing is sent.
 *
 * With a filter field the panel is a small tool rather than a menu: the field keeps the keyboard, Up / Down move the
 * highlight and Enter inserts it. Without one it is an ordinary roving-focus menu, so Enter on a row inserts it.
 */
export function SavedRepliesMenu({
  open,
  onOpenChange,
  onManage,
  onInsert,
  replies,
  loading,
  failed,
  onRetry,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onManage: () => void;
  onInsert: (reply: SavedReplyRow) => void;
  replies: readonly SavedReplyRow[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  className?: string;
}) {
  const { t } = useTranslation('saved-replies');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState(0);

  const filterable = replies.length > FILTER_THRESHOLD;
  const shown = useMemo(() => rankReplies(replies, filterable ? filter : ''), [replies, filter, filterable]);
  const highlight = Math.min(active, Math.max(shown.length - 1, 0));

  const close = () => {
    onOpenChange(false);
    setFilter('');
    setActive(0);
  };
  const pick = (reply: SavedReplyRow) => {
    close();
    onInsert(reply);
  };
  const label = t('menu-label', { defaultValue: 'Saved replies' });

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="default"
        size="icon"
        className={className}
        aria-label={label}
        aria-haspopup={filterable ? 'dialog' : 'menu'}
        aria-expanded={open}
        onClick={() => (open ? close() : onOpenChange(true))}
      >
        <MessageSquareText aria-hidden />
      </Button>
      <AnchoredMenu
        open={open}
        onClose={close}
        anchorRef={triggerRef}
        label={label}
        side="top"
        align="start"
        role={filterable ? 'dialog' : 'menu'}
        focusOnOpen={!filterable}
        className="w-72 max-w-[calc(100vw-2rem)]"
      >
        <MenuLabel>{label}</MenuLabel>
        {filterable && (
          <div className="px-3 pb-2">
            <Input
              autoFocus
              value={filter}
              aria-label={t('filter-label', { defaultValue: 'Filter saved replies' })}
              placeholder={t('filter-placeholder', { defaultValue: 'Filter by title' })}
              aria-controls={listId}
              aria-activedescendant={shown[highlight] ? `${listId}-${shown[highlight].id}` : undefined}
              onChange={(e) => {
                setFilter(e.target.value);
                setActive(0);
              }}
              // The panel's own handler is a typeahead over its rows; the field must type, so it keeps its keys.
              onKeyDown={(e) => {
                if (e.key === 'Escape') return;
                e.stopPropagation();
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive(Math.min(highlight + 1, shown.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive(Math.max(highlight - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  const reply = shown[highlight];
                  if (reply) pick(reply);
                }
              }}
            />
          </div>
        )}
        <div id={listId} role="group" aria-label={label}>
          {loading ? (
            <p className="t-meta px-3 py-2">{t('loading', { defaultValue: 'Loading…' })}</p>
          ) : failed ? (
            <>
              <p className="t-body px-3 py-2 text-site-text-muted">
                {t('load-failed', { defaultValue: 'Could not load your saved replies' })}
              </p>
              <MenuItem onSelect={onRetry}>{t('retry', { defaultValue: 'Try again' })}</MenuItem>
            </>
          ) : replies.length === 0 ? (
            <p className="t-body px-3 py-2 text-site-text-muted">
              {t('menu-empty', { defaultValue: 'No saved replies yet.' })}
            </p>
          ) : shown.length === 0 ? (
            <p className="t-body px-3 py-2 text-site-text-muted">
              {t('menu-no-match', { defaultValue: 'No reply matches.' })}
            </p>
          ) : (
            shown.map((reply, i) => (
              <MenuItem
                key={reply.id}
                id={`${listId}-${reply.id}`}
                className={cn(filterable && i === highlight && 'bg-site-bg-subtle')}
                onSelect={() => pick(reply)}
              >
                <span className="block min-w-0">
                  <span dir="auto" className="block truncate text-site-text">
                    {reply.title}
                  </span>
                  <span dir="auto" className="t-meta block truncate">
                    {firstLine(reply.body)}
                  </span>
                </span>
              </MenuItem>
            ))
          )}
        </div>
        <MenuSeparator />
        <MenuItem
          icon={Settings2}
          onSelect={() => {
            close();
            onManage();
          }}
        >
          {t('manage', { defaultValue: 'Manage saved replies' })}
        </MenuItem>
      </AnchoredMenu>
    </>
  );
}
