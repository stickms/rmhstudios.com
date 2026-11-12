/* eslint-disable local/no-adhoc-spinner -- in-button busy icon or inline status: <Spinner> renders role="status" and would join the control accessible name */
import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Loader2, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Spine, SpineItem } from '@/components/ui/spine';
import { HandleInput } from './HandleInput';
import { ColumnHeader } from './ColumnHeader';
import { useTranslation } from 'react-i18next';
import { SearchField } from '@/components/ui/search-field';
import { ChatFolderBar } from '@/components/chat-plus/ChatFolderBar';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import {
  createGroupChatApi,
  listGroupChatsApi,
  type GroupRow,
} from '@/lib/group-chat/group-chat.contract';

export function GroupChatsColumn({
  embedded = false,
  initialData,
}: {
  embedded?: boolean;
  /** Group list prefetched by the route loader; `null`when signed out. */
  initialData?: { groups: GroupRow[]; signedIn: boolean } | null;
} = {}) {
  const { t } = useTranslation('feed');
  const navigate = useNavigate();
  const seeded = useRef(initialData !== undefined && initialData !== null);
  const [groups, setGroups] = useState<GroupRow[]>(initialData?.groups ?? []);
  const [signedIn, setSignedIn] = useState(initialData?.signedIn ?? false);
  const [loading, setLoading] = useState(!initialData);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [members, setMembers] = useState('');
  const [query, setQuery] = useState('');
  // M1: 'all' | 'unread' | a folder id — filtered server-side.
  const [folder, setFolder] = useState('all');
  const folderRef = useRef(folder);
  folderRef.current = folder;

  const load = useCallback(async () => {
    const query =
      folderRef.current === 'all'
        ? {}
        : folderRef.current === 'unread'
          ? { filter: 'unread' as const }
          : { folder: folderRef.current };
    try {
      const data = await api(listGroupChatsApi, { query });
      setGroups(data.groups ?? []);
      setSignedIn(!!data.signedIn);
    } catch {
      // keep the list we already have
    }
  }, []);

  useEffect(() => {
    if (seeded.current) return;
    let active = true;
    (async () => {
      try {
        await load();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  // Switching folder tabs refetches that folder's list.
  const firstFolderRun = useRef(true);
  useEffect(() => {
    if (firstFolderRun.current) {
      firstFolderRun.current = false;
      return;
    }
    void load();
  }, [folder, load]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const memberList = members
        .split(/[\s,]+/)
        .map((m) => m.trim().replace(/^@/, ''))
        .filter(Boolean);
      const data = await api(createGroupChatApi, {
        body: { name: name.trim(), members: memberList },
      });
      navigate({ to: `/groups/${data.id}` as string });
    } catch (e) {
      setError(serverError(e) ?? t('could-not-create', { defaultValue: 'Could not create' }));
    } finally {
      setBusy(false);
    }
  }

  // The loading and signed-out branches return before the main header, so they
  // need their own — otherwise a signed-out visitor on /groups has no mobile
  // drawer button at all. Skipped when embedded: the host page (InboxColumn)
  // already renders a header carrying that button.
  const gateHeader = embedded ? null : (
    <ColumnHeader icon={Users} title={t('group-chats', { defaultValue: 'Group chats' })} />
  );

  if (loading) {
    return (
      <>
        {gateHeader}
        <div className="flex justify-center px-4 pt-4 pb-12">
          <Spinner />
        </div>
      </>
    );
  }

  if (!signedIn) {
    return (
      <>
        {gateHeader}
        <EmptyState
          title={t('sign-in-to-use-group-chats', { defaultValue: 'Sign in to use group chats' })}
          action={
            <Link to="/login" search={{ callbackURL: '/groups' }}>
              <Button variant="default">{t('sign-in', { defaultValue: 'Sign in' })}</Button>
            </Link>
          }
        />
      </>
    );
  }

  const q = query.trim().toLowerCase();
  const visibleGroups = q ? groups.filter((g) => g.name.toLowerCase().includes(q)) : groups;

  return (
    <div>
      {!embedded && (
        <h1 className="t-title pb-3">{t('group-chats', { defaultValue: 'Group chats' })}</h1>
      )}
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <SearchField
          containerClassName="min-w-full sm:min-w-0 sm:flex-1"
          value={query}
          onValueChange={setQuery}
          placeholder={t('search-groups-placeholder', { defaultValue: 'Search groups…' })}
          aria-label={t('search-groups', { defaultValue: 'Search groups' })}
        />
        <Button variant="ghost" onClick={() => setShowForm((v) => !v)}>
          {t('new-group', { defaultValue: 'New group' })}
        </Button>
      </div>
      <ChatFolderBar value={folder} onChange={setFolder} />

      {showForm && (
        <div className="border-b border-site-border pb-4">
          <div className="flex items-center justify-between">
            <h2 className="t-heading">{t('new-group', { defaultValue: 'New group' })}</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowForm(false)}
              aria-label={t('close', { defaultValue: 'Close' })}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('group-name-placeholder', { defaultValue: 'Group name' })}
              maxLength={60}
            />
            <HandleInput
              value={members}
              onChange={setMembers}
              multiple
              placeholder={t('members-placeholder', {
                defaultValue: 'Members by @handle, comma-separated',
              })}
              className="glass-inset border w-full rounded-site-sm px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
            />
            {error && <p className="text-xs text-site-danger">{error}</p>}
            <div className="flex justify-end">
              <Button
                variant="default"
                disabled={busy || name.trim().length < 1 || !members.trim()}
                onClick={create}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  t('create-group', { defaultValue: 'Create group' })
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyState
          description={t('no-group-chats-yet', { defaultValue: 'No group chats yet.' })}
        />
      ) : visibleGroups.length === 0 ? (
        <EmptyState
          description={t('no-groups-match', { defaultValue: 'No groups match your search.' })}
        />
      ) : (
        <Spine>
          {visibleGroups.map((g) => (
            <SpineItem key={g.id} dot={!!g.unread} className="hover:bg-site-bg-subtle">
              <Link
                to={`/groups/${g.id}` as string}
                className="block after:absolute after:inset-x-0 after:-inset-y-px after:content-['']"
              >
                <p
                  className={`t-body truncate text-site-text ${g.unread ? 'font-semibold' : 'font-medium'}`}
                >
                  {g.name}
                </p>
                <p
                  className={`t-body truncate ${g.unread ? 'font-semibold text-site-text' : 'text-site-text-muted'}`}
                >
                  {g.lastMessage ??
                    t('member-count', { count: g.memberCount, defaultValue: '{{count}} members' })}
                </p>
              </Link>
            </SpineItem>
          ))}
        </Spine>
      )}
    </div>
  );
}
