/**
 * s05-15 — the viewer's side of a jam entry's team, on the jam page:
 *  - the submitter: who is invited or on the team (rows on rules), Remove, and the member search to invite;
 *  - an accepted teammate: a way to leave;
 *  - an invited member: Accept (the view's one ink primary) and Decline.
 * Everything is read-only once submissions close. State changes are announced in a polite live region.
 */
import { useId, useState, type KeyboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useArrival } from '@/components/ui/arrive';
import { api, apiQuery, errorField } from '@/lib/contract/client';
import { useMemberSearch } from '@/hooks/useMemberSearch';
import {
  inviteTeammateApi,
  listTeamApi,
  removeTeammateApi,
  respondTeamApi,
} from '@/lib/competitive/jam-teams.contract';
import {
  MAX_TEAMMATES,
  creditNames,
  listNames,
  personLabel,
  type TeamEntryDTO,
  type TeamPersonDTO,
  type TeamRefusal,
  type ViewerTeamState,
} from '@/lib/competitive/jam-teams';

interface JamTeamPanelProps {
  slug: string;
  entryId: string;
  /** What the viewer is to this entry, as the jam page computed it. */
  state: ViewerTeamState;
  /** Whether submissions are still open; the team is read-only afterwards. */
  open: boolean;
  /** The viewer's own id (needed to leave). */
  viewerId: string;
  /** The team changed in a way the entry rows show (accepted, declined, left); the page reloads. */
  onChanged: () => void;
}

interface Suggestion {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
}

/** The one place a refusal becomes a sentence for the person who hit it. */
function useRefusalToast() {
  const { t } = useTranslation('jam-teams');
  return (e: unknown) => {
    const code = errorField<TeamRefusal>(e, 'code');
    const anotherEntry = t('another-entry', { defaultValue: 'another entry' });
    if (code === 'already-on-entry') {
      toast.error(
        t('error-on-entry', {
          entry: errorField<string>(e, 'entry') ?? anotherEntry,
          defaultValue: 'You are already on {{entry}}.',
        }),
      );
    } else if (code === 'full') {
      toast.error(t('error-full', { max: MAX_TEAMMATES, defaultValue: 'A team can have at most {{max}} teammates.' }));
    } else if (code === 'blocked' || code === 'banned') {
      toast.error(t('error-ineligible', { defaultValue: "That member can't be invited." }));
    } else if (code === 'closed') {
      toast.error(t('error-closed', { defaultValue: 'Submissions are closed, so the team can no longer change.' }));
    } else if (code === 'no-invite' || code === 'not-found') {
      toast.error(t('error-gone', { defaultValue: 'That invitation is no longer open.' }));
    } else {
      toast.error(t('error-generic', { defaultValue: 'Something went wrong. Try again.' }));
    }
  };
}

function TeamInvite({
  slug,
  entryId,
  excludeIds,
  onInvited,
  onAnnounce,
}: {
  slug: string;
  entryId: string;
  excludeIds: readonly string[];
  onInvited: (member: TeamEntryDTO) => void;
  onAnnounce: (message: string) => void;
}) {
  const { t } = useTranslation('jam-teams');
  const failed = useRefusalToast();
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const { results, dismiss } = useMemberSearch(query, excludeIds);

  const pick = async (user: Suggestion) => {
    if (busy) return;
    setBusy(true);
    try {
      const { member } = await api(inviteTeammateApi, { params: { slug, entryId }, body: { userId: user.id } });
      const name = personLabel(user) ?? t('someone', { defaultValue: 'A member' });
      onAnnounce(t('invited-announce', { name, defaultValue: 'Invitation sent to {{name}}.' }));
      setQuery('');
      onInvited(member);
    } catch (e) {
      failed(e);
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
  const expanded = results.length > 0;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="t-label">
        {t('invite-label', { defaultValue: 'Add a teammate' })}
      </label>
      <Input
        id={inputId}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded ? optionId(active) : undefined}
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
      <ul id={listId} role="listbox" aria-label={t('results', { defaultValue: 'Matching members' })} hidden={!expanded}>
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

/** "by A, B and C": the submitter, then the accepted teammates. */
export function EntryCredit({ owner, team }: { owner: TeamPersonDTO; team: TeamPersonDTO[] }) {
  const { t, i18n } = useTranslation('jam-teams');
  return (
    <>
      {t('credit', {
        names: listNames(creditNames(owner, team), i18n.language),
        defaultValue: 'by {{names}}',
      })}
    </>
  );
}

export function JamTeamPanel({ slug, entryId, state, open, viewerId, onChanged }: JamTeamPanelProps) {
  const { t } = useTranslation('jam-teams');
  const confirm = useConfirm();
  const failed = useRefusalToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const options = apiQuery(listTeamApi, { params: { slug, entryId } });
  const query = useQuery({ ...options, enabled: state === 'owner', retry: false });
  const members = query.data?.team ?? null;
  const arrival = useArrival(members != null);

  const live = (
    <p role="status" aria-live="polite" className="sr-only">
      {announcement}
    </p>
  );

  const respond = async (accept: boolean) => {
    setBusy(true);
    try {
      await api(respondTeamApi, { params: { slug, entryId }, body: { accept } });
      setAnnouncement(
        accept
          ? t('accepted-announce', { defaultValue: 'You are now on this team.' })
          : t('declined-announce', { defaultValue: 'Invitation declined.' }),
      );
      onChanged();
    } catch (e) {
      failed(e);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    const ok = await confirm({
      title: t('leave-title', { defaultValue: 'Leave this team?' }),
      description: t('leave-body', {
        defaultValue: 'You will no longer be credited on this entry. The submitter can add you again.',
      }),
      confirmLabel: t('leave', { defaultValue: 'Leave team' }),
      cancelLabel: t('stay', { defaultValue: 'Stay on team' }),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(removeTeammateApi, { params: { slug, entryId }, query: { userId: viewerId } });
      setAnnouncement(t('left-announce', { defaultValue: 'You left the team.' }));
      onChanged();
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };

  const publish = (next: TeamEntryDTO[]) => {
    queryClient.setQueryData(options.queryKey, { team: next, max: MAX_TEAMMATES });
    onChanged();
  };

  const remove = async (member: TeamEntryDTO) => {
    const name = personLabel(member) ?? t('someone', { defaultValue: 'A member' });
    const ok = await confirm({
      title: t('remove-title', { name, defaultValue: 'Remove {{name}}?' }),
      description: t('remove-body', { defaultValue: 'They are no longer credited on this entry. They are not told.' }),
      confirmLabel: t('remove', { defaultValue: 'Remove' }),
      cancelLabel: t('keep', { defaultValue: 'Keep' }),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(removeTeammateApi, { params: { slug, entryId }, query: { userId: member.id } });
      setAnnouncement(t('removed-announce', { name, defaultValue: '{{name}} was removed.' }));
      publish((members ?? []).filter((m) => m.id !== member.id));
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };

  if (state === 'invited') {
    if (!open) return null;
    return (
      <section aria-label={t('heading', { defaultValue: 'Team' })} className="flex flex-col gap-2 border-t border-site-border pt-3">
        <p className="t-body">{t('invited-body', { defaultValue: 'You were added to this entry as a teammate.' })}</p>
        <p className="t-meta">
          {t('accept-rating-note', {
            defaultValue: 'Accepting removes any rating you gave this entry, and you cannot rate it again.',
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy} onClick={() => void respond(true)}>
            {t('accept', { defaultValue: 'Accept' })}
          </Button>
          <Button variant="default" disabled={busy} onClick={() => void respond(false)}>
            {t('decline', { defaultValue: 'Decline' })}
          </Button>
        </div>
        {live}
      </section>
    );
  }

  if (state === 'teammate') {
    return (
      <section
        aria-label={t('heading', { defaultValue: 'Team' })}
        className="flex flex-wrap items-center justify-between gap-2 border-t border-site-border pt-3"
      >
        <p className="t-body text-site-text-muted">{t('teammate-body', { defaultValue: 'You are on this team.' })}</p>
        {open && (
          <Button variant="default" disabled={busy} onClick={() => void leave()}>
            {t('leave', { defaultValue: 'Leave team' })}
          </Button>
        )}
        {live}
      </section>
    );
  }

  if (state !== 'owner') return null;

  const statusLabel = (m: TeamEntryDTO) =>
    m.status === 'accepted'
      ? t('status-accepted', { defaultValue: 'Teammate' })
      : t('status-invited', { defaultValue: 'Invited' });

  return (
    <section aria-label={t('heading', { defaultValue: 'Team' })} className="flex flex-col gap-3 border-t border-site-border pt-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="t-heading">{t('heading', { defaultValue: 'Team' })}</h3>
        {members && (
          <p className="t-meta">
            {t('used', { used: members.length, max: MAX_TEAMMATES, defaultValue: '{{used}} of {{max}}' })}
          </p>
        )}
      </div>
      {query.isError ? (
        <p role="alert" className="t-body text-site-danger">
          {t('load-error', { defaultValue: 'Could not load the team.' })}
        </p>
      ) : !members ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          <Skeleton className="h-9 w-full" />
        </div>
      ) : (
        <div className={arrival}>
          {members.length === 0 ? (
            <p className="t-body text-site-text-muted">
              {t('empty', { defaultValue: 'No teammates yet. Teammates are credited on this entry and cannot rate it.' })}
            </p>
          ) : (
            <ul>
              {members.map((m) => {
                const name = personLabel(m) ?? t('someone', { defaultValue: 'A member' });
                return (
                  <li key={m.id} className="flex items-center gap-3 border-b border-site-border py-2">
                    <UserAvatar src={m.image} alt="" size={24} />
                    <div className="min-w-0 flex-1">
                      <p className="t-body truncate text-site-text">{name}</p>
                      <p className="t-meta">{statusLabel(m)}</p>
                    </div>
                    {open && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        aria-label={t('remove-aria', { name, defaultValue: 'Remove {{name}} from the team' })}
                        onClick={() => void remove(m)}
                      >
                        {t('remove', { defaultValue: 'Remove' })}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {!open ? (
            <p className="t-meta pt-3">{t('frozen', { defaultValue: 'Submissions are closed, so the team is fixed.' })}</p>
          ) : members.length < MAX_TEAMMATES ? (
            <div className="pt-3">
              <TeamInvite
                slug={slug}
                entryId={entryId}
                excludeIds={[viewerId, ...members.map((m) => m.id)]}
                onAnnounce={setAnnouncement}
                onInvited={(member) => publish([...members.filter((m) => m.id !== member.id), member])}
              />
            </div>
          ) : (
            <p className="t-meta pt-3">
              {t('full', { max: MAX_TEAMMATES, defaultValue: 'That is the most teammates a team can have ({{max}}).' })}
            </p>
          )}
        </div>
      )}
      {live}
    </section>
  );
}
