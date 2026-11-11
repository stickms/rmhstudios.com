import { useTranslation } from 'react-i18next';
import { Coins, Music2, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SpotifySongSearch } from '../SpotifySongSearch';
import { FieldHeader } from './FieldHeader';
import type { ProfileEditForm } from './useProfileEditForm';

export function CreatorSection({
  form,
  onOpenCosmetics,
}: {
  form: Pick<
    ProfileEditForm,
    | 'tipGoal'
    | 'setTipGoal'
    | 'membershipPrice'
    | 'setMembershipPrice'
    | 'tipGoalLabel'
    | 'setTipGoalLabel'
    | 'selectedSong'
    | 'setSelectedSong'
  >;
  /** Leaves the editor for the cosmetics settings page (asks before discarding). */
  onOpenCosmetics: () => void | Promise<void>;
}) {
  const { t } = useTranslation('feed');
  return (
    <div role="tabpanel" className="space-y-5">
      <section className="glass-fill rounded-site p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-site-warning/10 text-site-warning">
            <Coins className="size-4" aria-hidden />
          </span>
          <div>
            <h3 className="font-semibold text-site-text">
              {t('creator-support', { defaultValue: 'Creator support' })}
            </h3>
            <p className="text-sm text-site-text-muted">
              {t('creator-support-hint', {
                defaultValue: 'Set optional goals and membership pricing for supporters.',
              })}
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldHeader
              htmlFor="profile-tip-goal"
              label={t('monthly-tip-goal', { defaultValue: 'Monthly tip goal' })}
            />
            <Input
              id="profile-tip-goal"
              type="number"
              inputMode="numeric"
              min={0}
              value={form.tipGoal}
              onChange={(event) => form.setTipGoal(event.target.value)}
              placeholder="1000"
            />
          </div>
          <div>
            <FieldHeader
              htmlFor="profile-membership-price"
              label={t('membership-price-short', {
                defaultValue: 'Membership / month',
              })}
            />
            <Input
              id="profile-membership-price"
              type="number"
              inputMode="numeric"
              min={0}
              value={form.membershipPrice}
              onChange={(event) => form.setMembershipPrice(event.target.value)}
              placeholder="500"
            />
          </div>
        </div>
        <div className="mt-4">
          <FieldHeader
            htmlFor="profile-tip-label"
            label={t('tip-goal-name', { defaultValue: 'Goal name' })}
          />
          <Input
            id="profile-tip-label"
            value={form.tipGoalLabel}
            onChange={(event) => form.setTipGoalLabel(event.target.value)}
            maxLength={80}
            placeholder={t('tip-goal-label-placeholder', {
              defaultValue: 'New microphone fund',
            })}
          />
        </div>
      </section>

      <section className="glass-fill rounded-site p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-site-bg-subtle text-site-accent">
            <Music2 className="size-4" aria-hidden />
          </span>
          <div>
            <h3 className="font-semibold text-site-text">
              {t('profile-soundtrack', { defaultValue: 'Profile soundtrack' })}
            </h3>
            <p className="text-sm text-site-text-muted">
              {t('profile-soundtrack-hint', {
                defaultValue: 'Pick a song visitors can play from your cover.',
              })}
            </p>
          </div>
        </div>
        <SpotifySongSearch selected={form.selectedSong} onSelect={form.setSelectedSong} />
      </section>

      <section className="glass-fill rounded-site p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-site-bg-subtle text-site-accent">
            <Palette className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-site-text">
              {t('profile-look', { defaultValue: 'Profile look' })}
            </h3>
            <p className="mt-1 text-sm text-site-text-muted">
              {t('profile-look-hint', {
                defaultValue:
                  'Equip themes, frames, badges, and banners from profile customization.',
              })}
            </p>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="mt-3"
              onClick={onOpenCosmetics}
            >
              <Palette aria-hidden />
              {t('profile-cosmetics-title', { defaultValue: 'Profile customization' })}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
