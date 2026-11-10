import { useTranslation } from 'react-i18next';
import { BadgeCheck, ShieldCheck } from 'lucide-react';
import type { ProfileData } from '@/components/profile/profile-types';

/** Compact identity chrome that stays visible while the full glass hero scrolls away. */
export function ProfileIdentityBar({
  profile,
  displayName,
}: {
  profile: ProfileData;
  displayName: string | null | undefined;
}) {
  const { t } = useTranslation('feed');
  return (
    <div className="glass-chrome site-sticky-chrome">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate font-display text-lg font-bold text-site-text">
              {displayName || profile.username || t('user', { defaultValue: 'User' })}
            </h1>
            {profile.isVerified ? (
              <BadgeCheck className="size-4 shrink-0 text-site-success" aria-hidden />
            ) : null}
            {profile.isAdmin ? (
              <ShieldCheck className="size-4 shrink-0 text-site-accent" aria-hidden />
            ) : null}
          </div>
          <p className="text-xs text-site-text-dim">
            {t('rmhark-count', {
              count: profile.rmharkCount,
              defaultValue: '{{count}} RMHarks',
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
