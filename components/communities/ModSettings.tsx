'use client';

/** S2 posting requirement, N1 required flair, N2 star threshold. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { communityApi, plusFetch } from '@/components/communities/plus-api';
import {
  STAR_THRESHOLD_MAX,
  STAR_THRESHOLD_MIN,
  type CommunityExtrasDTO,
} from '@/lib/communities/plus';
import type { VerificationLevel } from '@/lib/communities/verification';

export function ModSettings({
  slug,
  extras,
  onChange,
}: {
  slug: string;
  extras: CommunityExtrasDTO;
  onChange: () => void;
}) {
  const { t } = useTranslation('f-communities-plus');
  const [level, setLevel] = useState<VerificationLevel>(extras.verification.level);
  const [value, setValue] = useState(String(extras.verification.value || 1));
  const [flairRequired, setFlairRequired] = useState(extras.flairRequired);
  const [threshold, setThreshold] = useState(String(extras.starThreshold));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const res = await plusFetch(communityApi(slug, '/settings'), 'PATCH', {
      verificationLevel: level,
      verificationValue: level === 'account_age' || level === 'member_age' ? Number(value) || 1 : 0,
      flairRequired,
      starThreshold: Math.min(
        STAR_THRESHOLD_MAX,
        Math.max(STAR_THRESHOLD_MIN, Number(threshold) || 5),
      ),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error || t('settings-error', { defaultValue: "Couldn't save the settings" }));
      return;
    }
    toast.success(t('settings-saved', { defaultValue: 'Settings saved' }));
    onChange();
  };

  return (
    <form
      className="glass-pane flex flex-col gap-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-site-text" htmlFor="verif-level">
          {t('verif-title', { defaultValue: 'Who can post and comment' })}
        </label>
        <Select
          id="verif-level"
          value={level}
          onChange={(e) => setLevel(e.target.value as VerificationLevel)}
        >
          <option value="none">{t('verif-none', { defaultValue: 'Any member' })}</option>
          <option value="email">
            {t('verif-email', { defaultValue: 'Members with a verified email' })}
          </option>
          <option value="account_age">
            {t('verif-account-age', { defaultValue: 'Accounts older than N days' })}
          </option>
          <option value="member_age">
            {t('verif-member-age', { defaultValue: 'Members for at least N minutes' })}
          </option>
        </Select>
        {(level === 'account_age' || level === 'member_age') && (
          <label className="flex flex-col gap-1 text-xs text-site-text-muted">
            {level === 'account_age'
              ? t('verif-days', { defaultValue: 'Days (1 to 365)' })
              : t('verif-minutes', { defaultValue: 'Minutes (1 to 43200)' })}
            <Input
              type="number"
              min={1}
              max={level === 'account_age' ? 365 : 43200}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
        )}
        <p className="text-xs text-site-text-muted">
          {t('verif-note', {
            defaultValue:
              'Mods and admins are always exempt. Members who do not meet the requirement see why in the composer.',
          })}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm text-site-text">
        <span>
          <span id="flair-required-label" className="block font-semibold">
            {t('flair-required-title', { defaultValue: 'Require a flair on every post' })}
          </span>
          <span className="text-xs text-site-text-muted">
            {t('flair-required-note', { defaultValue: 'Define at least one flair first.' })}
          </span>
        </span>
        <Switch
          checked={flairRequired}
          onCheckedChange={setFlairRequired}
          aria-labelledby="flair-required-label"
        />
      </div>

      <label className="flex flex-col gap-1 text-sm font-semibold text-site-text">
        {t('star-title', { defaultValue: 'Hall of fame threshold (⭐ reactions)' })}
        <Input
          type="number"
          min={STAR_THRESHOLD_MIN}
          max={STAR_THRESHOLD_MAX}
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
        />
      </label>

      <div className="flex justify-end">
        <Button type="submit" variant="accent" size="sm" loading={saving}>
          {t('settings-save', { defaultValue: 'Save settings' })}
        </Button>
      </div>
    </form>
  );
}
