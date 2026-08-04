'use client';

/**
 * The status of one run, and how much that status is worth.
 *
 * Two pieces of information, because "verified" alone is not honest: a run
 * re-simulated from its inputs and a run whose self-reported log merely adds up
 * are not the same claim. The badge shows the run's status; the tooltip names the
 * tier that produced it (`lib/speedrun/verifier.ts`).
 *
 * Colour is never the only carrier — `Badge`'s status variants each ship a glyph
 * for exactly this reason, and the text says the state in words regardless.
 *
 * Keys live in `c-tournaments` behind a `speedrun-` prefix; the page's docblock
 * explains why (a namespace absent from `lib/i18n/config.ts` never loads).
 */

import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/Tooltip';
import type { SpeedrunStatus, VerificationTier } from '@/lib/speedrun/types';

export function VerificationBadge({
  status,
  tier,
  reason,
}: {
  status: SpeedrunStatus;
  tier: VerificationTier;
  /** The stored `rejectReason`, shown as the tooltip when there is one. */
  reason?: string | null;
}) {
  const { t } = useTranslation('c-tournaments');

  const tierHint =
    tier === 'deterministic'
      ? t('speedrun-tier-deterministic', {
          defaultValue: 'Re-simulated from the run’s own inputs — the result cannot be forged.',
        })
      : tier === 'consistency'
        ? t('speedrun-tier-consistency', {
            defaultValue:
              'Checked for consistency and re-scored, but this game’s log cannot be proved — a human reviews it.',
          })
        : t('speedrun-tier-manual', {
            defaultValue: 'This game has no automatic verifier, so runs are reviewed by hand.',
          });

  const label =
    status === 'verified'
      ? t('speedrun-status-verified', { defaultValue: 'Verified' })
      : status === 'rejected'
        ? t('speedrun-status-rejected', { defaultValue: 'Rejected' })
        : t('speedrun-status-pending', { defaultValue: 'In review' });

  const variant = status === 'verified' ? 'success' : status === 'rejected' ? 'danger' : 'warning';

  return (
    <Tooltip content={reason ? `${label} — ${reason}` : tierHint}>
      <Badge variant={variant} size="sm">
        {label}
      </Badge>
    </Tooltip>
  );
}

/** Standalone label for a board's verification tier (shown above the runs). */
export function TierNote({ tier }: { tier: VerificationTier }) {
  const { t } = useTranslation('c-tournaments');

  const text =
    tier === 'deterministic'
      ? t('speedrun-board-deterministic', {
          defaultValue:
            'Runs on this board are re-simulated from their inputs. A run that does not reproduce is rejected automatically.',
        })
      : tier === 'consistency'
        ? t('speedrun-board-consistency', {
            defaultValue:
              'Runs on this board are re-scored from their own log and checked for impossible claims, then reviewed before they rank.',
          })
        : t('speedrun-board-manual', {
            defaultValue:
              'This game cannot be verified automatically yet — every run is reviewed by hand.',
          });

  return <p className="text-sm text-site-text-muted">{text}</p>;
}
