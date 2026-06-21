'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Clapperboard, Plus, X, Trash2, Play, Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from './UserAvatar';

interface Clip {
  id: string;
  url: string;
  mediaType: string;
  title: string;
  startSeconds: number;
  endSeconds: number;
  thumbnailUrl: string | null;
  note: string | null;
  isOwner: boolean;
  subscribed: boolean;
  user: { id: string; name: string | null; handle: string | null; image: string | null };
}

type Filter = 'all' | 'subscribed' | 'mine';

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function watchUrl(clip: Clip): string {
  try {
    const u = new URL(clip.url);
    if (clip.mediaType === 'youtube') {
      u.searchParams.set('t', `${clip.startSeconds}`);
      return u.toString();
    }
    return `${clip.url}#t=${clip.startSeconds}`;
  } catch {
    return clip.url;
  }
}

export function ClipsColumn() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ url: '', title: '', start: '', end: '', note: '' });

  const load = useCallback(async (f: Filter) => {
    const res = await fetch(`/api/rmhtube/clips?filter=${f}`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setClips(data.clips ?? []);
      setSignedIn(!!data.signedIn);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await load(filter);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [filter, load]);

  function parseTime(v: string): number {
    const t = v.trim();
    if (t.includes(':')) {
      const [m, s] = t.split(':');
      return (parseInt(m, 10) || 0) * 60 + (parseInt(s, 10) || 0);
    }
    return parseInt(t, 10) || 0;
  }

  async function create() {
    setBusy('create');
    setError(null);
    try {
      const res = await fetch('/api/rmhtube/clips', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: form.url.trim(),
          title: form.title.trim(),
          startSeconds: parseTime(form.start),
          endSeconds: parseTime(form.end),
          note: form.note.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Could not save clip');
        return;
      }
      setForm({ url: '', title: '', start: '', end: '', note: '' });
      setShowForm(false);
      await load(filter);
    } finally {
      setBusy(null);
    }
  }

  async function toggleSub(channelId: string) {
    setBusy(`sub:${channelId}`);
    try {
      const res = await fetch(`/api/rmhtube/subscribe/${channelId}`, { method: 'POST', credentials: 'include' });
      if (res.ok) await load(filter);
    } finally {
      setBusy(null);
    }
  }

  async function del(id: string) {
    setBusy(`del:${id}`);
    try {
      const res = await fetch(`/api/rmhtube/clips/${id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) setClips((c) => c.filter((x) => x.id !== id));
    } finally {
      setBusy(null);
    }
  }

  const validForm = form.url.trim() && form.title.trim() && form.start.trim() && form.end.trim();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <Clapperboard className="h-5 w-5 text-site-accent" />
        <h1 className="text-lg font-bold text-site-text">Clips</h1>
        {signedIn && (
          <Button size="sm" variant="accent" className="ml-auto gap-1" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-3.5 w-3.5" /> New clip
          </Button>
        )}
      </header>

      <div className="flex gap-1 border-b border-site-border px-4 py-2">
        {(['all', 'subscribed', 'mine'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
              filter === f ? 'bg-site-accent text-white' : 'text-site-text-muted hover:text-site-text'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="border-b border-site-border bg-site-surface/30 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-site-text">Save a clip</h2>
            <button onClick={() => setShowForm(false)} className="text-site-text-dim hover:text-site-text" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 space-y-2">
            <input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="Video URL (YouTube, etc.)" className="w-full rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent" />
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Clip title" maxLength={120} className="w-full rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent" />
            <div className="flex gap-2">
              <input value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} placeholder="Start (1:30 or 90)" className="flex-1 rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent" />
              <input value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} placeholder="End (2:00 or 120)" className="flex-1 rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent" />
            </div>
            <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Note / chapter (optional)" maxLength={300} className="w-full rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent" />
            {error && <p className="text-xs text-site-danger">{error}</p>}
            <div className="flex justify-end">
              <Button size="sm" variant="accent" disabled={busy === 'create' || !validForm} onClick={create}>
                {busy === 'create' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save clip'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
        </div>
      ) : clips.length === 0 ? (
        <p className="px-4 py-16 text-center text-sm text-site-text-muted">No clips here yet.</p>
      ) : (
        <div className="space-y-3 p-4">
          {clips.map((c) => (
            <div key={c.id} className="overflow-hidden rounded-xl border border-site-border bg-site-surface">
              <a href={watchUrl(c)} target="_blank" rel="noopener noreferrer" className="relative block aspect-video bg-black">
                {c.thumbnailUrl ? (
                  <img src={c.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-site-text-dim">
                    <Clapperboard className="h-8 w-8" />
                  </div>
                )}
                <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
                  {fmtTime(c.startSeconds)}–{fmtTime(c.endSeconds)}
                </span>
                <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity hover:opacity-100">
                  <Play className="h-10 w-10 fill-white/90 text-white/90" />
                </span>
              </a>
              <div className="p-3">
                <p className="text-sm font-semibold text-site-text">{c.title}</p>
                {c.note && <p className="mt-0.5 text-xs text-site-text-muted">{c.note}</p>}
                <div className="mt-2 flex items-center gap-2">
                  <UserAvatar user={c.user} />
                  <span className="min-w-0 flex-1 truncate text-xs text-site-text-dim">{c.user.name || c.user.handle || 'Someone'}</span>
                  {c.isOwner ? (
                    <button onClick={() => del(c.id)} disabled={busy === `del:${c.id}`} className="text-site-text-dim hover:text-site-danger" aria-label="Delete clip">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : signedIn ? (
                    <Button size="sm" variant={c.subscribed ? 'outline' : 'accent'} disabled={busy === `sub:${c.user.id}`} onClick={() => toggleSub(c.user.id)} className="h-7 gap-1 px-2 text-xs">
                      {c.subscribed ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                      {c.subscribed ? 'Subscribed' : 'Subscribe'}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
