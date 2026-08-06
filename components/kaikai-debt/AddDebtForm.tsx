'use client';

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LogIn, Receipt, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useSession } from '@/components/Providers';
import { MAX_CLAIM_CHARS, type DebtEntryDto } from '@/lib/kaikai-debt/debt';
import { playDebtAdded, playRejected } from '@/lib/kaikai-debt/sound';

/** The `/entries` response, narrowed to the fields the page updates from. */
export interface AddDebtResult {
  entry: DebtEntryDto;
  basisCents: number;
  contributorCount: number;
}

interface AddDebtFormProps {
  onAdded: (payload: AddDebtResult) => void;
  disabled?: boolean;
}

/**
 * "What does Kaikai owe you?" — prose in, appraised ledger line out.
 *
 * ## Why there is no amount field
 *
 * Letting the submitter name the figure turns the ledger into a contest over who
 * types the most zeroes. Routing it through DeepSeek means the number is at
 * least argued for, and the server's clamp ($5–$250) bounds it regardless of
 * what either of them decides. The trade — you cannot set the price of your own
 * burrito — is the joke working as intended.
 *
 * ## The sign-in gate
 *
 * Rendered as the form's own state rather than by hiding the form: someone who
 * arrives at a debt counter should see the thing they are being invited to do
 * before being asked to sign in for it. `callbackURL` brings them straight back
 * here afterwards. The API enforces the same rule (401), so this is UX and not
 * the security boundary.
 */
export function AddDebtForm({ onAdded, disabled }: AddDebtFormProps) {
  const { t } = useTranslation('c-kaikai-debt');
  const { data: session, isPending } = useSession();
  const [claim, setClaim] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const signedIn = Boolean(session?.user);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = claim.trim();
    if (!text || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/kaikai-debt/entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // The button can be double-fired and the service worker's outbox
          // replays writes by design; without a key, one burrito becomes two.
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ claim: text }),
      });

      const data: unknown = await res.json().catch(() => null);

      if (res.status === 422) {
        // The appraiser declined. Its sentence is the useful part, so it is
        // shown verbatim rather than replaced with a generic validation error.
        playRejected();
        toast.error(
          (data as { error?: string })?.error ??
            t('add.declined', { defaultValue: 'The appraiser declined that one.' }),
        );
        return;
      }

      if (!res.ok) {
        playRejected();
        toast.error(
          (data as { error?: string })?.error ??
            t('add.failed', { defaultValue: 'Could not add that to his tab. Try again.' }),
        );
        return;
      }

      const payload = data as AddDebtResult;
      playDebtAdded();
      setClaim('');
      onAdded(payload);
      toast.success(
        t('add.success', {
          defaultValue: 'Added to his tab: {{item}}',
          item: payload.entry.item,
        }),
      );
    } catch {
      playRejected();
      toast.error(t('add.offline', { defaultValue: 'Network trouble. Try again.' }));
    } finally {
      setSubmitting(false);
    }
  }

  if (!isPending && !signedIn) {
    return (
      <div className="glass-pane flex flex-col items-start gap-3 rounded-site p-5">
        <h2 className="font-display text-lg font-semibold text-site-text">
          {t('add.title', { defaultValue: 'Put something on his tab' })}
        </h2>
        <p className="text-sm text-site-text-muted">
          {t('add.signInPrompt', {
            defaultValue:
              'Anyone can add to Kaikai’s debt — but every line says who added it, so you’ll need to sign in first.',
          })}
        </p>
        <Button asChild size="sm">
          <Link to="/login" search={{ callbackURL: '/kaikaidebtcounter' }}>
            <LogIn aria-hidden />
            {t('add.signIn', { defaultValue: 'Sign in to add debt' })}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="glass-pane flex flex-col gap-3 rounded-site p-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-site-text">
          {t('add.title', { defaultValue: 'Put something on his tab' })}
        </h2>
        <p className="mt-1 text-sm text-site-text-muted">
          {t('add.helpUncapped', {
            defaultValue:
              'Describe what he owes you. The appraiser sets the price — a coffee or a car, there’s no ceiling — and it starts earning interest immediately.',
          })}
        </p>
      </div>

      <Textarea
        value={claim}
        onChange={(e) => setClaim(e.target.value.slice(0, MAX_CLAIM_CHARS))}
        maxLength={MAX_CLAIM_CHARS}
        rows={3}
        disabled={submitting || disabled}
        placeholder={t('add.placeholder', {
          defaultValue: 'He said he’d Venmo me for the pizza in March. He did not.',
        })}
        aria-label={t('add.label', { defaultValue: 'What does Kaikai owe you?' })}
      />

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-site-text-dim" aria-hidden>
          {claim.length}/{MAX_CLAIM_CHARS}
        </span>
        <Button type="submit" size="sm" loading={submitting} disabled={!claim.trim() || disabled}>
          {submitting ? <Sparkles aria-hidden /> : <Receipt aria-hidden />}
          {submitting
            ? t('add.appraising', { defaultValue: 'Appraising…' })
            : t('add.submit', { defaultValue: 'Add to the debt' })}
        </Button>
      </div>
    </form>
  );
}
