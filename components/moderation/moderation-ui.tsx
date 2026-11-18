/**
 * The client side of site moderation, in one module on purpose: the admin's
 * Moderate button, the feature-timeout list and the translated labels, plus
 * the moderation contracts and constants re-exported for the dialog and the
 * admin users panel. Every page that uses one of them loads the same single
 * chunk, so the client entry's preload map names one file instead of four
 * (scripts/check-bundle-budget.ts measures that map as part of the entry).
 */

import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/Providers';
import type { ModeratableType, ModerationAction } from '@/lib/moderation/content';
import type { FeatureRestrictionView, RestrictableFeature } from '@/lib/moderation/restrictions';
import { cn } from '@/lib/utils';

export { RESTRICTABLE_FEATURES, TIMEOUT_PRESETS } from '@/lib/moderation/restrictions';
export {
  getAdminUserModerationApi,
  liftAdminRestrictionApi,
  moderateContentApi,
  restrictAdminUserApi,
} from '@/lib/moderation/admin-moderation.contract';

// ── Labels ────────────────────────────────────────────────────────────────
// Shared by the moderation dialog, the admin users page and the user's
// account-status page so a feature is named the same way everywhere.

export function useFeatureLabels(): Record<RestrictableFeature, string> {
  const { t } = useTranslation('c-moderation');
  return {
    post: t('restriction-feature-post', { defaultValue: 'Posting' }),
    comment: t('restriction-feature-comment', { defaultValue: 'Replying' }),
    message: t('restriction-feature-message', { defaultValue: 'Direct messages' }),
    community: t('restriction-feature-community', { defaultValue: 'Creating communities' }),
    space: t('restriction-feature-space', { defaultValue: 'Hosting spaces' }),
    vibe: t('restriction-feature-vibe', { defaultValue: 'Building vibes' }),
    persona: t('restriction-feature-persona', { defaultValue: 'Creating personas' }),
  };
}

/** "1 day", "7 days", "Permanent". */
export function useTimeoutLabel(): (days: number | null) => string {
  const { t } = useTranslation('c-moderation');
  return (days) =>
    days === null
      ? t('restriction-permanent', { defaultValue: 'Permanent' })
      : t('restriction-days', { count: days, defaultValue_one: '{{count}} day', defaultValue: '{{count}} days' });
}

// ── Feature timeouts as rows on rules ─────────────────────────────────────
// The account-status page shows them read only; the admin users page adds Lift.

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

// ── The admin's entry point on a page about one thing ─────────────────────
// (a community, a space, a vibe, a persona, a removed post). Renders nothing
// for anyone who is not an admin; the dialog loads on first open.

const ModerateContentDialog = lazy(() =>
  import('@/components/moderation/ModerateContentDialog').then((m) => ({
    default: m.ModerateContentDialog,
  })),
);

export interface AdminModerateButtonProps {
  entityType: ModeratableType;
  entityId: string;
  current?: Record<string, string | null | undefined>;
  removed?: boolean;
  onDone?: (action: ModerationAction) => void;
  className?: string;
  size?: 'default' | 'sm' | 'xs';
}

export function AdminModerateButton({
  entityType,
  entityId,
  current,
  removed,
  onDone,
  className,
  size = 'sm',
}: AdminModerateButtonProps) {
  const { t } = useTranslation('c-moderation');
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isAdmin = !!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin;
  if (!isAdmin) return null;

  return (
    <>
      <Button
        variant="danger"
        size={size}
        className={cn(className)}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        <ShieldAlert aria-hidden />
        {removed
          ? t('moderate-button-restore', { defaultValue: 'Moderate: restore' })
          : t('moderate-button', { defaultValue: 'Moderate' })}
      </Button>
      {mounted && (
        <Suspense fallback={null}>
          <ModerateContentDialog
            open={open}
            onOpenChange={setOpen}
            entityType={entityType}
            entityId={entityId}
            {...(current ? { current } : {})}
            {...(removed !== undefined ? { removed } : {})}
            {...(onDone ? { onDone } : {})}
          />
        </Suspense>
      )}
    </>
  );
}
