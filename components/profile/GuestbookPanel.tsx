'use client';

/**
 * Profile guestbook (plan U15). Lazy-loaded by ProfileColumn the first time
 * its tab is opened, so a profile view that never opens it pays nothing.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { BookOpen, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/ui/UserAvatar';
import {
  GUESTBOOK_BODY_MAX,
  isGuestbookMode,
  type GuestbookEntryView,
  type GuestbookMode,
  type GuestbookPage,
} from '@/lib/guestbook/schema';

export default function GuestbookPanel({
  ownerId,
  onModeChange,
}: {
  ownerId: string;
  /** Lets the profile keep its tab in sync when the owner opens or closes it. */
  onModeChange?: (mode: GuestbookMode) => void;
}) {
  const { t } = useTranslation('c-profile-modules');
  const { data: session } = useSession();
  const [page, setPage] = useState<GuestbookPage | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const base = `/api/profile/${encodeURIComponent(ownerId)}/guestbook`;

  const load = useCallback(
    async (cursor?: string | null) => {
      const url = cursor ? `${base}?cursor=${encodeURIComponent(cursor)}` : base;
      const res = await fetch(url, { credentials: 'include' }).catch(() => null);
      if (!res?.ok) return null;
      return (await res.json()) as GuestbookPage;
    },
    [base],
  );

  useEffect(() => {
    let cancelled = false;
    void load().then((p) => {
      if (!cancelled)
        setPage(
          p ?? { mode: 'off', isOwner: false, canSign: false, entries: [], nextCursor: null },
        );
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function more() {
    if (!page?.nextCursor) return;
    setLoadingMore(true);
    const next = await load(page.nextCursor);
    setLoadingMore(false);
    if (next) setPage({ ...next, entries: [...page.entries, ...next.entries] });
  }

  async function sign() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ body }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(
          data.error || t('guestbook-sign-error', { defaultValue: "Couldn't sign the guestbook" }),
        );
        return;
      }
      setDraft('');
      const fresh = await load();
      if (fresh) setPage(fresh);
      toast.success(t('guestbook-signed', { defaultValue: 'Signed' }));
    } finally {
      setSending(false);
    }
  }

  async function setMode(mode: GuestbookMode) {
    const res = await fetch(base, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ mode }),
    }).catch(() => null);
    if (!res?.ok) {
      toast.error(t('guestbook-mode-error', { defaultValue: "Couldn't update the guestbook" }));
      return;
    }
    setPage((p) => (p ? { ...p, mode } : p));
    onModeChange?.(mode);
  }

  async function toggleHidden(entry: GuestbookEntryView) {
    const hidden = !entry.hidden;
    setPage(
      (p) =>
        p && { ...p, entries: p.entries.map((e) => (e.id === entry.id ? { ...e, hidden } : e)) },
    );
    const res = await fetch(`${base}/${encodeURIComponent(entry.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ hidden }),
    }).catch(() => null);
    if (!res?.ok) {
      setPage((p) => p && { ...p, entries: p.entries.map((e) => (e.id === entry.id ? entry : e)) });
    }
  }

  async function remove(entry: GuestbookEntryView) {
    setPage((p) => p && { ...p, entries: p.entries.filter((e) => e.id !== entry.id) });
    const res = await fetch(`${base}/${encodeURIComponent(entry.id)}`, {
      method: 'DELETE',
      credentials: 'include',
    }).catch(() => null);
    if (!res?.ok) {
      setPage((p) => p && { ...p, entries: [entry, ...p.entries] });
      toast.error(t('guestbook-delete-error', { defaultValue: "Couldn't remove the entry" }));
    }
  }

  if (!page) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const viewerId = session?.user.id ?? null;

  return (
    <div className="space-y-3 px-3 pb-8">
      {page.isOwner ? (
        <div className="glass-pane flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-site-text">
              {t('guestbook-who', { defaultValue: 'Who can sign your guestbook' })}
            </p>
            <p className="text-xs text-site-text-muted">
              {t('guestbook-who-desc', {
                defaultValue: 'You can hide any entry. Visitors can sign once a day.',
              })}
            </p>
          </div>
          <Select
            value={page.mode}
            onChange={(e) => {
              if (isGuestbookMode(e.target.value)) void setMode(e.target.value);
            }}
            aria-label={t('guestbook-who', { defaultValue: 'Who can sign your guestbook' })}
            className="w-44"
          >
            <option value="off">{t('guestbook-mode-off', { defaultValue: 'Closed' })}</option>
            <option value="following">
              {t('guestbook-mode-following', { defaultValue: 'People I follow' })}
            </option>
            <option value="everyone">
              {t('guestbook-mode-everyone', { defaultValue: 'Everyone' })}
            </option>
          </Select>
        </div>
      ) : null}

      {page.canSign ? (
        <form
          className="glass-pane space-y-2 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void sign();
          }}
        >
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, GUESTBOOK_BODY_MAX))}
            placeholder={t('guestbook-placeholder', { defaultValue: 'Leave a note…' })}
            aria-label={t('guestbook-placeholder', { defaultValue: 'Leave a note…' })}
            rows={2}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs tabular-nums text-site-text-dim">
              {draft.length}/{GUESTBOOK_BODY_MAX}
            </span>
            <Button
              type="submit"
              variant="accent"
              size="sm"
              loading={sending}
              disabled={!draft.trim()}
            >
              {t('guestbook-sign', { defaultValue: 'Sign' })}
            </Button>
          </div>
        </form>
      ) : null}

      {page.entries.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={
            page.mode === 'off' && !page.isOwner
              ? t('guestbook-closed', { defaultValue: 'This guestbook is closed' })
              : t('guestbook-empty', { defaultValue: 'No entries yet' })
          }
          description={
            page.isOwner && page.mode === 'off'
              ? t('guestbook-open-hint', {
                  defaultValue: 'Open it above to let visitors leave a note.',
                })
              : undefined
          }
        />
      ) : (
        <ul className="glass-fill divide-y divide-site-border overflow-hidden">
          {page.entries.map((entry) => {
            const name =
              entry.author.name || entry.author.handle || t('someone', { defaultValue: 'Someone' });
            const href = `/u/${entry.author.handle || entry.author.id}`;
            return (
              <li
                key={entry.id}
                className={`flex items-start gap-3 px-4 py-3 ${entry.hidden ? 'opacity-60' : ''}`}
              >
                <Link to={href} className="shrink-0">
                  <UserAvatar src={entry.author.image} alt={name} size={36} fallbackName={name} />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <Link to={href} className="font-semibold text-site-text hover:underline">
                      {name}
                    </Link>{' '}
                    <span className="text-xs text-site-text-dim">
                      {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                    </span>
                  </p>
                  <p className="mt-0.5 whitespace-pre-line break-words text-sm text-site-text">
                    {entry.body}
                  </p>
                </div>
                {page.isOwner ? (
                  <IconButton
                    icon={entry.hidden ? Eye : EyeOff}
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void toggleHidden(entry)}
                    label={
                      entry.hidden
                        ? t('guestbook-unhide', { defaultValue: 'Show entry' })
                        : t('guestbook-hide', { defaultValue: 'Hide entry' })
                    }
                  />
                ) : entry.author.id === viewerId ? (
                  <IconButton
                    icon={Trash2}
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void remove(entry)}
                    label={t('guestbook-delete', { defaultValue: 'Delete your entry' })}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {page.nextCursor ? (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => void more()} loading={loadingMore}>
            {t('guestbook-more', { defaultValue: 'Load more' })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
