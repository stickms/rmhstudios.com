'use client';

import { useEffect, useState } from 'react';
import { Megaphone, X } from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  linkLabel: string | null;
  variant: string;
  createdAt: string;
}

const VARIANT_STYLES: Record<string, string> = {
  info: 'border-site-accent/40 bg-site-accent-dim',
  success: 'border-emerald-500/40 bg-emerald-500/10',
  warning: 'border-amber-500/40 bg-amber-500/10',
  event: 'border-violet-500/40 bg-violet-500/10',
};

const DISMISS_KEY = 'rmh-dismissed-announcements';

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]');
  } catch {
    return [];
  }
}

/** Admin-authored announcement banners, pinned at the top of the feed. */
export function FeedAnnouncements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    setDismissed(readDismissed());
    fetch('/api/announcements')
      .then((r) => (r.ok ? r.json() : { announcements: [] }))
      .then((d) => setItems(d.announcements ?? []))
      .catch(() => {});
  }, []);

  const dismiss = (id: string) => {
    const next = [...new Set([...dismissed, id])];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next.slice(-50)));
    } catch {
      // ignore
    }
  };

  const visible = items.filter((a) => !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 px-3 pt-3">
      {visible.map((a) => (
        <div
          key={a.id}
          className={`relative rounded-xl border p-3 pr-9 ${VARIANT_STYLES[a.variant] ?? VARIANT_STYLES.info}`}
        >
          <button
            onClick={() => dismiss(a.id)}
            aria-label="Dismiss announcement"
            className="absolute right-2 top-2 rounded-md p-1 text-site-text-muted hover:bg-site-surface-hover hover:text-site-text"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-2">
            <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-site-accent" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-site-text">{a.title}</p>
              <p className="mt-0.5 whitespace-pre-line text-sm text-site-text-muted">{a.body}</p>
              {a.linkUrl && (
                <a
                  href={a.linkUrl}
                  className="mt-1 inline-block text-sm font-medium text-site-accent hover:underline"
                  target={a.linkUrl.startsWith('http') ? '_blank' : undefined}
                  rel="noreferrer"
                >
                  {a.linkLabel || 'Learn more'} →
                </a>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
