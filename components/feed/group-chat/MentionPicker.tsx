import { useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { cn } from '@/lib/utils';
import { insertMention, mentionTrigger, rankMembers, type PickerMember } from '@/lib/group-chat/mentions';

import { Handle } from '@/components/ui/handle';
const LISTBOX_ID = 'group-mention-list';
const optionId = (i: number) => `group-mention-option-${i}`;

/**
 * The `@` member picker for the group composer (s07-05). Typing `@` and some letters lists the group's members from the
 * list the group view already has (no server search); ArrowUp/ArrowDown move, Enter or Tab inserts `@handle `, Escape
 * leaves the text as typed. The text field keeps focus, so the listbox is described with `aria-activedescendant`.
 */
export function useMentionPicker({
  members,
  viewerId,
  draft,
  setDraft,
  inputRef,
  maxLength,
}: {
  members: readonly PickerMember[];
  viewerId: string;
  draft: string;
  setDraft: (next: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  maxLength: number;
}): {
  popover: ReactNode;
  /** True when the key was consumed. */
  onKeyDown: (e: KeyboardEvent) => boolean;
  open: boolean;
  fieldProps: {
    'aria-expanded': boolean;
    'aria-controls'?: string;
    'aria-activedescendant'?: string;
  };
} {
  const { t } = useTranslation('group-mentions');
  const [active, setActive] = useState(0);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  const caret = inputRef.current?.selectionStart ?? draft.length;
  const trigger = mentionTrigger(draft, caret);
  const matches = trigger ? rankMembers(members, trigger.query, viewerId) : [];
  const open = matches.length > 0 && dismissedFor !== draft;
  const highlight = Math.min(active, Math.max(matches.length - 1, 0));

  const choose = (member: PickerMember) => {
    if (!trigger || !member.handle) return;
    const result = insertMention(draft, trigger, member.handle, maxLength);
    const el = inputRef.current;
    if (!result) {
      el?.focus();
      return;
    }
    // Commit the value now so the caret can be set on it in this handler (no deferred focus).
    flushSync(() => setDraft(result.value));
    setActive(0);
    if (el) {
      el.focus();
      el.setSelectionRange(result.caret, result.caret);
    }
  };

  const onKeyDown = (e: KeyboardEvent): boolean => {
    if (!open) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((highlight + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      const member = matches[highlight];
      if (!member) return false;
      e.preventDefault();
      choose(member);
      return true;
    }
    if (e.key === 'Escape') {
      setDismissedFor(draft);
      return true;
    }
    return false;
  };

  const popover = (
    <>
      {open && (
        <div className="surface-overlay absolute bottom-full start-0 z-20 mb-1 w-72 max-w-[calc(100vw-2rem)] rounded-site">
          <ul
            id={LISTBOX_ID}
            className="divide-y divide-site-border"
            role="listbox"
            aria-label={t('picker-label', {
              defaultValue: 'Members to mention',
            })}
          >
            {matches.map((m, i) => (
              // Keys go to the text field (aria-activedescendant); the click is the pointer path to the same choice.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <li
                key={m.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(m)}
                className={cn(
                  'flex min-h-9 cursor-pointer items-center gap-2 px-3 py-1.5 pointer-coarse:min-h-11',
                  i === highlight && 'bg-site-bg-subtle',
                )}
              >
                <UserAvatar
                  src={m.image}
                  alt=""
                  size={24}
                  fallbackName={m.name ?? undefined}
                  className="rounded-full"
                />
                <span className="t-body min-w-0 flex-1 truncate">{m.name || <Handle handle={m.handle} />}</span>
                <span className="t-meta truncate">
                  <Handle handle={m.handle} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <span className="sr-only" role="status">
        {open
          ? t('picker-results', {
              count: matches.length,
              defaultValue_one: '{{count}} member',
              defaultValue_other: '{{count}} members',
              defaultValue: '{{count}} members',
            })
          : ''}
      </span>
    </>
  );

  return {
    popover,
    onKeyDown,
    open,
    fieldProps: open
      ? {
          'aria-expanded': true,
          'aria-controls': LISTBOX_ID,
          'aria-activedescendant': optionId(highlight),
        }
      : {
          'aria-expanded': false,
        },
  };
}
