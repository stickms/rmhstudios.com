'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('new-prediction', { defaultValue: 'New prediction' })}</DialogTitle>
          <DialogDescription>
            {t('phrase-hint', {
              defaultValue: 'Phrase it as a yes/no question that will clearly resolve. Submissions are reviewed by an admin before they go live.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pred-question">{t('question', { defaultValue: 'Question' })}</Label>
            <Input
              id="pred-question"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              placeholder={t('title-placeholder', { defaultValue: 'Will RMHbox hit 1,000 daily players by August?' })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pred-details">{t('details-optional', { defaultValue: 'Details (optional)' })}</Label>
            <Textarea
              id="pred-details"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder={t('details-placeholder', { defaultValue: 'How this resolves, sources, edge cases…' })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pred-closes">{t('closes-optional', { defaultValue: 'Trading closes (optional)' })}</Label>
            <Input
              id="pred-closes"
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="accent" onClick={submit} loading={submitting}>
            {t('submit', { defaultValue: 'Submit for review' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
