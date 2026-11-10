import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ImageOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { api } from '@/lib/contract/client';
import { getAltTextSettingApi, setAltTextSettingApi } from '@/lib/feed/alt-text.contract';

/**
 * X12 — the "Require alt text" switch, in Settings → Content preferences.
 *
 * Off by default. When on, the composer will not publish (or schedule) a post
 * with an image that has no description, and neither will the server, so the
 * rule holds from any client. The read is deferred to the effect and the row
 * renders its off state meanwhile — a failed read just leaves it off.
 */
export function RequireAltTextSetting() {
  const { t } = useTranslation('f-feed-plus');
  const labelId = useId();
  const hintId = useId();
  const [value, setValue] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api(getAltTextSettingApi)
      .then((d) => {
        if (cancelled) return;
        setValue(d.requireAltText ?? false);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const change = async (next: boolean) => {
    setSaving(true);
    const prev = value;
    setValue(next);
    try {
      await api(setAltTextSettingApi, { body: { requireAltText: next } });
    } catch {
      setValue(prev);
      toast.error(t('alt-setting-failed', { defaultValue: 'Could not save that setting' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection
      surface="fill"
      icon={ImageOff}
      title={t('alt-setting-title', { defaultValue: 'Require alt text' })}
      titleId={labelId}
      description={t('alt-setting-hint', {
        defaultValue:
          'Block your own posts that have an image without a description, so everything you share can be read with a screen reader.',
      })}
      descriptionId={hintId}
      action={
        <Switch
          checked={value}
          onCheckedChange={(v) => void change(v)}
          disabled={!ready || saving}
          aria-labelledby={labelId}
          aria-describedby={hintId}
        />
      }
    />
  );
}
