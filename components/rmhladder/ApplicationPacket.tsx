'use client';

/**
 * RMHLadder — the per-application packet.
 *
 * Every answer this user has, ordered to match the form they are about to fill
 * in (`lib/rmhladder/ats-fields`), each with a copy button. That is the whole
 * feature: the retyping is not hard, it is *hunting* — the answer exists, the
 * user just has to find which of fourteen saved values the form wants next.
 *
 * ─────────────────────────────── guardrail ──────────────────────────────────
 * Nothing here submits anything. There is no prefilled POST, no automation, no
 * extension. The packet is text you copy; the final button is on the employer's
 * site and the user presses it. The footer says so, on screen, permanently.
 *
 * Rows are repeated content, so they are L1 `.glass-fill` — no backdrop blur on
 * a list that can run to twenty rows.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, ExternalLink, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  atsPlatformLabel,
  buildApplicationPacket,
  packetAsText,
  type AtsPlatform,
  type PacketApplicant,
  type PacketApplication,
  type PacketField,
} from '@/lib/rmhladder/ats-fields';
import { EMPTY_ANSWER_BANK, type AnswerBank } from '@/lib/rmhladder/answer-bank';
import { safeHref } from '@/lib/url-safety';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';

export interface ApplicationPacketProps {
  applicant: PacketApplicant;
  application: PacketApplication;
  platform: AtsPlatform;
  /** Provide it if the page already has it; otherwise the panel fetches its own. */
  bank?: AnswerBank;
  /** The employer's application page, opened in a new tab. */
  applyUrl?: string | null;
}

export function ApplicationPacket({
  applicant,
  application,
  platform,
  bank: providedBank,
  applyUrl,
}: ApplicationPacketProps) {
  const { t } = useTranslation('site');
  const [bank, setBank] = useState<AnswerBank | null>(providedBank ?? null);
  const [loading, setLoading] = useState(!providedBank);
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (providedBank) {
      setBank(providedBank);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/rmhladder/answers');
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        if (!cancelled) setBank((data?.answers as AnswerBank) ?? EMPTY_ANSWER_BANK);
      } catch {
        if (!cancelled) {
          setBank(EMPTY_ANSWER_BANK);
          toast.error(
            t('ladder.packetLoadFailed', { defaultValue: 'Could not load your answer bank.' }),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [providedBank, t]);

  const fields = useMemo<PacketField[]>(
    () => (bank ? buildApplicationPacket({ bank, applicant, application, platform }) : []),
    [bank, applicant, application, platform],
  );

  const missing = fields.filter((f) => !f.filled).length;

  const toggleReveal = useCallback((id: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const href = safeHref(applyUrl);

  if (loading) {
    return (
      <section className="glass-pane flex min-h-32 items-center justify-center p-5">
        <Loader2 className="size-5 animate-spin text-site-text-dim" aria-hidden />
        <span className="sr-only">{t('ladder.packetLoading', { defaultValue: 'Loading…' })}</span>
      </section>
    );
  }

  return (
    <section className="glass-pane p-4 sm:p-5" aria-labelledby="ladder-packet-heading">
      <div className="flex flex-wrap items-center gap-2">
        <ClipboardList className="size-4 text-site-accent" aria-hidden />
        <h2 id="ladder-packet-heading" className="text-sm font-semibold text-site-text">
          {t('ladder.packetTitle', {
            defaultValue: 'Application packet — {{ats}} order',
            ats: atsPlatformLabel(platform),
          })}
        </h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <CopyButton
            value={packetAsText(fields)}
            variant="outline"
            size="sm"
            className="min-h-11"
            toastOnCopy
          >
            {t('ladder.packetCopyAll', { defaultValue: 'Copy all' })}
          </CopyButton>
          {href !== '#' && (
            <Button asChild size="sm" className="min-h-11">
              <a href={href} target="_blank" rel="noopener noreferrer">
                {t('ladder.packetOpenForm', { defaultValue: 'Open the form' })}
                <ExternalLink className="size-4" aria-hidden />
              </a>
            </Button>
          )}
        </div>
      </div>

      <p className="mt-2 text-xs text-site-text-dim">
        {t('ladder.packetIntro', {
          defaultValue:
            'Ordered to match this employer’s form, top to bottom. Copy each field as you reach it.',
        })}
        {missing > 0 &&
          ` ${t('ladder.packetMissing', {
            defaultValue: '{{count}} still empty in your answer bank.',
            count: missing,
          })}`}
      </p>

      <ol className="mt-4 grid gap-2">
        {fields.map((field, index) => {
          const isHidden = field.sensitive && field.filled && !revealed.has(field.id);
          return (
            <li key={field.id} className="glass-fill flex flex-wrap items-start gap-2 p-3">
              <span
                aria-hidden
                className="mt-0.5 w-6 shrink-0 font-mono text-xs text-site-text-dim"
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-site-text-muted">{field.label}</p>
                {field.filled ? (
                  <p
                    className={`mt-1 text-sm break-words text-site-text ${
                      field.kind === 'longtext' ? 'whitespace-pre-line' : ''
                    }`}
                  >
                    {isHidden ? '••••••••' : field.value}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-site-text-dim">
                    {field.kind === 'file'
                      ? t('ladder.packetUpload', {
                          defaultValue: 'Upload your resume file on the employer’s form.',
                        })
                      : t('ladder.packetNotSet', {
                          defaultValue: 'Not set — add it to your answer bank.',
                        })}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {field.sensitive && field.filled && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => toggleReveal(field.id)}
                    aria-label={
                      isHidden
                        ? t('ladder.packetReveal', { defaultValue: 'Show value' })
                        : t('ladder.packetHide', { defaultValue: 'Hide value' })
                    }
                  >
                    {isHidden ? (
                      <Eye className="size-4" aria-hidden />
                    ) : (
                      <EyeOff className="size-4" aria-hidden />
                    )}
                  </Button>
                )}
                {field.filled && field.kind !== 'file' && (
                  <CopyButton
                    value={field.value}
                    size="icon"
                    label={t('ladder.packetCopyField', {
                      defaultValue: 'Copy {{label}}',
                      label: field.label,
                    })}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-4 text-xs text-site-text-dim">
        {t('ladder.packetNeverSubmits', {
          defaultValue:
            'RMHLadder never submits an application for you. Nothing is sent to the employer from here — you paste these answers and press submit yourself.',
        })}
      </p>
    </section>
  );
}
