'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { fetchJson } from '@/lib/http';

interface Hunt {
  id: string;
  title: string;
  active: boolean;
  _count: { progress: number };
  clues: { position: number; clueText: string; answer: string; hiddenPath: string }[];
}
const blank = { clueText: '', hint: '', answer: '', hiddenPath: '' };

export default function HuntPanel() {
  const { t } = useTranslation('f-delight');
  const q = useQuery({
    queryKey: ['delight', 'admin', 'hunts'],
    queryFn: () => fetchJson<{ hunts: Hunt[] }>('/api/admin/delight/hunts'),
  });
  const [title, setTitle] = useState('');
  const [clues, setClues] = useState([{ ...blank }]);
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
  const json = (method: string, body?: unknown) => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const setClue = (i: number, k: keyof typeof blank, v: string) =>
    setClues((cs) => cs.map((c, j) => (j === i ? { ...c, [k]: v } : c)));

  return (
    <div className="space-y-6">
      <form
        className="glass-pane space-y-3 rounded-site p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await fetchJson('/api/admin/delight/hunts', json('POST', { title, clues }));
            setTitle('');
            setClues([{ ...blank }]);
            toast.success(
              t('hunt-admin-created', {
                defaultValue: 'Hunt created (inactive until you switch it on)',
              }),
            );
          });
        }}
      >
        <Input
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('hunt-admin-name', { defaultValue: 'Hunt title' })}
          aria-label={t('hunt-admin-name', { defaultValue: 'Hunt title' })}
        />
        {clues.map((c, i) => (
          <fieldset key={i} className="glass-inset space-y-2 rounded-site p-3">
            <legend className="px-1 text-xs text-site-text-dim">
              {t('hunt-admin-clue', { defaultValue: 'Clue {{n}}', n: i + 1 })}
            </legend>
            <Input
              value={c.clueText}
              maxLength={500}
              onChange={(e) => setClue(i, 'clueText', e.target.value)}
              placeholder={t('hunt-admin-text', {
                defaultValue: 'Clue text (shown by the hidden marker)',
              })}
              aria-label={t('hunt-admin-text', {
                defaultValue: 'Clue text (shown by the hidden marker)',
              })}
            />
            <Input
              value={c.answer}
              maxLength={120}
              onChange={(e) => setClue(i, 'answer', e.target.value)}
              placeholder={t('hunt-admin-answer', { defaultValue: 'Answer' })}
              aria-label={t('hunt-admin-answer', { defaultValue: 'Answer' })}
            />
            <Input
              value={c.hiddenPath}
              maxLength={200}
              onChange={(e) => setClue(i, 'hiddenPath', e.target.value)}
              placeholder={t('hunt-admin-path', {
                defaultValue: 'Page where it is hidden, e.g. /news',
              })}
              aria-label={t('hunt-admin-path', {
                defaultValue: 'Page where it is hidden, e.g. /news',
              })}
            />
            <Input
              value={c.hint}
              maxLength={300}
              onChange={(e) => setClue(i, 'hint', e.target.value)}
              placeholder={t('hunt-admin-hint', {
                defaultValue: 'Pointer shown on /hunt (optional)',
              })}
              aria-label={t('hunt-admin-hint', {
                defaultValue: 'Pointer shown on /hunt (optional)',
              })}
            />
            {clues.length > 1 && (
              <IconButton
                icon={Trash2}
                variant="ghost"
                size="icon-sm"
                label={t('hunt-admin-remove-clue', { defaultValue: 'Remove clue' })}
                onClick={() => setClues((cs) => cs.filter((_, j) => j !== i))}
              />
            )}
          </fieldset>
        ))}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={clues.length >= 20}
            onClick={() => setClues((cs) => [...cs, { ...blank }])}
          >
            <Plus className="size-4" aria-hidden />
            {t('hunt-admin-add-clue', { defaultValue: 'Add clue' })}
          </Button>
          <Button
            type="submit"
            variant="accent"
            loading={busy}
            disabled={
              title.trim().length < 2 ||
              clues.some((c) => !c.clueText.trim() || !c.answer.trim() || !c.hiddenPath.trim())
            }
          >
            {t('hunt-admin-create', { defaultValue: 'Create hunt' })}
          </Button>
        </div>
      </form>

      <ul className="space-y-2">
        {q.data?.hunts.map((h) => (
          <li
            key={h.id}
            className="glass-fill flex flex-wrap items-center gap-3 rounded-site px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-site-text">{h.title}</p>
              <p className="text-xs text-site-text-dim">
                {t('hunt-admin-meta', {
                  defaultValue: '{{clues}} clues, {{done}} finishers',
                  clues: h.clues.length,
                  done: h._count.progress,
                })}
              </p>
            </div>
            <Button
              size="sm"
              variant={h.active ? 'accent' : 'ghost'}
              disabled={busy}
              onClick={() =>
                void run(() =>
                  fetchJson(
                    `/api/admin/delight/hunts/${h.id}`,
                    json('PATCH', { active: !h.active }),
                  ),
                )
              }
            >
              {h.active
                ? t('hunt-admin-live', { defaultValue: 'Live: switch off' })
                : t('hunt-admin-start', { defaultValue: 'Switch on' })}
            </Button>
            <IconButton
              icon={Trash2}
              variant="ghost"
              size="icon-sm"
              label={t('hunt-admin-delete', { defaultValue: 'Delete hunt' })}
              onClick={() =>
                void run(() => fetchJson(`/api/admin/delight/hunts/${h.id}`, json('DELETE')))
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
