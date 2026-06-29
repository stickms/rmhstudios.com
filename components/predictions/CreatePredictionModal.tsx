'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { Market } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (m: Market) => void;
}

export function CreatePredictionModal({ open, onClose, onCreated }: Props) {
  const { t } = useTranslation('c-predictions');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function submit() {
    if (submitting) return;
    if (title.trim().length < 8) {
      toast.error(t('title-too-short', { defaultValue: 'Give your prediction a clear title (8+ chars).' }));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          closesAt: closesAt ? new Date(closesAt).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t('create-failed', { defaultValue: 'Could not submit prediction' }));
        return;
      }
      onCreated(data.market as Market);
      toast.success(t('submitted', { defaultValue: 'Submitted! An admin will review it shortly.' }));
      setTitle('');
      setDescription('');
      setClosesAt('');
      onClose();
    } catch {
      toast.error(t('network-error', { defaultValue: 'Network error' }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl border border-site-border bg-site-bg p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg text-site-text">
            {t('new-prediction', { defaultValue: 'New prediction' })}
          </h2>
          <button onClick={onClose} className="text-site-text-dim hover:text-site-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-site-text-dim">
          {t('phrase-hint', {
            defaultValue: 'Phrase it as a yes/no question that will clearly resolve. Submissions are reviewed by an admin before they go live.',
          })}
        </p>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-site-text-dim">
            {t('question', { defaultValue: 'Question' })}
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={160}
            placeholder={t('title-placeholder', { defaultValue: 'Will RMHbox hit 1,000 daily players by August?' })}
            className="bg-site-surface border border-site-border rounded-lg px-3 py-2 text-sm text-site-text"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-site-text-dim">
            {t('details-optional', { defaultValue: 'Details (optional)' })}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder={t('details-placeholder', { defaultValue: 'How this resolves, sources, edge cases…' })}
            className="bg-site-surface border border-site-border rounded-lg px-3 py-2 text-sm text-site-text resize-none"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-site-text-dim">
            {t('closes-optional', { defaultValue: 'Trading closes (optional)' })}
          </label>
          <input
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            className="bg-site-surface border border-site-border rounded-lg px-3 py-2 text-sm text-site-text"
          />
        </div>

        <Button variant="accent" onClick={submit} disabled={submitting} className="w-full">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('submit', { defaultValue: 'Submit for review' })}
        </Button>
      </div>
    </div>
  );
}
