/**
 * Feature timeouts as rows on rules: what is restricted, why, and until when.
 * Shared by the user's account-status page (read only) and the admin users
 * page (with a Lift action).
 */

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import type { FeatureRestrictionView } from '@/lib/moderation/restrictions';
import { useFeatureLabels } from '@/components/moderation/moderation-labels';
import { cn } from '@/lib/utils';

export function RestrictionList({
  restrictions,
  onLift,
  liftingId,
}: {
  restrictions: FeatureRestrictionView[];
  /** Admin only: lift an active restriction. */
  onLift?: (id: string) => void;
  liftingId?: string | null;
}) {
  const { t } = useTranslation('c-moderation');
  const labels = useFeatureLabels();

  return (
    <ul className="divide-y divide-site-border border-y border-site-border">
      {restrictions.map((r) => (
        <li key={r.id} className={cn('flex flex-wrap items-start gap-x-4 gap-y-1 py-3', !r.active && 'opacity-60')}>
          <div className="min-w-0 flex-1">
            <p className="t-body font-semibold text-site-text">{labels[r.feature]}</p>
            <p className="t-body text-site-text-muted">{r.reason}</p>
            <p className="t-meta mt-1">
              {r.liftedAt ? (
                t('restriction-lifted', { defaultValue: 'Lifted early' })
              ) : !r.active ? (
                t('restriction-ended', { defaultValue: 'Ended' })
              ) : r.expiresAt ? (
                <>
                  {t('restriction-until', { defaultValue: 'Ends' })} {formatDistanceToNow(new Date(r.expiresAt), { addSuffix: true })}
                </>
              ) : (
                t('restriction-permanent', { defaultValue: 'Permanent' })
              )}
            </p>
          </div>
          {onLift && r.active && (
            <Button size="xs" variant="default" disabled={liftingId === r.id} onClick={() => onLift(r.id)}>
              {t('restriction-lift', { defaultValue: 'Lift' })}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
