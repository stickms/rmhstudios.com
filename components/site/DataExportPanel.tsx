'use client';

/**
 * "Download my data" panel (GDPR/CCPA data-subject access request). Fetches
 * /api/account/export and saves the returned JSON as a file. Rendered on
 * /settings/privacy.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingsSection } from '@/components/settings/SettingsSection';

export function DataExportPanel() {
  const { t } = useTranslation('feed');
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/account/export', { credentials: 'include' });
      if (!res.ok) {
        const msg =
          res.status === 429
            ? t('export-rate-limited', { defaultValue: 'Please wait a bit before exporting again.' })
            : t('export-failed', { defaultValue: 'Could not prepare your export.' });
        toast.error(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rmhstudios-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t('export-ready', { defaultValue: 'Your data export has downloaded.' }));
    } catch {
      toast.error(t('export-failed', { defaultValue: 'Could not prepare your export.' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection
      icon={Download}
      title={t('export-title', { defaultValue: 'Download your data' })}
      description={t('export-description', {
        defaultValue:
          'Get a copy of your account data — profile, posts, comments, follows, coins, and more — as a JSON file.',
      })}
    >
      <Button onClick={download} disabled={busy} className="gap-2">
        <Download className="h-4 w-4" aria-hidden />
        {busy
          ? t('export-preparing', { defaultValue: 'Preparing…' })
          : t('export-button', { defaultValue: 'Download my data' })}
      </Button>
    </SettingsSection>
  );
}
