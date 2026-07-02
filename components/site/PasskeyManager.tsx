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

interface PasskeyRow {
  id: string;
  name?: string | null;
  deviceType?: string;
  backedUp?: boolean;
  createdAt?: string | Date | null;
}

export function PasskeyManager() {
  const { t } = useTranslation('feed');
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
        toast.error(res.error.message ?? t('passkey-add-failed', { defaultValue: 'Could not add passkey.' }));
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
      pk.name ?? ''
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
    if (
      !window.confirm(
        t('passkey-delete-confirm', {
          defaultValue: 'Remove this passkey? You will no longer be able to sign in with it.',
        })
      )
    ) {
      return;
    }
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

  return (
    <section className="rounded-site border border-site-border bg-site-surface/40 p-4">
      <div className="mb-1 flex items-center gap-2">
        <Fingerprint className="h-5 w-5 text-site-accent" aria-hidden />
        <h2 className="text-base font-bold text-site-text">
          {t('passkeys-title', { defaultValue: 'Passkeys' })}
        </h2>
      </div>
      <p className="mb-4 text-sm text-site-text-muted">
        {t('passkeys-description', {
          defaultValue:
            'Sign in without a password using Face ID, Touch ID, Windows Hello, or a security key. Passkeys are phishing-resistant and never leave your device.',
        })}
      </p>

      {!supported && (
        <p className="mb-3 rounded-site-sm border border-site-border bg-site-surface px-3 py-2 text-sm text-site-text-dim">
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
        <p className="mb-3 text-sm text-site-text-dim">
          {t('passkeys-empty', { defaultValue: 'You have no passkeys yet.' })}
        </p>
      ) : (
        <ul className="mb-3 divide-y divide-site-border rounded-site-sm border border-site-border">
          {passkeys.map((pk) => (
            <li key={pk.id} className="flex items-center gap-3 px-3 py-2.5">
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
                  {pk.backedUp
                    ? ` · ${t('passkey-synced', { defaultValue: 'Synced' })}`
                    : ''}
                </p>
              </div>
              <button
                onClick={() => renamePasskey(pk)}
                disabled={busy}
                aria-label={t('passkey-rename', { defaultValue: 'Rename passkey' })}
                className="rounded-site-sm p-1.5 text-site-text-dim transition-colors hover:bg-site-surface-hover hover:text-site-text"
              >
                <Pencil className="h-4 w-4" aria-hidden />
              </button>
              <button
                onClick={() => deletePasskey(pk)}
                disabled={busy}
                aria-label={t('passkey-delete', { defaultValue: 'Delete passkey' })}
                className="rounded-site-sm p-1.5 text-site-text-dim transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Button onClick={addPasskey} disabled={busy || !supported} className="gap-2">
        <Plus className="h-4 w-4" aria-hidden />
        {t('passkey-add', { defaultValue: 'Add a passkey' })}
      </Button>
    </section>
  );
}
