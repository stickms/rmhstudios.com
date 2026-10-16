'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Select } from '@/components/ui/select';
import { LOCALES, LOCALE_LABELS } from '@/lib/i18n/config';
import { fetchJson } from '@/lib/http';

const TARGETS = LOCALES.filter((l) => l !== 'en');

export default function TranslationsPanel() {
  const { t } = useTranslation('f-delight');
  const [locale, setLocale] = useState<string>(TARGETS[0]);
  const q = useQuery({
    queryKey: ['delight', 'admin', 'translations', locale],
    queryFn: () =>
      fetchJson<{
        suggestions: { id: string; ns: string; key: string; text: string; votes: number }[];
      }>(`/api/admin/delight/translations?locale=${locale}`),
  });
  const review = async (id: string, status: 'accepted' | 'rejected') => {
    try {
      await fetchJson(`/api/admin/delight/translations/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await q.refetch();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t('admin-error', { defaultValue: 'Something went wrong' }),
      );
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-site-text-muted">
          <span className="mb-1 block">{t('tr-locale', { defaultValue: 'Language' })}</span>
          <Select value={locale} onChange={(e) => setLocale(e.target.value)}>
            {TARGETS.map((l) => (
              <option key={l} value={l}>
                {LOCALE_LABELS[l]}
              </option>
            ))}
          </Select>
        </label>
        <Button asChild variant="ghost">
          <a href={`/api/admin/delight/translations/export?locale=${locale}`} download>
            <Download className="size-4" aria-hidden />
            {t('tr-export', { defaultValue: 'Export accepted (JSON)' })}
          </a>
        </Button>
      </div>
      {q.data && q.data.suggestions.length === 0 ? (
        <EmptyState title={t('tr-admin-empty', { defaultValue: 'No open suggestions' })} />
      ) : (
        <ul className="space-y-2">
          {q.data?.suggestions.map((s) => (
            <li key={s.id} className="glass-fill flex items-center gap-3 rounded-site px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-site-text-dim">
                  {s.ns} / {s.key}
                </p>
                <p className="text-sm text-site-text">{s.text}</p>
              </div>
              <span className="text-sm tabular-nums text-site-text-muted">{s.votes}</span>
              <IconButton
                icon={Check}
                variant="ghost"
                size="icon-sm"
                label={t('tr-accept', { defaultValue: 'Accept' })}
                onClick={() => void review(s.id, 'accepted')}
              />
              <IconButton
                icon={X}
                variant="ghost"
                size="icon-sm"
                label={t('tr-reject', { defaultValue: 'Reject' })}
                onClick={() => void review(s.id, 'rejected')}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
