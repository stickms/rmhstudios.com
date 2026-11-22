import { useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem } from '@/components/ui/menu';
import { SavedRepliesDialog } from '@/components/messages/SavedRepliesDialog';
import { SavedRepliesMenu } from '@/components/messages/SavedRepliesMenu';
import { recordReplyUse, useSavedRepliesQuery } from '@/components/messages/useSavedRepliesQuery';
import { suggestCommands } from '@/lib/chat-plus/commands';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  firstLine,
  insertReplyText,
  rankReplies,
  slashTrigger,
  substituteVariables,
  type SavedReplyRow,
} from '@/lib/messages/saved-replies';

/**
 * Saved replies for a composer (s05-13). The hook owns the state, so the composer hooks (`useDmComposer`,
 * `useGroupComposer`) and the ordinal `useState` seeding the characterization tests pin stay exactly as they were.
 *
 * Choosing a reply puts its text in the draft and leaves it there: sending is still the composer's own Send, so a
 * message request, a block or a rate limit applies to it as to typed text. `{{name}}` becomes the other person's name
 * in a direct conversation (`recipientName`) and stays as written in a group.
 *
 * A leading `/` and a word (`/where`) opens the same replies as a listbox on the text field. The built-in commands
 * (`/poll`, `/remind`…) keep the field while the draft names one of them; the menu button reaches every reply anyway.
 */
export function useSavedReplies({
  chatKind,
  recipientName,
  draft,
  setDraft,
  inputRef,
  maxLength,
  buttonClassName,
}: {
  chatKind: 'dm' | 'group';
  recipientName?: string | null;
  draft: string;
  setDraft: (next: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** The composer's own limit. */
  maxLength: number;
  buttonClassName?: string;
}): {
  /** The tool-row button, its menu and the manage dialog. */
  menu: ReactNode;
  /** The `/` listbox and its live region; render next to the text field. */
  popover: ReactNode;
  /** True when the key was consumed (arrows, Enter or Tab on a reply, Escape). */
  onKeyDown: (e: KeyboardEvent) => boolean;
  /** Spread on the text field: the listbox relationship. */
  fieldProps: { 'aria-expanded'?: boolean; 'aria-controls'?: string; 'aria-activedescendant'?: string };
} {
  const { t } = useTranslation('saved-replies');
  const [menuOpen, setMenuOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  const query = slashTrigger(draft);
  const commandOwnsIt = query !== null && suggestCommands(draft, chatKind).length > 0;
  const list = useSavedRepliesQuery(menuOpen || manageOpen || (query !== null && !commandOwnsIt));
  const replies = list.data ?? [];

  const matches = query !== null && !commandOwnsIt ? rankReplies(replies, query) : [];
  const popoverOpen = matches.length > 0 && dismissedFor !== draft;
  const highlight = Math.min(active, Math.max(matches.length - 1, 0));
  const listboxId = 'saved-replies-slash-list';

  /** `replaceDraft`: the `/word` trigger is the whole draft and is replaced; the menu inserts at the caret. */
  const insert = (reply: SavedReplyRow, replaceDraft: boolean) => {
    const el = inputRef.current;
    const text = substituteVariables(reply.body, chatKind === 'dm' ? recipientName : null);
    const start = replaceDraft ? 0 : (el?.selectionStart ?? draft.length);
    const end = replaceDraft ? draft.length : (el?.selectionEnd ?? start);
    const result = insertReplyText(draft, start, end, text, maxLength);
    if (!result) {
      toast.error(t('no-room', { defaultValue: 'That reply does not fit in the message.' }));
      el?.focus();
      return;
    }
    // Commit the new value now so the caret can be set on it, in this handler: a deferred focus (rAF or a timeout)
    // would run after the browser had already put the caret somewhere else.
    flushSync(() => setDraft(result.value));
    setActive(0);
    if (el) {
      el.focus();
      el.setSelectionRange(result.caret, result.caret);
    }
    recordReplyUse(reply.id);
  };

  const onKeyDown = (e: KeyboardEvent): boolean => {
    if (!popoverOpen) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((highlight + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      const reply = matches[highlight];
      if (!reply) return false;
      e.preventDefault();
      insert(reply, true);
      return true;
    }
    if (e.key === 'Escape') {
      // Leave the text as typed.
      setDismissedFor(draft);
      return true;
    }
    return false;
  };

  const menu = (
    <>
      <SavedRepliesMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onManage={() => setManageOpen(true)}
        onInsert={(reply) => insert(reply, false)}
        replies={replies}
        loading={list.isPending && menuOpen}
        failed={list.isError}
        onRetry={() => void list.refetch()}
        {...(buttonClassName ? { className: buttonClassName } : {})}
      />
      {manageOpen && (
        <SavedRepliesDialog
          open
          onOpenChange={setManageOpen}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
        />
      )}
    </>
  );

  const popover = (
    <>
      <AnchoredMenu
        open={popoverOpen}
        onClose={() => setDismissedFor(draft)}
        anchorRef={inputRef}
        side="top"
        align="start"
        role="listbox"
        focusOnOpen={false}
        label={t('slash-label', { defaultValue: 'Saved replies' })}
        className="w-72 max-w-[calc(100vw-2rem)]"
      >
        <div id={listboxId} role="group" aria-label={t('slash-label', { defaultValue: 'Saved replies' })}>
          {matches.map((reply, i) => (
            <MenuItem
              key={reply.id}
              id={`saved-reply-option-${i}`}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => e.preventDefault()}
              onSelect={() => insert(reply, true)}
              className={cn(i === highlight && 'bg-site-bg-subtle')}
            >
              <span className="block min-w-0">
                <span className="block truncate text-site-text">{reply.title}</span>
                <span className="t-meta block truncate">{firstLine(reply.body)}</span>
              </span>
            </MenuItem>
          ))}
        </div>
      </AnchoredMenu>
      <span className="sr-only" role="status">
        {popoverOpen
          ? t('slash-results', {
              count: matches.length,
              defaultValue_one: '{{count}} saved reply',
              defaultValue_other: '{{count}} saved replies',
              defaultValue: '{{count}} saved replies',
            })
          : ''}
      </span>
    </>
  );

  return {
    menu,
    popover,
    onKeyDown,
    fieldProps: popoverOpen
      ? {
          'aria-expanded': true,
          'aria-controls': listboxId,
          'aria-activedescendant': `saved-reply-option-${highlight}`,
        }
      : { 'aria-expanded': false },
  };
}
