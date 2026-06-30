'use client';

import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Loader2, Users, Plus, X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { HandleInput } from './HandleInput';
import { useTranslation } from 'react-i18next';

interface GroupRow {
  id: string;
  name: string;
  memberCount: number;
  lastMessage: string | null;
  lastMessageAt: string;
  unread: boolean;
}

export function GroupChatsColumn({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation("feed");
  const navigate = useNavigate();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [members, setMembers] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/group-chats', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setGroups(data.groups ?? []);
      setSignedIn(!!data.signedIn);
    }
  }, []);

  useEffect(() => {
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

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const memberList = members
        .split(/[\s,]+/)
        .map((m) => m.trim().replace(/^@/, ''))
        .filter(Boolean);
      const res = await fetch('/api/group-chats', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), members: memberList }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? t("could-not-create", { defaultValue: "Could not create" }));
        return;
      }
      navigate({ to: `/groups/${data.id}` as string });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
        <p className="font-medium text-site-text">{t("sign-in-to-use-group-chats", { defaultValue: "Sign in to use group chats" })}</p>
        <Link to="/login" search={{ callbackURL: '/groups' }}>
          <Button variant="accent">{t("sign-in", { defaultValue: "Sign in" })}</Button>
        </Link>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const visibleGroups = q ? groups.filter((g) => g.name.toLowerCase().includes(q)) : groups;

  return (
    <div className="min-h-screen">
      <header className={`flex items-center gap-2 border-b border-site-border px-4 py-3 ${embedded ? '' : 'sticky top-0 z-10 bg-site-bg/80 backdrop-blur'}`}>
        {!embedded && <Users className="h-5 w-5 shrink-0 text-site-accent" />}
        {!embedded && <h1 className="shrink-0 text-lg font-bold text-site-text">{t("group-chats", { defaultValue: "Group chats" })}</h1>}
        {/* Search + new-group action share a single row; the action is icon-only. */}
        <div className="relative flex-1 min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-site-text-dim" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search-groups-placeholder", { defaultValue: "Search groups…" })}
            aria-label={t("search-groups", { defaultValue: "Search groups" })}
            className="w-full rounded-full border border-site-border bg-site-surface py-2 pl-9 pr-9 text-sm text-site-text placeholder:text-site-text-dim focus:border-site-accent focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-site-text-dim hover:text-site-text"
              aria-label={t("clear-search", { defaultValue: "Clear search" })}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="flex shrink-0 items-center justify-center rounded-full bg-site-accent p-2 text-site-bg transition-opacity hover:opacity-90"
          title={t("new-group", { defaultValue: "New group" })}
          aria-label={t("new-group", { defaultValue: "New group" })}
        >
          <Plus className="h-4 w-4" />
        </button>
      </header>

      {showForm && (
        <div className="border-b border-site-border bg-site-surface/30 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-site-text">{t("new-group", { defaultValue: "New group" })}</h2>
            <button onClick={() => setShowForm(false)} className="text-site-text-dim hover:text-site-text" aria-label={t("close", { defaultValue: "Close" })}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("group-name-placeholder", { defaultValue: "Group name" })}
              maxLength={60}
              className="w-full rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
            />
            <HandleInput
              value={members}
              onChange={setMembers}
              multiple
              placeholder={t("members-placeholder", { defaultValue: "Members by @handle, comma-separated" })}
              className="w-full rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
            />
            {error && <p className="text-xs text-site-danger">{error}</p>}
            <div className="flex justify-end">
              <Button size="sm" variant="accent" disabled={busy || name.trim().length < 1 || !members.trim()} onClick={create}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("create-group", { defaultValue: "Create group" })}
              </Button>
            </div>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyState description={t("no-group-chats-yet", { defaultValue: "No group chats yet." })} />
      ) : visibleGroups.length === 0 ? (
        <EmptyState description={t("no-groups-match", { defaultValue: "No groups match your search." })} />
      ) : (
        <div className="divide-y divide-site-border/60">
          {visibleGroups.map((g) => (
            <Link
              key={g.id}
              to={`/groups/${g.id}` as string}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-site-surface/50"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-site-accent/12 text-site-accent">
                <Users className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-site-text">{g.name}</p>
                  {g.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-site-accent" />}
                </div>
                <p className="truncate text-xs text-site-text-dim">
                  {g.lastMessage ?? t("member-count", { count: g.memberCount, defaultValue: "{{count}} members" })}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
