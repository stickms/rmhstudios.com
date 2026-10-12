'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react';
import { WidgetFrame } from '@/components/ui/widget-frame';
import { useIdleReady } from '@/hooks/useIdleReady';

/**
 * P9 — the retro hit counter. Only rendered for a profile whose owner switched
 * it on. The visit is reported AFTER the page has gone idle, in its own request,
 * so counting can never delay the profile; the server counts a given visitor at
 * most once a day and answers with the running total.
 */
export default function VisitorCounterModule({ title, userId }: { title: string; userId: string }) {
  const { t } = useTranslation('f-profile-plus');
  const idle = useIdleReady();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!idle) return;
    let cancelled = false;
    fetch(`/api/profile/${encodeURIComponent(userId)}/visit`, { method: 'POST' })
      .then((r) => (r.ok ? (r.json() as Promise<{ count: number }>) : null))
      .then((json) => {
        if (!cancelled && json) setCount(json.count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [idle, userId]);

  // Not enabled (404) or failed: show nothing rather than a broken widget.
  if (count === null) return null;

  const digits = String(count).padStart(6, '0').split('');
  return (
    <WidgetFrame title={title} icon={Eye}>
      <div
        className="flex items-center gap-1"
        role="img"
        aria-label={t('counter-aria', {
          count,
          defaultValue_one: '{{count}} visitor',
          defaultValue: '{{count}} visitors',
        })}
      >
        {digits.map((d, i) => (
          <span
            key={i}
            aria-hidden
            className="glass-inset rounded-site-sm px-2 py-1 font-mono text-xl font-bold tabular-nums text-site-text"
          >
            {d}
          </span>
        ))}
        <span className="ml-2 text-xs text-site-text-dim">
          {t('counter-caption', { defaultValue: 'visitors' })}
        </span>
      </div>
    </WidgetFrame>
  );
}
