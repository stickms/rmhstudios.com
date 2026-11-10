import { useTranslation } from 'react-i18next';
import { Eye, LockKeyhole } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export function PrivacySection({
  showLikes,
  onShowLikesChange,
  dmPrivacy,
  onDmPrivacyChange,
}: {
  showLikes: boolean;
  onShowLikesChange: (value: boolean) => void;
  dmPrivacy: string;
  onDmPrivacyChange: (value: string) => void;
}) {
  const { t } = useTranslation('feed');
  return (
    <div role="tabpanel" className="space-y-4">
      <section className="glass-fill rounded-site p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-site-accent-dim text-site-accent">
              <Eye className="size-4" aria-hidden />
            </span>
            <div>
              <Label htmlFor="profile-show-likes">
                {t('show-liked-posts', { defaultValue: 'Show liked posts' })}
              </Label>
              <p id="profile-show-likes-hint" className="mt-1 text-sm text-site-text-muted">
                {t('show-liked-posts-hint', {
                  defaultValue: "Let others see posts you've liked.",
                })}
              </p>
            </div>
          </div>
          <Switch
            id="profile-show-likes"
            checked={showLikes}
            onCheckedChange={onShowLikesChange}
            aria-describedby="profile-show-likes-hint"
          />
        </div>
      </section>

      <section className="glass-fill rounded-site p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-site-accent-dim text-site-accent">
            <LockKeyhole className="size-4" aria-hidden />
          </span>
          <div>
            <h3 className="font-semibold text-site-text">
              {t('direct-messages', { defaultValue: 'Direct messages' })}
            </h3>
            <p className="text-sm text-site-text-muted">
              {t('direct-messages-hint', {
                defaultValue: 'Choose who can start a new conversation with you.',
              })}
            </p>
          </div>
        </div>
        <Label htmlFor="profile-dm-privacy">
          {t('dm-privacy-label', { defaultValue: 'Who can message you' })}
        </Label>
        <Select
          id="profile-dm-privacy"
          value={dmPrivacy}
          onChange={(event) => onDmPrivacyChange(event.target.value)}
          className="mt-2"
        >
          <option value="EVERYONE">{t('dm-everyone', { defaultValue: 'Everyone' })}</option>
          <option value="FOLLOWERS">
            {t('dm-followers', { defaultValue: 'People I follow' })}
          </option>
          <option value="NONE">{t('dm-none', { defaultValue: 'Nobody' })}</option>
        </Select>
        <p className="mt-2 text-xs text-site-text-dim">
          {dmPrivacy === 'EVERYONE'
            ? t('dm-everyone-hint', {
                defaultValue: 'Anyone can send you a direct message.',
              })
            : dmPrivacy === 'FOLLOWERS'
              ? t('dm-followers-hint', {
                  defaultValue: 'Only people you follow can message you.',
                })
              : t('dm-none-hint', {
                  defaultValue: 'No one can send you direct messages.',
                })}
        </p>
      </section>
    </div>
  );
}
