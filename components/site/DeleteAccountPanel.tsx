'use client';

/**
 * Danger-zone account deletion (GDPR right to erasure). Requires the user to
 * type their own handle/username to confirm, then calls /api/account/delete,
 * which wipes credentials + scrubs personal data. Rendered on /settings/privacy.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { TriangleAlert } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function DeleteAccountPanel() {
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const user = session?.user as { handle?: string | null; username?: string | null } | undefined;
  const expected = (user?.handle || user?.username || '').replace(/^@/, '');

  const [confirm, setConfirm] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const matches = expected.length > 0 && confirm.trim().replace(/^@/, '').toLowerCase() === expected.toLowerCase();

  const del = async () => {
    if (!matches) return;
    setBusy(true);
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ confirm: confirm.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error || t('delete-failed', { defaultValue: 'Could not delete your account.' }));
        return;
      }
      toast.success(t('delete-done', { defaultValue: 'Your account has been deleted.' }));
      try {
        await authClient.signOut();
      } catch {
        // session rows are already gone; ignore
      }
      window.location.href = '/';
    } catch {
      toast.error(t('delete-failed', { defaultValue: 'Could not delete your account.' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-site border border-site-danger/40 bg-site-danger/5 p-4">
      <div className="mb-1 flex items-center gap-2">
        <TriangleAlert className="h-5 w-5 text-site-danger" aria-hidden />
        <h2 className="text-base font-bold text-site-text">
          {t('delete-title', { defaultValue: 'Delete account' })}
        </h2>
      </div>
      <p className="mb-4 text-sm text-site-text-muted">
        {t('delete-description', {
          defaultValue:
            'Permanently remove your personal data and sign you out of every device. Your posts are kept but anonymized (shown as “Deleted user”). This cannot be undone.',
        })}
      </p>

      {!open ? (
        <Button variant="destructive" onClick={() => setOpen(true)}>
          {t('delete-start', { defaultValue: 'Delete my account' })}
        </Button>
      ) : (
        <div className="space-y-3">
          <label htmlFor="delete-confirm" className="block text-sm text-site-text">
            {expected
              ? t('delete-confirm-label', {
                  defaultValue: 'Type your handle “{{handle}}” to confirm:',
                  handle: expected,
                })
              : t('delete-confirm-label-generic', { defaultValue: 'Type your username or email to confirm:' })}
          </label>
          <Input
            id="delete-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            placeholder={expected || undefined}
            aria-invalid={confirm.length > 0 && !matches}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" onClick={del} disabled={!matches || busy}>
              {busy
                ? t('delete-working', { defaultValue: 'Deleting…' })
                : t('delete-permanent', { defaultValue: 'Permanently delete' })}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                setConfirm('');
              }}
              disabled={busy}
            >
              {t('cancel', { defaultValue: 'Cancel' })}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
