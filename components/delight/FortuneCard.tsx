'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Cookie } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchJson } from '@/lib/http';
import { FORTUNE_MAX } from '@/lib/delight/shared';

/** Z4 — today's community fortune, with a one-line submission form (moderated before it runs). */
export default function FortuneCard() {
  const { t } = useTranslation('f-delight');
  const { data: session } = useSession();
  const [fortune, setFortune] = useState<string | null | undefined>(undefined);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchJson<{ fortune: { text: string } | null }>('/api/fortune/today')
      .then((d) => alive && setFortune(d.fortune?.text ?? null))
      .catch(() => alive && setFortune(null));
    return () => {
      alive = false;
    };
  }, []);

  if (fortune === undefined) return null;

  const submit = async () => {
    setBusy(true);
    try {
      await fetchJson('/api/fortune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      toast.success(
        t('fortune-sent', { defaultValue: 'Thanks! It will run once a moderator approves it.' }),
      );
      setText('');
      setComposing(false);
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t('fortune-failed', { defaultValue: 'Could not send that' }),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      className="glass-fill rounded-site p-4"
      aria-label={t('fortune-title', { defaultValue: 'Fortune cookie' })}
    >
      <div className="flex items-start gap-3">
        <Cookie className="mt-0.5 size-5 shrink-0 text-site-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-site-text-dim">
            {t('fortune-title', { defaultValue: 'Fortune cookie' })}
          </p>
          <p className="mt-1 text-site-text">
            {fortune ??
              t('fortune-none', { defaultValue: 'No fortune today. Write the next one!' })}
          </p>
          {session && !composing && (
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setComposing(true)}>
              {t('fortune-add', { defaultValue: 'Submit a fortune' })}
            </Button>
          )}
          {session && composing && (
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <Input
                value={text}
                maxLength={FORTUNE_MAX}
                onChange={(e) => setText(e.target.value)}
                aria-label={t('fortune-input', { defaultValue: 'Your fortune' })}
                placeholder={t('fortune-placeholder', { defaultValue: 'A kind, short one-liner' })}
              />
              <Button
                type="submit"
                variant="accent"
                loading={busy}
                disabled={text.trim().length < 8}
              >
                {t('fortune-send', { defaultValue: 'Send' })}
              </Button>
            </form>
          )}
        </div>
      </div>
    </aside>
  );
}
