'use client';

import { useEffect, useState, useCallback } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Loader2, Users, MessageSquare, Megaphone, Shield, ShieldOff, UserX, X, Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { RMHarkCard } from './RMHarkCard';
import { ComposeBox } from './ComposeBox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useSession } from '@/components/Providers';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { FeedItem } from '@/lib/feed-types';

interface Announcement {
  id: string;
  body: string;
  createdAt: string;
  author: { name: string | null; handle: string | null; image: string | null };
}

interface CommunityData {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  memberCount: number;
  postCount: number;
  joined: boolean;
  role: string | null;
  announcements: Announcement[];
}

interface Member {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
  role: string;
  joinedAt: string;
}

function canModerate(role: string | null): boolean {
  return role === 'ADMIN' || role === 'MOD';
}

export function CommunityColumn({ slug }: { slug: string }) {
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const [community, setCommunity] = useState<CommunityData | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  const loadCommunity = useCallback(async () => {
    const res = await fetch(`/api/communities/${slug}`, { credentials: 'include' });
    if (res.ok) setCommunity(await res.json());
  }, [slug]);

  const loadFeed = useCallback(async () => {
    const res = await fetch(`/api/communities/${slug}/feed`, { credentials: 'include' });
    if (res.ok) setItems((await res.json()).items);
  }, [slug]);

  useEffect(() => {
    Promise.all([loadCommunity(), loadFeed()]).finally(() => setLoading(false));
  }, [loadCommunity, loadFeed]);

  const toggleJoin = async () => {
    if (!community) return;
    setJoining(true);
    try {
      const res = await fetch(`/api/communities/${slug}/join`, { method: 'POST', credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCommunity((c) => c && { ...c, joined: data.joined, memberCount: c.memberCount + (data.joined ? 1 : -1) });
      } else {
        toast.error(data.error || t('could-not-update-membership', { defaultValue: 'Could not update membership' }));
      }
    } finally {
      setJoining(false);
    }
  };

  const removeAnnouncement = async (id: string) => {
    const res = await fetch(`/api/communities/${slug}/announcements/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) {
      setCommunity((c) => c && { ...c, announcements: c.announcements.filter((a) => a.id !== id) });
    } else {
      toast.error(t('could-not-delete', { defaultValue: 'Could not delete' }));
    }
  };

  const onAnnounced = (a: Announcement) => {
    setCommunity((c) => c && { ...c, announcements: [a, ...c.announcements] });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
      </div>
    );
  }
  if (!community) {
    return <p className="px-4 py-16 text-center text-sm text-site-text-muted">{t('community-not-found', { defaultValue: 'Community not found.' })}</p>;
  }

  const isMod = canModerate(community.role);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <Link to="/communities" className="text-site-text-muted hover:text-site-text" aria-label={t('back-to-communities', { defaultValue: 'Back to communities' })}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="truncate text-lg font-bold text-site-text">{community.name}</h1>
      </header>

      <div className="border-b border-site-border p-4">
        <div className="flex items-start gap-3">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-site text-2xl"
            style={{ background: (community.color || 'var(--site-accent)') + '22' }}
          >
            {community.icon || '👥'}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-site-text">{community.name}</h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-site-text-muted">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> {t('members-stat', { count: community.memberCount, formatted: community.memberCount, defaultValue: '{{formatted}} members' })}
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5" /> {t('posts-stat', { count: community.postCount, formatted: community.postCount, defaultValue: '{{formatted}} posts' })}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {session && (
              <Button size="sm" variant="outline" onClick={() => setMembersOpen(true)}>
                {t('members-button', { defaultValue: 'Members' })}
              </Button>
            )}
            {session && (
              <Button
                size="sm"
                variant={community.joined ? 'outline' : 'accent'}
                disabled={joining}
                onClick={toggleJoin}
              >
                {community.joined ? t('joined', { defaultValue: 'Joined' }) : t('join', { defaultValue: 'Join' })}
              </Button>
            )}
          </div>
        </div>
        {community.description && <p className="mt-2 text-sm text-site-text-muted">{community.description}</p>}
      </div>

      {/* Pinned announcements */}
      {(community.announcements.length > 0 || isMod) && (
        <div className="border-b border-site-border bg-site-accent-dim/30 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-site-text">
              <Megaphone className="h-4 w-4 text-site-accent" /> {t('announcements', { defaultValue: 'Announcements' })}
            </h3>
            {isMod && (
              <Button size="sm" variant="ghost" onClick={() => setAnnounceOpen(true)}>
                <Megaphone className="h-4 w-4" /> {t('post-announcement', { defaultValue: 'Post' })}
              </Button>
            )}
          </div>
          {community.announcements.length === 0 ? (
            <p className="text-xs text-site-text-dim">{t('no-announcements', { defaultValue: 'No announcements yet.' })}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {community.announcements.map((a) => (
                <li key={a.id} className="rounded-site border border-site-border bg-site-surface p-3">
                  <div className="flex items-start gap-2">
                    <UserAvatar src={a.author.image} alt={a.author.name ?? ''} size={28} fallbackName={a.author.name ?? undefined} className="mt-0.5 rounded-full" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs text-site-text-muted">
                        <span className="font-medium text-site-text">{a.author.name ?? (a.author.handle ? `@${a.author.handle}` : t('someone', { defaultValue: 'Someone' }))}</span>
                        <span>·</span>
                        <span>{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-site-text">{a.body}</p>
                    </div>
                    {isMod && (
                      <button
                        type="button"
                        onClick={() => removeAnnouncement(a.id)}
                        className="shrink-0 rounded-site-sm p-1 text-site-text-dim hover:bg-site-surface-hover hover:text-site-text"
                        aria-label={t('delete', { defaultValue: 'Delete' })}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Composer for members */}
      {community.joined && (
        <ComposeBox
          communityId={community.id}
          onPosted={(item) => setItems((prev) => [item, ...prev])}
        />
      )}

      {items.length === 0 ? (
        <p className="px-4 py-16 text-center text-sm text-site-text-muted">{t('no-posts-yet', { defaultValue: 'No posts yet. Be the first!' })}</p>
      ) : (
        <div className="divide-y divide-site-border">
          {items.map((item) => (
            <RMHarkCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {announceOpen && (
        <AnnounceDialog slug={slug} onClose={() => setAnnounceOpen(false)} onPosted={onAnnounced} />
      )}
      {membersOpen && (
        <MembersDialog slug={slug} viewerId={session?.user?.id ?? null} onClose={() => setMembersOpen(false)} />
      )}
    </div>
  );
}

function AnnounceDialog({ slug, onClose, onPosted }: { slug: string; onClose: () => void; onPosted: (a: Announcement) => void }) {
  const { t } = useTranslation('feed');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/communities/${slug}/announcements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ body: body.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.announcement) {
        onPosted(data.announcement);
        onClose();
      } else {
        toast.error(data.error || t('could-not-post', { defaultValue: 'Could not post' }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('post-announcement-title', { defaultValue: 'Post an announcement' })}</DialogTitle>
        </DialogHeader>
        <textarea
          autoFocus
          value={body}
          maxLength={2000}
          rows={4}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('announcement-placeholder', { defaultValue: 'Share an update with the community…' })}
          className="w-full rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text placeholder:text-site-text-dim focus:border-site-accent focus:outline-none"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>{t('cancel-button', { defaultValue: 'Cancel' })}</Button>
          <Button variant="accent" onClick={submit} disabled={submitting || !body.trim()}>
            <Send className="h-4 w-4" /> {submitting ? t('posting', { defaultValue: 'Posting…' }) : t('post-button', { defaultValue: 'Post' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MembersDialog({ slug, viewerId, onClose }: { slug: string; viewerId: string | null; onClose: () => void }) {
  const { t } = useTranslation('feed');
  const [members, setMembers] = useState<Member[]>([]);
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [createdById, setCreatedById] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/communities/${slug}/members`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setMembers(data.members);
      setViewerRole(data.viewerRole);
      setCreatedById(data.createdById);
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const setRole = async (m: Member, role: 'MEMBER' | 'MOD') => {
    setBusy(m.id);
    try {
      const res = await fetch(`/api/communities/${slug}/members/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, role } : x)));
      else toast.error(data.error || t('action-failed', { defaultValue: 'Action failed' }));
    } finally {
      setBusy(null);
    }
  };

  const kick = async (m: Member) => {
    if (!window.confirm(t('kick-confirm', { name: m.name ?? m.handle ?? 'this member', defaultValue: 'Remove {{name}} from the community?' }))) return;
    setBusy(m.id);
    try {
      const res = await fetch(`/api/communities/${slug}/members/${m.id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setMembers((prev) => prev.filter((x) => x.id !== m.id));
      else toast.error(data.error || t('action-failed', { defaultValue: 'Action failed' }));
    } finally {
      setBusy(null);
    }
  };

  const isAdmin = viewerRole === 'ADMIN';
  const isMod = viewerRole === 'ADMIN' || viewerRole === 'MOD';

  const roleLabel = (role: string) =>
    role === 'ADMIN'
      ? t('role-owner', { defaultValue: 'Owner' })
      : role === 'MOD'
        ? t('role-mod', { defaultValue: 'Mod' })
        : t('role-member', { defaultValue: 'Member' });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('members-title', { defaultValue: 'Members' })}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-site-accent" /></div>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-site-border overflow-y-auto">
            {members.map((m) => {
              const isOwner = m.id === createdById;
              const canTouch = isMod && !isOwner && m.id !== viewerId && m.role !== 'ADMIN';
              // Mods can manage members; only the owner can demote/remove a mod.
              const canAlterMod = canTouch && (isAdmin || m.role === 'MEMBER');
              return (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <UserAvatar src={m.image} alt={m.name ?? ''} size={32} fallbackName={m.name ?? undefined} className="rounded-full" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-site-text">{m.name ?? (m.handle ? `@${m.handle}` : t('someone', { defaultValue: 'Someone' }))}</p>
                    <p className="text-xs text-site-text-dim">{roleLabel(m.role)}</p>
                  </div>
                  {canAlterMod && (
                    <button
                      type="button"
                      disabled={busy === m.id}
                      onClick={() => setRole(m, m.role === 'MOD' ? 'MEMBER' : 'MOD')}
                      className="rounded-site-sm p-1.5 text-site-text-muted hover:bg-site-surface-hover hover:text-site-text disabled:opacity-50"
                      title={m.role === 'MOD' ? t('remove-mod', { defaultValue: 'Remove mod' }) : t('make-mod', { defaultValue: 'Make mod' })}
                    >
                      {m.role === 'MOD' ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                    </button>
                  )}
                  {canTouch && (m.role === 'MEMBER' || isAdmin) && (
                    <button
                      type="button"
                      disabled={busy === m.id}
                      onClick={() => kick(m)}
                      className="rounded-site-sm p-1.5 text-site-text-muted hover:bg-site-danger/15 hover:text-site-danger disabled:opacity-50"
                      title={t('remove-member', { defaultValue: 'Remove' })}
                    >
                      <UserX className="h-4 w-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
