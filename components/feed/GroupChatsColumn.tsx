'use client';

import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Loader2, Users, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HandleInput } from './HandleInput';

interface GroupRow {
  id: string;
  name: string;
  memberCount: number;
  lastMessage: string | null;
  lastMessageAt: string;
  unread: boolean;
}

export function GroupChatsColumn({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [members, setMembers] = useState('');

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
        setError(data.error ?? 'Could not create');
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
        <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
        <p className="font-medium text-site-text">Sign in to use group chats</p>
        <Link to="/login" search={{ callbackURL: '/groups' }}>
          <Button variant="accent">Sign in</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className={`flex items-center gap-2 border-b border-site-border px-4 py-3 ${embedded ? '' : 'sticky top-0 z-10 bg-site-bg/80 backdrop-blur'}`}>
        {!embedded && <Users className="h-5 w-5 text-site-accent" />}
        {!embedded && <h1 className="text-lg font-bold text-site-text">Group chats</h1>}
        <Button size="sm" variant="accent" className="ml-auto gap-1" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-3.5 w-3.5" /> New group
        </Button>
      </header>

      {showForm && (
        <div className="border-b border-site-border bg-site-surface/30 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-site-text">New group</h2>
            <button onClick={() => setShowForm(false)} className="text-site-text-dim hover:text-site-text" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Group name"
              maxLength={60}
              className="w-full rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
            />
            <HandleInput
              value={members}
              onChange={setMembers}
              multiple
              placeholder="Members by @handle, comma-separated"
              className="w-full rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
            />
            {error && <p className="text-xs text-site-danger">{error}</p>}
            <div className="flex justify-end">
              <Button size="sm" variant="accent" disabled={busy || name.trim().length < 1 || !members.trim()} onClick={create}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Create group'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <p className="px-4 py-16 text-center text-sm text-site-text-muted">No group chats yet.</p>
      ) : (
        <div className="divide-y divide-site-border/60">
          {groups.map((g) => (
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
                  {g.lastMessage ?? `${g.memberCount} members`}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
