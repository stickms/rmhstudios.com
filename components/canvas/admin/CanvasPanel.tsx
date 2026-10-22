'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { fetchJson } from '@/lib/http';
import { CANVAS_SIZES, type CanvasEventView } from '@/lib/canvas/shared';

type Row = CanvasEventView & { placements: number };

export default function CanvasPanel() {
  const { t } = useTranslation('f-canvas');
  const confirm = useConfirm();
  const q = useQuery({
    queryKey: ['canvas', 'admin'],
    queryFn: () => fetchJson<{ events: Row[] }>('/api/admin/canvas'),
  });
  const [title, setTitle] = useState('');
  const [size, setSize] = useState<string>('128');
  const [minutes, setMinutes] = useState('5');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await q.refetch();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t('admin-error', { defaultValue: 'Something went wrong' }),
      );
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      await fetchJson('/api/admin/canvas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          size: Number(size),
          cooldownMinutes: Number(minutes),
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
        }),
      });
      setTitle('');
      toast.success(t('admin-created', { defaultValue: 'Canvas event scheduled' }));
    });

  const ready = title.trim() && startsAt && endsAt && Number(minutes) >= 1;
  return (
    <div className="space-y-6">
      <form
        className="glass-pane space-y-3 rounded-site p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <h2 className="font-semibold text-site-text">
          {t('admin-new', { defaultValue: 'Start a canvas event' })}
        </h2>
        <Input
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          aria-label={t('admin-title-label', { defaultValue: 'Event title' })}
          placeholder={t('admin-title-label', { defaultValue: 'Event title' })}
        />
        <LiquidTabs
          aria-label={t('admin-size', { defaultValue: 'Canvas size' })}
          value={size}
          onChange={setSize}
          tabs={CANVAS_SIZES.map((s) => ({ id: String(s), label: `${s} × ${s}` }))}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm text-site-text-muted">
            {t('admin-cooldown', { defaultValue: 'Minutes between pixels' })}
            <Input
              type="number"
              min={1}
              max={120}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm text-site-text-muted">
            {t('admin-start', { defaultValue: 'Starts' })}
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm text-site-text-muted">
            {t('admin-end', { defaultValue: 'Ends' })}
            <Input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </label>
        </div>
        <Button type="submit" variant="accent" loading={busy} disabled={!ready}>
          {t('admin-create', { defaultValue: 'Schedule event' })}
        </Button>
      </form>
      <ul className="space-y-2">
        {q.data?.events.map((e) => (
          <li
            key={e.id}
            className="glass-fill flex items-center justify-between gap-3 rounded-site p-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-site-text">{e.title}</p>
              <p className="text-xs text-site-text-muted">
                {t('admin-row', {
                  defaultValue: '{{size}}px, {{phase}}, {{count}} pixels placed',
                  size: e.width,
                  phase: e.phase,
                  count: e.placements,
                })}
              </p>
            </div>
            <IconButton
              icon={Trash2}
              variant="ghost"
              size="icon-sm"
              label={t('admin-delete', { defaultValue: 'Delete event' })}
              disabled={busy}
              onClick={async () => {
                const ok = await confirm({
                  title: t('admin-confirm', { defaultValue: 'Delete this event and its history?' }),
                  confirmLabel: t('admin-delete', { defaultValue: 'Delete event' }),
                  danger: true,
                });
                if (ok)
                  void run(() => fetchJson(`/api/admin/canvas/${e.id}`, { method: 'DELETE' }));
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
