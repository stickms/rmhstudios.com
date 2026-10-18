'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { POSTCARD_MAX, type SnapshotView } from '@/lib/worlds/schema';

/** A visitor's postcard form plus the cards already left on this world. */
export function PostcardBox({ world, onSent }: { world: SnapshotView; onSent?: () => void }) {
  const { t } = useTranslation('f-worlds');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      const res = await fetch(`/api/worlds/visit/${world.code}/postcard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (res.status === 401) {
        toast.error(t('postcard-signin', { defaultValue: 'Sign in to leave a postcard.' }));
      } else if (!res.ok) {
        toast.error(t('postcard-failed', { defaultValue: 'Could not send your postcard.' }));
      } else {
        toast.success(t('postcard-sent', { defaultValue: 'Postcard sent.' }));
        setBody('');
        onSent?.();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {!world.isOwner && (
        <>
          <Textarea
            value={body}
            maxLength={POSTCARD_MAX}
            rows={2}
            onChange={(e) => setBody(e.target.value)}
            aria-label={t('postcard-label', { defaultValue: 'Postcard' })}
            placeholder={t('postcard-placeholder', { defaultValue: 'Leave a short postcard...' })}
          />
          <Button size="sm" disabled={busy || !body.trim()} onClick={send}>
            <Send className="size-4" aria-hidden />
            {t('postcard-send', { defaultValue: 'Send postcard' })}
          </Button>
        </>
      )}
      {world.postcards.length > 0 && (
        <ul className="flex max-h-40 flex-col gap-1.5 overflow-y-auto text-sm">
          {world.postcards.map((p) => (
            <li key={p.id} className="glass-inset rounded-site px-2.5 py-1.5">
              <span className="font-medium text-site-text">{p.author.name}</span>
              <span className="text-site-text-muted"> - {p.body}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
