/** s05-05 — the host's member search for inviting a co-host: type, pick from the listbox with the arrows or a tap. */
import { useId, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { api, errorField } from '@/lib/contract/client';
import { useMemberSearch } from '@/hooks/useMemberSearch';
import { inviteCohostApi } from '@/lib/events/cohosts.contract';
import type { CohostEntryDTO, CohostRefusal } from '@/lib/events/cohosts';
import { MAX_COHOSTS } from '@/lib/events/cohosts';

interface Suggestion {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
}

interface CohostInviteProps {
  eventId: string;
  /** Members who need no suggestion: the host and everyone already invited. */
  excludeIds: readonly string[];
  onInvited: (entry: CohostEntryDTO) => void;
  /** Said to assistive technology after each invitation. */
  onAnnounce: (message: string) => void;
}

export function CohostInvite({ eventId, excludeIds, onInvited, onAnnounce }: CohostInviteProps) {
  const { t } = useTranslation('event-cohosts');
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const { results, dismiss } = useMemberSearch(query, excludeIds);

  const failure = (e: unknown) => {
    const code = errorField<CohostRefusal>(e, 'code');
    if (code === 'full') {
      toast.error(t('error-full', { max: MAX_COHOSTS, defaultValue: 'An event can have at most {{max}} co-hosts.' }));
    } else if (code === 'blocked' || code === 'banned') {
      toast.error(t('error-ineligible', { defaultValue: "That member can't be invited." }));
    } else if (code === 'not-member') {
      toast.error(t('error-not-member', { defaultValue: 'That member has to join the community first.' }));
    } else if (code === 'self') {
      toast.error(t('error-self', { defaultValue: 'You already host this event.' }));
    } else if (code === 'canceled') {
      toast.error(t('error-canceled', { defaultValue: 'This event was canceled.' }));
    } else {
      toast.error(t('error-generic', { defaultValue: 'Something went wrong. Try again.' }));
    }
  };

  const pick = async (user: Suggestion) => {
    if (busy) return;
    setBusy(true);
    try {
      const { cohost } = await api(inviteCohostApi, { params: { id: eventId }, body: { userId: user.id } });
      const name = user.name ?? (user.handle ? `@${user.handle}` : t('someone', { defaultValue: 'A member' }));
      onAnnounce(t('invited-announce', { name, defaultValue: 'Invitation sent to {{name}}.' }));
      setQuery('');
      onInvited(cohost);
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      dismiss();
      return;
    }
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = results[active];
      if (chosen) void pick(chosen);
    }
  };

  const optionId = (i: number) => `${listId}-${i}`;
  const open = results.length > 0;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="t-label">
        {t('invite-label', { defaultValue: 'Invite a member' })}
      </label>
      <Input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? optionId(active) : undefined}
        autoComplete="off"
        placeholder={t('invite-placeholder', { defaultValue: 'Search by name or handle' })}
        value={query}
        disabled={busy}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      <ul id={listId} role="listbox" aria-label={t('results', { defaultValue: 'Matching members' })} hidden={!open}>
        {results.map((u, i) => (
          <li key={u.id} role="presentation" className="border-b border-site-border">
            <button
              type="button"
              role="option"
              id={optionId(i)}
              tabIndex={-1}
              aria-selected={i === active}
              className={`flex min-h-9 w-full items-center gap-3 px-1 py-2 text-start pointer-coarse:min-h-11 ${
                i === active ? 'bg-site-bg-subtle' : ''
              }`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void pick(u)}
            >
              <UserAvatar src={u.image} alt="" size={24} />
              <span className="t-body min-w-0 flex-1 truncate text-site-text">{u.name ?? u.handle}</span>
              {u.handle && <span className="t-meta truncate">@{u.handle}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
