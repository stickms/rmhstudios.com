import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
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
import { api } from '@/lib/contract/client';
import {
  createWebhookApi,
  updateWebhookApi,
  type WebhookEndpointRow,
} from '@/lib/developer/webhooks.contract';
import { WEBHOOK_EVENTS } from '@/lib/webhooks/events';
import { failureText } from './format';

/** What the dialog reports back: the saved row, and the secret when the endpoint was just created. */
export interface EndpointSaved {
  endpoint: WebhookEndpointRow;
  secret?: string;
}

interface EndpointFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present to edit this endpoint; absent to create one. */
  endpoint?: WebhookEndpointRow | undefined;
  onSaved: (saved: EndpointSaved) => void;
}

/**
 * Create or edit an endpoint. The form lives inside the dialog content, so it
 * remounts, and starts from the endpoint's values, each time the dialog opens.
 */
export function EndpointFormDialog({ open, onOpenChange, endpoint, onSaved }: EndpointFormDialogProps) {
  const { t } = useTranslation('dev-webhooks');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {endpoint
              ? t('form-title-edit', { defaultValue: 'Edit endpoint' })
              : t('form-title-create', { defaultValue: 'Create endpoint' })}
          </DialogTitle>
          <DialogDescription>
            {t('form-intro', {
              defaultValue: 'We send a signed HTTPS POST to this URL for each event you pick.',
            })}
          </DialogDescription>
        </DialogHeader>
        <EndpointForm endpoint={endpoint} onCancel={() => onOpenChange(false)} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  );
}

function EndpointForm({
  endpoint,
  onCancel,
  onSaved,
}: {
  endpoint: WebhookEndpointRow | undefined;
  onCancel: () => void;
  onSaved: (saved: EndpointSaved) => void;
}) {
  const { t } = useTranslation('dev-webhooks');
  const [url, setUrl] = useState(endpoint?.url ?? '');
  const [description, setDescription] = useState(endpoint?.description ?? '');
  const [events, setEvents] = useState<string[]>(endpoint?.events ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const all = events.includes('*');
  const valid = url.trim().length > 0 && events.length > 0;

  function toggle(name: string) {
    setEvents((cur) => (cur.includes(name) ? cur.filter((e) => e !== name) : [...cur, name]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const body = { url: url.trim(), events, description: description.trim() };
      if (endpoint) {
        const saved = await api(updateWebhookApi, {
          params: { id: endpoint.id },
          body: { ...body, description: body.description || null },
        });
        onSaved({ endpoint: saved.endpoint });
      } else {
        const created = await api(createWebhookApi, { body });
        onSaved({ endpoint: created.endpoint, secret: created.secret });
      }
    } catch (err) {
      setError(failureText(err, t('form-error', { defaultValue: 'Could not save the endpoint.' })));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="webhook-url" className="t-label block">
          {t('form-url', { defaultValue: 'Endpoint URL' })}
        </label>
        <Input
          id="webhook-url"
          type="url"
          dir="ltr"
          required
          maxLength={2048}
          placeholder="https://example.com/webhooks"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="webhook-description" className="t-label block">
          {t('form-description', { defaultValue: 'Description (optional)' })}
        </label>
        <Input
          id="webhook-description"
          maxLength={200}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <fieldset className="space-y-1">
        <legend className="t-label mb-1">{t('form-events', { defaultValue: 'Events' })}</legend>
        <label className="flex min-h-9 items-center gap-2 t-body">
          <input
            type="checkbox"
            checked={all}
            onChange={() => setEvents(all ? [] : ['*'])}
            className="accent-site-accent"
          />
          {t('form-events-all', { defaultValue: 'All events' })}
        </label>
        {WEBHOOK_EVENTS.map((event) => (
          <label key={event.name} className="flex min-h-9 items-start gap-2 py-1 t-body">
            <input
              type="checkbox"
              checked={all || events.includes(event.name)}
              disabled={all}
              onChange={() => toggle(event.name)}
              className="mt-1 accent-site-accent"
            />
            <span className="font-mono" dir="ltr">
              {event.name}
            </span>
          </label>
        ))}
      </fieldset>

      {error && (
        <p role="alert" className="t-body text-site-danger">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('form-cancel', { defaultValue: 'Cancel' })}
        </Button>
        <Button type="submit" variant="primary" loading={saving} disabled={!valid}>
          {endpoint
            ? t('form-save', { defaultValue: 'Save changes' })
            : t('form-create', { defaultValue: 'Create endpoint' })}
        </Button>
      </DialogFooter>
    </form>
  );
}
