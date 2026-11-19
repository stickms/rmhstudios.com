/**
 * An achievement's tier as a medal (owner, 2026-11-19, plan D9): two ribbon tails and a disc with a rim and a star,
 * flat, in the tier's colours (`TIER_MEDAL`). The tier word is its accessible name and its tooltip, so the colour is
 * never the only signal.
 */
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  TIER_MEDAL,
  type AchievementTier,
} from '@/lib/achievements/catalog';
import { cn } from '@/lib/utils';

export function AchievementMedal({
  tier,
  className,
}: {
  tier: AchievementTier;
  className?: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  const {
    disc,
    rim,
  } =
    TIER_MEDAL[
      tier
    ];
  const label =
    {
      bronze:
        t(
          'achievement-tier-bronze',
          {
            defaultValue:
              'Bronze',
          },
        ),
      silver:
        t(
          'achievement-tier-silver',
          {
            defaultValue:
              'Silver',
          },
        ),
      gold: t(
        'achievement-tier-gold',
        {
          defaultValue:
            'Gold',
        },
      ),
      platinum:
        t(
          'achievement-tier-platinum',
          {
            defaultValue:
              'Platinum',
          },
        ),
    }[
      tier
    ];
  return (
    <Tooltip
      content={
        label
      }
      className="whitespace-nowrap"
    >
      <svg
        viewBox="0 0 24 28"
        role="img"
        aria-label={
          label
        }
        tabIndex={
          0
        }
        data-slot="achievement-medal"
        data-tier={
          tier
        }
        className={cn(
          'h-7 w-6 shrink-0',
          className,
        )}
      >
        <path
          d="M6 1h5l3 10H9z"
          fill={
            rim
          }
        />
        <path
          d="M18 1h-5l-3 10h5z"
          fill={
            rim
          }
        />
        <circle
          cx="12"
          cy="18"
          r="8.5"
          fill={
            disc
          }
          stroke={
            rim
          }
          strokeWidth="1.5"
        />
        <path
          d="M12 13.6l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4z"
          fill={
            rim
          }
        />
      </svg>
    </Tooltip>
  );
}
