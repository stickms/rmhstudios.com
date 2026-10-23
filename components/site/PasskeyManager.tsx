'use client';

/**
 * Passkey management panel — list, add, rename, and delete WebAuthn
 * credentials for the signed-in user. Rendered on /settings/security.
 * Talks to the @better-auth/passkey endpoints through authClient.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Fingerprint, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { IconButton } from '@/components/ui/icon-button';
import { SettingsSection } from '@/components/settings/SettingsSection';

interface PasskeyRow {
  id: string;
  name?: string | null;
  deviceType?: string;
  backedUp?: boolean;
  createdAt?: string | Date | null;
}

export function PasskeyManager() {
  const { t } = useTranslation('feed');
  const confirm = useConfirm();
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'PublicKeyCredential' in window);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authClient.$fetch<PasskeyRow[]>('/passkey/list-user-passkeys', {
        method: 'GET',
      });
      if (res.data) setPasskeys(res.data);
    } catch {
      // Signed out or network error — leave the list empty.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addPasskey = async () => {
    setBusy(true);
    try {
      const res = await authClient.passkey.addPasskey({
        name: navigator.userAgent.includes('Mobile')
          ? t('passkey-default-name-mobile', { defaultValue: 'Mobile device' })
          : t('passkey-default-name-desktop', { defaultValue: 'This computer' }),
      });
      if (res && 'error' in res && res.error) {
        toast.error(
          res.error.message ?? t('passkey-add-failed', { defaultValue: 'Could not add passkey.' }),
        );
      } else {
        toast.success(t('passkey-added', { defaultValue: 'Passkey added.' }));
        await load();
      }
    } catch {
      toast.error(t('passkey-add-cancelled', { defaultValue: 'Passkey setup was cancelled.' }));
    } finally {
      setBusy(false);
    }
  };

  const renamePasskey = async (pk: PasskeyRow) => {
    const name = window.prompt(
      t('passkey-rename-prompt', { defaultValue: 'New name for this passkey:' }),
      pk.name ?? '',
    );
    if (!name || name === pk.name) return;
    setBusy(true);
    try {
      await authClient.$fetch('/passkey/update-passkey', {
        method: 'POST',
        body: { id: pk.id, name: name.slice(0, 64) },
      });
      await load();
    } catch {
      toast.error(t('passkey-rename-failed', { defaultValue: 'Could not rename passkey.' }));
    } finally {
      setBusy(false);
    }
  };

  const deletePasskey = async (pk: PasskeyRow) => {
    const confirmed = await confirm({
      title: t('passkey-delete-title', { defaultValue: 'Remove this passkey?' }),
      description: t('passkey-delete-confirm', {
        defaultValue: 'You will no longer be able to sign in with it.',
      }),
      confirmLabel: t('passkey-delete', { defaultValue: 'Delete passkey' }),
      danger: true,
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await authClient.$fetch('/passkey/delete-passkey', {
        method: 'POST',
        body: { id: pk.id },
      });
      setPasskeys((prev) => prev.filter((p) => p.id !== pk.id));
      toast.success(t('passkey-deleted', { defaultValue: 'Passkey removed.' }));
    } catch {
      toast.error(t('passkey-delete-failed', { defaultValue: 'Could not remove passkey.' }));
    } finally {
      setBusy(false);
    }
  };

  // `.glass-pane` — the singular-panel tier, and what the three siblings
  // stacked directly under this one in /settings/security already use. This
  // was `bg-site-surface/40`, which is also the alpha-stacking bug:
  // `--site-surface` is already rgba (0.065 on ultra) and Tailwind v4's
  // modifier MULTIPLIES, so the panel rendered at 0.026 — five panels in one
  // column, two materials, and two of them nearly invisible.
  return (
    <SettingsSection
      icon={Fingerprint}
      title={t('passkeys-title', { defaultValue: 'Passkeys' })}
      description={t('passkeys-description', {
        defaultValue:
          'Sign in without a password using Face ID, Touch ID, Windows Hello, or a security key. Passkeys are phishing-resistant and never leave your device.',
      })}
    >
      {!supported && (
        <p className="rounded-site-sm glass-fill px-3 py-2 text-sm text-site-text-dim">
          {t('passkeys-unsupported', {
            defaultValue: 'This browser does not support passkeys.',
          })}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : passkeys.length === 0 ? (
        <p className="text-sm text-site-text-dim">
          {t('passkeys-empty', { defaultValue: 'You have no passkeys yet.' })}
        </p>
      ) : (
        <ul className="divide-y divide-site-border rounded-site-sm border border-site-border">
          {passkeys.map((pk) => (
            <li key={pk.id} className="flex items-center gap-3 px-3 py-2">
              <KeyRound className="h-4 w-4 shrink-0 text-site-text-dim" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-site-text">
                  {pk.name || t('passkey-unnamed', { defaultValue: 'Unnamed passkey' })}
                </p>
                <p className="text-xs text-site-text-dim">
                  {pk.createdAt
                    ? t('passkey-created', {
                        defaultValue: 'Added {{when}}',
                        when: formatDistanceToNow(new Date(pk.createdAt), { addSuffix: true }),
                      })
                    : null}
                  {pk.backedUp ? ` · ${t('passkey-synced', { defaultValue: 'Synced' })}` : ''}
                </p>
              </div>
              <IconButton
                icon={Pencil}
                label={t('passkey-rename', { defaultValue: 'Rename passkey' })}
                onClick={() => renamePasskey(pk)}
                disabled={busy}
              />
              <IconButton
                icon={Trash2}
                label={t('passkey-delete', { defaultValue: 'Delete passkey' })}
                onClick={() => deletePasskey(pk)}
                disabled={busy}
                className="hover:text-site-danger"
              />
            </li>
          ))}
        </ul>
      )}

      <Button onClick={addPasskey} disabled={busy || !supported} className="gap-2">
        <Plus className="h-4 w-4" aria-hidden />
        {t('passkey-add', { defaultValue: 'Add a passkey' })}
      </Button>
    </SettingsSection>
  );
}
