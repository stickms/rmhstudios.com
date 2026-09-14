'use client';

/**
 * The invite picker — who gets rung when an ad-hoc group call starts.
 *
 * This is the multi-select generalisation of `MessagesColumn`'s `NewChatDialog`
 * (single-select, not exported) and the replacement for `GroupChatsColumn`'s
 * comma-separated handles field. It is worth being a real picker for one reason:
 * a group call is synchronous, so the only question that matters while choosing
 * is **who is actually reachable right now**. `/api/groupcalls/invitable` answers
 * exactly that — online mutuals first, with a query extending rather than
 * replacing them — so the default list (no `q`) is already the right answer most
 * of the time and the search box is the exception.
 *
 * The cap is {@link MAX_GROUP_CALL_INVITES}, which is the room cap minus the
 * host. It is enforced here so the count the user sees agrees with what the
 * server will do: `START` truncates the list rather than refusing the call, so a
 * picker that let someone choose ten would silently drop three of them.
 *
 * Appearing in this list is not permission to be rung — blocks and call-privacy
 * are decided on the hub, per invitee, when the invite is actually sent, and a
 * refused invitee is dropped silently. Nothing here should be read as a promise
 * that a given person's phone will buzz.
 *
 * Keyboard: the dialog traps focus (Radix), the field takes it on open, ArrowDown
 * moves into the results and ArrowUp at the top comes back, Enter/Space toggles a
 * row (they are ordinary buttons carrying `aria-pressed`), and Backspace in an
 * empty field removes the last chip. Every chip's remove control is a named
 * button in the tab order, so the arrow keys are an accelerator and never the
 * only way through.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, UserSearch, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { Spinner } from '@/components/ui/spinner';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { MAX_GROUP_CALL_INVITES } from '@/lib/groupcall/events';
import { cn } from '@/lib/utils';

/**
 * One person as the picker shows them.
 *
 * Mirrors `InvitableUser` in `lib/groupcall.server.ts` — declared here rather
 * than imported because that module is server-only, and a component may not
 * reach into `.server` code even for a type. The optional fields are the ones a
 * *seeded* person (the other half of a DM, say) may not carry; everything the
 * API returns fills them all in.
 */
export interface InvitablePerson {
  id: string;
  name: string | null;
  handle: string | null;
  username?: string | null;
  image?: string | null;
  /** Reachable right now. Unknown for a seeded person until the list loads. */
  online?: boolean;
}

export interface GroupCallInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * People selected the moment the dialog opens — the DM you pressed call from,
   * the profile you are looking at. Re-applied every time it opens.
   */
  seed?: readonly InvitablePerson[];
  /** How many may be picked. Defaults to {@link MAX_GROUP_CALL_INVITES}. */
  max?: number;
  /** Label on the confirm button, when "Start call" is not what it does. */
  confirmLabel?: string;
  /** The chosen ids, in the order they were picked. */
  onConfirm: (userIds: string[]) => void;
}

/** Long enough that a fast typist sends one request, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 250;

const INVITABLE_URL = '/api/groupcalls/invitable';

/** The best name we have, in the order a person would recognise themselves. */
function displayName(person: InvitablePerson, fallback: string): string {
  const name = person.name?.trim();
  if (name) return name;
  if (person.handle) return `@${person.handle}`;
  return person.username?.trim() || fallback;
}

export function GroupCallInviteDialog({
  open,
  onOpenChange,
  seed,
  max = MAX_GROUP_CALL_INVITES,
  confirmLabel,
  onConfirm,
}: GroupCallInviteDialogProps) {
  const { t } = useTranslation('c-groupcall');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<InvitablePerson[]>([]);
  const [loading, setLoading] = useState(false);
  /**
   * Keyed by id and holding the whole person, not just the id: a chip has to
   * keep its name and avatar after the search that produced it has been typed
   * away, and the results list is no longer there to look them up in.
   */
  const [picked, setPicked] = useState<Map<string, InvitablePerson>>(new Map());

  const searchRef = useRef<HTMLInputElement | null>(null);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const wasOpen = useRef(false);

  const unnamed = t('someone', { defaultValue: 'Someone' });

  // Seeded on the closed→open edge only. Re-applying whenever `seed` changed
  // identity would wipe a half-made selection every time the host surface
  // happened to re-render — which, in a conversation, is on every keystroke.
  useEffect(() => {
    if (open && !wasOpen.current) {
      setQuery('');
      setPicked(new Map((seed ?? []).map((person) => [person.id, person])));
    }
    wasOpen.current = open;
  }, [open, seed]);

  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    const controller = new AbortController();
    let live = true;

    const load = async () => {
      setLoading(true);
      try {
        const url = term ? `${INVITABLE_URL}?q=${encodeURIComponent(term)}` : INVITABLE_URL;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { users?: InvitablePerson[] };
        if (live) setResults(body.users ?? []);
      } catch {
        if (live) setResults([]);
      } finally {
        if (live) setLoading(false);
      }
    };

    // The default list is not a search, so it should not wait out a debounce the
    // user never triggered.
    const timer = window.setTimeout(() => void load(), term ? SEARCH_DEBOUNCE_MS : 0);
    return () => {
      live = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query]);

  const remaining = Math.max(0, max - picked.size);
  const atCap = remaining === 0;

  const toggle = useCallback(
    (person: InvitablePerson) => {
      setPicked((current) => {
        const next = new Map(current);
        if (next.delete(person.id)) return next;
        // Guarded as well as disabled at the call site: the cap is a contract
        // with the server, not a styling decision.
        if (next.size >= max) return current;
        next.set(person.id, person);
        return next;
      });
    },
    [max],
  );

  const remove = useCallback((id: string) => {
    setPicked((current) => {
      const next = new Map(current);
      return next.delete(id) ? next : current;
    });
  }, []);

  const chips = useMemo(() => [...picked.values()], [picked]);

  const focusRow = (index: number) => {
    const row = rowRefs.current[index];
    if (row) row.focus();
  };

  const onFieldKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && results.length > 0) {
      event.preventDefault();
      focusRow(0);
      return;
    }
    if (event.key === 'Backspace' && event.currentTarget.value === '' && chips.length > 0) {
      event.preventDefault();
      remove(chips[chips.length - 1].id);
    }
  };

  const onRowKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusRow(Math.min(index + 1, results.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (index === 0) searchRef.current?.focus();
      else focusRow(index - 1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('invite-title', { defaultValue: 'Invite to the call' })}</DialogTitle>
          <DialogDescription>
            {t('invite-subtitle', {
              defaultValue: 'Pick who to ring. People who are online can answer right away.',
            })}
          </DialogDescription>
        </DialogHeader>

        {chips.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {chips.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => remove(person.id)}
                  aria-label={t('invite-remove', {
                    name: displayName(person, unnamed),
                    defaultValue: 'Remove {{name}}',
                  })}
                  className="glass-fill flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 text-xs font-medium text-site-text transition-colors duration-150 hover:bg-site-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent/50"
                >
                  <UserAvatar
                    src={person.image ?? undefined}
                    alt=""
                    size={18}
                    fallbackName={person.name ?? undefined}
                  />
                  <span className="max-w-32 truncate">{displayName(person, unnamed)}</span>
                  <X className="h-3 w-3 text-site-text-dim" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        <SearchField
          ref={searchRef}
          autoFocus
          value={query}
          onValueChange={setQuery}
          onKeyDown={onFieldKeyDown}
          placeholder={t('invite-search', { defaultValue: 'Search people' })}
          trailing={loading ? <Spinner size={16} /> : null}
        />

        <div className="max-h-[min(50vh,20rem)] overflow-y-auto">
          {loading && results.length === 0 ? (
            <div className="flex justify-center py-8">
              <Spinner size={20} />
            </div>
          ) : results.length === 0 ? (
            <EmptyState
              icon={UserSearch}
              description={
                query.trim()
                  ? t('invite-no-results', { defaultValue: 'Nobody matches that.' })
                  : t('invite-empty', { defaultValue: 'Nobody to invite yet' })
              }
            />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {results.map((person, index) => {
                const selected = picked.has(person.id);
                return (
                  <li key={person.id}>
                    <button
                      ref={(element) => {
                        rowRefs.current[index] = element;
                      }}
                      type="button"
                      aria-pressed={selected}
                      disabled={!selected && atCap}
                      onClick={() => toggle(person)}
                      onKeyDown={(event) => onRowKeyDown(event, index)}
                      className={cn(
                        'glass-fill flex w-full items-center gap-3 rounded-site px-3 py-2 text-left',
                        'transition-[background-color,border-color] duration-150 hover:bg-site-surface-hover',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent/50',
                        'disabled:cursor-not-allowed disabled:opacity-45',
                        selected && 'border-site-accent',
                      )}
                    >
                      <span className="relative inline-flex shrink-0">
                        <UserAvatar
                          src={person.image ?? undefined}
                          alt=""
                          size={32}
                          fallbackName={person.name ?? undefined}
                        />
                        {person.online && (
                          <span
                            className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-site-bg bg-site-success"
                            aria-hidden
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-site-text">
                          {displayName(person, unnamed)}
                        </span>
                        {person.handle && (
                          <span className="block truncate text-xs text-site-text-dim">
                            @{person.handle}
                          </span>
                        )}
                      </span>
                      {person.online && (
                        <span className="shrink-0 text-xs font-medium text-site-success">
                          {t('invite-online', { defaultValue: 'Online' })}
                        </span>
                      )}
                      {selected && (
                        <Check className="h-4 w-4 shrink-0 text-site-accent" aria-hidden />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="sm:items-center sm:justify-between">
          <p className="text-xs text-site-text-muted" aria-live="polite">
            {atCap
              ? t('invite-max', {
                  count: max,
                  defaultValue: 'You can invite up to {{count}} person at once',
                  defaultValue_other: 'You can invite up to {{count}} people at once',
                })
              : t('invite-remaining', {
                  count: remaining,
                  defaultValue: '{{count}} more can join',
                  defaultValue_other: '{{count}} more can join',
                })}
          </p>
          <div className="flex gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('invite-cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              type="button"
              variant="accent"
              disabled={chips.length === 0}
              onClick={() => onConfirm(chips.map((person) => person.id))}
            >
              {confirmLabel ?? t('invite-confirm', { defaultValue: 'Start call' })}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
