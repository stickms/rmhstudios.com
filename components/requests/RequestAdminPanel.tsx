'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import {
  OFFICIAL_NOTE_MAX,
  REQUEST_STATUSES,
  validateStatusNote,
  type RequestStatus,
} from '@/lib/requests/status';
import type { FeatureRequestDTO } from '@/lib/requests/schema';
import { useRequestStatusLabels } from './RequestStatusBadge';

/**
 * The admin controls on a request card.
 *
 * The Save button is disabled by the *same* predicate the server refuses on
 * (`validateStatusNote`), rather than by a second hand-written copy of the
 * rule. That is the difference between a client hint and a client that can
 * drift out of agreement with the server about what "declined" means.
 */
export function RequestAdminPanel({
  request,
  onChanged,
}: {
  request: FeatureRequestDTO;
  onChanged: (next: FeatureRequestDTO) => void;
}) {
  const { t } = useTranslation('c-roadmap');
  const labels = useRequestStatusLabels();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<RequestStatus>(request.status);
  const [note, setNote] = useState(request.officialNote ?? '');
  const [saving, setSaving] = useState(false);

  const problem = validateStatusNote(status, note);

  async function save() {
    if (problem) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, officialNote: note.trim() || null }),
      });
      const data = (await res.json().catch(() => ({}))) as FeatureRequestDTO & { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? t('request-save-failed', { defaultValue: 'Could not save' }));
        return;
      }
      onChanged(data);
      setOpen(false);
      toast.success(t('request-saved', { defaultValue: 'Request updated' }));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" size="xs" className="mt-2" onClick={() => setOpen(true)}>
        {t('request-manage', { defaultValue: 'Manage' })}
      </Button>
    );
  }

  return (
    <div className="glass-inset mt-3 space-y-2 rounded-site p-3">
      <label className="block text-xs font-semibold text-site-text-muted" htmlFor={`s-${request.id}`}>
        {t('request-status', { defaultValue: 'Status' })}
      </label>
      <Select
        id={`s-${request.id}`}
        value={status}
        onChange={(e) => setStatus(e.target.value as RequestStatus)}
      >
        {REQUEST_STATUSES.map((s) => (
          <option key={s} value={s}>
            {labels[s]}
          </option>
        ))}
      </Select>

      <label className="block text-xs font-semibold text-site-text-muted" htmlFor={`n-${request.id}`}>
        {t('request-note-label', { defaultValue: 'Official reply' })}
      </label>
      <Textarea
        id={`n-${request.id}`}
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, OFFICIAL_NOTE_MAX))}
        rows={3}
        placeholder={t('request-note-placeholder', {
          defaultValue: 'Shipped and declined requests need a reason. Say it here.',
        })}
      />

      {problem ? (
        <p role="status" className="text-xs text-site-warning">
          {problem === 'NOTE_REQUIRED'
            ? t('request-note-required', {
                defaultValue: 'Shipped and declined requests need an official reply.',
              })
            : problem === 'NOTE_TOO_SHORT'
              ? t('request-note-too-short', {
                  defaultValue: 'That reply is too short to explain anything.',
                })
              : t('request-note-too-long', { defaultValue: 'That reply is too long.' })}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t('request-cancel', { defaultValue: 'Cancel' })}
        </Button>
        <Button variant="accent" size="sm" onClick={save} loading={saving} disabled={!!problem}>
          {t('request-save', { defaultValue: 'Save' })}
        </Button>
      </div>
    </div>
  );
}
