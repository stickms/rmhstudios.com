'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface MarketOption {
  id: string;
  title: string;
}

/** Admin: define a season over a fixed set of existing markets. */
export function SeasonAdminForm({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation('f-forecasting');
  const [markets, setMarkets] = useState<MarketOption[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/predictions?filter=open')
      .then((r) => r.json())
      .then((d) => setMarkets(d.markets ?? []))
      .catch(() => setMarkets([]));
  }, []);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/forecasting/seasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          marketIds: [...picked],
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(t('created', { defaultValue: 'Season created' }));
      setTitle('');
      setPicked(new Set());
      onCreated();
    } catch {
      toast.error(t('create-failed', { defaultValue: 'Check the title, dates and markets' }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-site-sm glass-inset p-3">
      <summary className="cursor-pointer text-sm font-medium">
        {t('new-season', { defaultValue: 'New season (admin)' })}
      </summary>
      <div className="mt-3 flex flex-col gap-2">
        <Input
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('season-title', { defaultValue: 'Season title' })}
          aria-label={t('season-title', { defaultValue: 'Season title' })}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="date"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            aria-label={t('starts', { defaultValue: 'Starts' })}
          />
          <Input
            type="date"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            aria-label={t('ends', { defaultValue: 'Ends' })}
          />
        </div>
        <ul className="max-h-48 overflow-y-auto flex flex-col gap-1">
          {markets.map((m) => (
            <li key={m.id}>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={picked.has(m.id)}
                  onChange={(e) =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(m.id);
                      else next.delete(m.id);
                      return next;
                    })
                  }
                />
                {m.title}
              </label>
            </li>
          ))}
        </ul>
        <Button
          variant="accent"
          size="sm"
          className="self-end"
          disabled={busy || !title || !startsAt || !endsAt || picked.size === 0}
          onClick={create}
        >
          {t('create-season', { defaultValue: 'Create season' })}
        </Button>
      </div>
    </details>
  );
}
