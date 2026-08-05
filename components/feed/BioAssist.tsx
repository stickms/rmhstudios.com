'use client';

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

type Tone = 'friendly' | 'professional' | 'funny';

const TONES: Tone[] = ['friendly', 'professional', 'funny'];

/**
 * "Write one for me" chips under the bio field.
 *
 * The draft REPLACES the field, which is why the previous value is stashed and
 * offered back as an undo: the button is one tap away from the bio someone
 * actually wrote, and a generated line landing on top of it with no way back
 * would be a destructive action fired by a curiosity click.
 *
 * The member's signals (their posts, tags and badges) are gathered server-side —
 * this component sends nothing but a tone.
 */
export function BioAssist({
  value,
  onChange,
  maxChars,
}: {
  value: string;
  onChange: (next: string) => void;
  maxChars: number;
}) {
  const { t } = useTranslation('feed');
  const [busy, setBusy] = useState<Tone | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);

  const TONE_LABELS: Record<Tone, string> = {
    friendly: t('bio-tone-friendly', { defaultValue: 'Friendly' }),
    professional: t('bio-tone-professional', { defaultValue: 'Professional' }),
    funny: t('bio-tone-funny', { defaultValue: 'Funny' }),
  };

  const run = async (tone: Tone) => {
    setBusy(tone);
    try {
      const res = await fetch('/api/ai/bio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tone, maxChars }),
      });
      if (res.status === 503) {
        toast.error(t('ai-unavailable', { defaultValue: 'AI assist is unavailable right now.' }));
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || t('bio-failed', { defaultValue: 'Could not write a bio' }));
        return;
      }
      if (!data.bio) {
        // Nothing to write from — an honest empty result, not a failure.
        toast.info(
          t('bio-not-enough', {
            defaultValue: 'Post a few times first — there is nothing to write from yet.',
          }),
        );
        return;
      }
      setPrevious(value);
      onChange(data.bio);
    } catch {
      toast.error(t('bio-failed', { defaultValue: 'Could not write a bio' }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label={t('bio-assist-label', { defaultValue: 'Write my bio with AI' })}
    >
      <span className="flex items-center gap-1 text-xs text-site-text-dim">
        <Sparkles className="h-3.5 w-3.5 text-site-accent" aria-hidden />
        {t('bio-assist-title', { defaultValue: 'Write one for me' })}
      </span>
      {TONES.map((tone) => (
        <button
          key={tone}
          type="button"
          disabled={busy !== null}
          onClick={() => run(tone)}
          className="inline-flex items-center gap-1 rounded-full border border-site-border px-2.5 py-1 text-xs text-site-text-muted transition-colors hover:bg-site-surface-hover hover:text-site-text disabled:opacity-50"
        >
          {busy === tone ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
          {TONE_LABELS[tone]}
        </button>
      ))}
      {previous !== null && (
        <button
          type="button"
          onClick={() => {
            onChange(previous);
            setPrevious(null);
          }}
          className="rounded-full px-2.5 py-1 text-xs text-site-text-dim underline transition-colors hover:text-site-text"
        >
          {t('bio-undo', { defaultValue: 'Undo' })}
        </button>
      )}
    </div>
  );
}
