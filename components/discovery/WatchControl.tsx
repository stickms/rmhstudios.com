'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Select } from '@/components/ui/select';
import { useSession } from '@/components/Providers';
import { useIdleReady } from '@/hooks/useIdleReady';
import type { WatchKind, WatchLevel } from '@/lib/discovery/schema';

/** A7 · Watch level picker (Not watching / Important only / Everything). Signed-in only, after idle. */
export function WatchControl({ kind, targetId }: { kind: WatchKind; targetId: string }) {
  const { t } = useTranslation('f-discovery');
  const { data: session } = useSession();
  const idle = useIdleReady();
  const [level, setLevel] = useState<WatchLevel | null>(null);
  const on = !!session && idle;

  useEffect(() => {
    if (!on) return;
    let live = true;
    fetch(`/api/discovery/watch?kind=${kind}&targetId=${encodeURIComponent(targetId)}`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ level: WatchLevel }>) : null))
      .then((d) => live && d && setLevel(d.level))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [on, kind, targetId]);

  if (!on || !level) return null;

  const change = async (next: WatchLevel) => {
    const prev = level;
    setLevel(next);
    const res = await fetch('/api/discovery/watch', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, targetId, level: next }),
    }).catch(() => null);
    if (!res?.ok) {
      setLevel(prev);
      toast.error(t('watch-failed', { defaultValue: 'Could not change your watch setting.' }));
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <Eye className="h-4 w-4 text-site-text-muted" aria-hidden />
      <Select
        controlSize="sm"
        value={level}
        onChange={(e) => void change(e.target.value as WatchLevel)}
        aria-label={t('watch-label', { defaultValue: 'Watch level' })}
        className="w-auto"
      >
        <option value="nothing">{t('watch-nothing', { defaultValue: 'Not watching' })}</option>
        <option value="important">
          {t('watch-important', { defaultValue: 'Important only' })}
        </option>
        <option value="all">{t('watch-all', { defaultValue: 'Everything' })}</option>
      </Select>
    </span>
  );
}
