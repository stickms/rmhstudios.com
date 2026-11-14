import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Select } from '@/components/ui/select';
import { useSession } from '@/components/Providers';
import { useIdleReady } from '@/hooks/useIdleReady';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import type { WatchKind, WatchLevel } from '@/lib/discovery/schema';
import { api } from '@/lib/contract/client';
import { getDiscoveryWatchApi, setDiscoveryWatchApi } from '@/lib/discovery/discovery.contract';

/** A7 · Watch level picker (Not watching / Important only / Everything). Signed-in only, after idle. */
export function WatchControl({ kind, targetId }: { kind: WatchKind; targetId: string }) {
  const { t } = useTranslation('f-discovery');
  const { data: session } = useSession();
  const idle = useIdleReady();
  const [level, setLevel] = useState<WatchLevel | null>(null);
  const on = !!session && idle;
  // Steel M9: the picker appears after idle and a fetch.
  const arrival = useArrival(on && !!level);

  useEffect(() => {
    if (!on) return;
    let live = true;
    api(getDiscoveryWatchApi, { query: { kind, targetId }, retries: 0 })
      .then((d) => live && setLevel(d.level))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [on, kind, targetId]);

  if (!on || !level) return null;

  const change = async (next: WatchLevel) => {
    const prev = level;
    setLevel(next);
    const ok = await api(setDiscoveryWatchApi, { body: { kind, targetId, level: next } }).then(
      () => true,
      () => false,
    );
    if (!ok) {
      setLevel(prev);
      toast.error(t('watch-failed', { defaultValue: 'Could not change your watch setting.' }));
    }
  };

  return (
    <span className={cn('inline-flex items-center gap-1.5', arrival)}>
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
