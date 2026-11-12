import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Select } from '@/components/ui/select';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { AUTO_DELETE_MONTHS, type AutoDeleteMonths } from '@/lib/posts-plus/constants';
import { autoDeleteSettingQuery } from '@/lib/settings/prefs.queries';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { api } from '@/lib/contract/client';
import { getAutoDeleteApi, setAutoDeleteApi } from '@/lib/posts-plus/auto-delete.contract';

/**
 * X8 - "Auto-delete my posts older than N months", in Settings > Content.
 *
 * Off by default. Posts go to the recycle bin (restorable); pinned posts and
 * posts you have bookmarked are always kept, and so is anything you restore.
 * Choosing a window first shows how many posts it would take, because the first
 * run is the one that surprises people.
 */
export function AutoDeleteSetting() {
  const { t } = useTranslation('f-posts-plus');
  const confirm = useConfirm();
  const labelId = useId();
  const hintId = useId();
  const queryClient = useQueryClient();
  const query = autoDeleteSettingQuery();
  const { data, isPending } = useQuery(query);
  const [saving, setSaving] = useState(false);
  const months: AutoDeleteMonths | null = data?.months ?? null;
  const ready = !isPending;

  const save = async (next: AutoDeleteMonths | null) => {
    setSaving(true);
    try {
      const saved = await api(setAutoDeleteApi, { body: { months: next } });
      queryClient.setQueryData(query.queryKey, saved);
    } catch {
      toast.error(t('autodelete-failed', { defaultValue: 'Could not save that setting' }));
    } finally {
      setSaving(false);
    }
  };

  const change = async (value: string) => {
    if (!value) {
      await save(null);
      return;
    }
    const next = Number(value) as AutoDeleteMonths;
    let eligible = 0;
    try {
      const res = await api(getAutoDeleteApi, { query: { preview: next } });
      eligible = res.eligible ?? 0;
    } catch {
      /* the confirmation still explains the rule without a number */
    }
    const ok = await confirm({
      title: t('autodelete-confirm-title', {
        defaultValue: 'Auto-delete posts older than {{n}} months?',
        n: next,
      }),
      description:
        eligible > 0
          ? t('autodelete-confirm-count', {
              defaultValue:
                '{{n}} of your posts are older than that. They move to your recycle bin tonight; pinned and bookmarked posts stay.',
              n: eligible >= 1000 ? '1000+' : eligible,
            })
          : t('autodelete-confirm-none', {
              defaultValue:
                'None of your posts are that old yet. From now on older posts move to your recycle bin; pinned and bookmarked posts stay.',
            }),
      confirmLabel: t('autodelete-confirm', { defaultValue: 'Turn on' }),
      danger: true,
    });
    if (ok) await save(next);
  };

  return (
    <SettingsSection
      title={t('autodelete-title', { defaultValue: 'Auto-delete old posts' })}
      titleId={labelId}
      description={
        <>
          {t('autodelete-hint', {
            defaultValue:
              'Move your posts to the recycle bin once they are older than the window you pick. Pinned posts, posts you bookmarked, and posts you restore are always kept.',
          })}{' '}
          <Link to="/trash" className="text-site-accent underline-offset-2 hover:underline">
            {t('autodelete-trash', { defaultValue: 'Open recycle bin' })}
          </Link>
        </>
      }
      descriptionId={hintId}
    >
      <Select
        value={months ? String(months) : ''}
        onChange={(e) => void change(e.target.value)}
        disabled={!ready || saving}
        aria-labelledby={labelId}
        aria-describedby={hintId}
        className="sm:w-60"
      >
        <option value="">{t('autodelete-off', { defaultValue: 'Off' })}</option>
        {AUTO_DELETE_MONTHS.map((m) => (
          <option key={m} value={String(m)}>
            {t('autodelete-option', { defaultValue: 'Older than {{n}} months', n: m })}
          </option>
        ))}
      </Select>
    </SettingsSection>
  );
}
