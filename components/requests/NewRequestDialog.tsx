'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  REQUEST_BODY_MAX,
  REQUEST_BODY_MIN,
  REQUEST_TITLE_MAX,
  REQUEST_TITLE_MIN,
} from '@/lib/requests/status';
import type { FeatureRequestDTO } from '@/lib/requests/schema';

export function NewRequestDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (request: FeatureRequestDTO) => void;
}) {
  const { t } = useTranslation('c-roadmap');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const valid =
    title.trim().length >= REQUEST_TITLE_MIN && body.trim().length >= REQUEST_BODY_MIN;

  async function submit() {
    if (!valid) return;
    setSaving(true);
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body: body.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as FeatureRequestDTO & { error?: string };
      if (!res.ok) {
        toast.error(
          data.error ?? t('request-create-failed', { defaultValue: 'Could not file that request' }),
        );
        return;
      }
      onCreated(data);
      setTitle('');
      setBody('');
      onOpenChange(false);
      toast.success(t('request-created', { defaultValue: 'Request filed' }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullscreen>
        <DialogTitle>{t('request-new-title', { defaultValue: 'Request a feature' })}</DialogTitle>
        <DialogDescription>
          {t('request-new-description', {
            defaultValue:
              'Search the board first — voting on an existing request counts for more than a duplicate.',
          })}
        </DialogDescription>

        <div className="space-y-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, REQUEST_TITLE_MAX))}
            placeholder={t('request-title-placeholder', {
              defaultValue: 'One sentence: what do you want?',
            })}
            aria-label={t('request-title-label', { defaultValue: 'Request title' })}
          />
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, REQUEST_BODY_MAX))}
            rows={6}
            placeholder={t('request-body-placeholder', {
              defaultValue: 'What are you trying to do, and what stops you today?',
            })}
            aria-label={t('request-body-label', { defaultValue: 'Request details' })}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('request-cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button variant="accent" onClick={submit} loading={saving} disabled={!valid}>
            {t('request-submit', { defaultValue: 'File request' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
