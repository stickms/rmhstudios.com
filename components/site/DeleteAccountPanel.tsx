/**
 * Danger-zone account deletion (GDPR right to erasure). Requires the user to
 * type their own handle/username to confirm, then calls /api/account/delete,
 * which wipes credentials + scrubs personal data. Rendered on /settings/privacy.
 */

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';

import { authClient } from '@/lib/auth-client';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { deleteAccountApi } from '@/lib/account/account.contract';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { useDeviceSignOut } from '@/components/settings/useDeviceSignOut';

export function DeleteAccountPanel() {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  const {
    data: session,
  } =
    useSession();
  const user =
    session?.user as
      | {
          handle?:
            | string
            | null;
          username?:
            | string
            | null;
        }
      | undefined;
  const expected =
    (
      user?.handle ||
      user?.username ||
      ''
    ).replace(
      /^@/,
      '',
    );

  const [
    confirm,
    setConfirm,
  ] =
    useState(
      '',
    );
  const [
    open,
    setOpen,
  ] =
    useState(
      false,
    );
  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );

  const deviceSignOut =
    useDeviceSignOut();

  const matches =
    expected.length >
      0 &&
    confirm
      .trim()
      .replace(
        /^@/,
        '',
      )
      .toLowerCase() ===
      expected.toLowerCase();

  const del =
    async () => {
      if (
        !matches
      )
        return;
      setBusy(
        true,
      );
      try {
        try {
          await api(
            deleteAccountApi,
            {
              body: {
                confirm:
                  confirm.trim(),
              },
            },
          );
        } catch (e) {
          toast.error(
            serverError(
              e,
            ) ||
              t(
                'delete-failed',
                {
                  defaultValue:
                    'Could not delete your account.',
                },
              ),
          );
          return;
        }
        toast.success(
          t(
            'delete-done',
            {
              defaultValue:
                'Your account has been deleted.',
            },
          ),
        );
        try {
          // The deletion is done, so this device's personal data goes with it (whatever the sign-out switch says).
          // Studio work and unsent drafts get the keep-or-delete question first; Cancel there means keep, because the
          // sign-out cannot be undone (sprint 07, feature 03).
          await deviceSignOut.run(
            () =>
              authClient.signOut(),
            {
              force: true,
              cancelMeans:
                'keep',
            },
          );
        } catch {
          // session rows are already gone; ignore
        }
        window.location.href =
          '/';
      } catch {
        toast.error(
          t(
            'delete-failed',
            {
              defaultValue:
                'Could not delete your account.',
            },
          ),
        );
      } finally {
        setBusy(
          false,
        );
      }
    };

  return (
    <SettingsSection
      tone="danger"
      title={t(
        'delete-title',
        {
          defaultValue:
            'Delete account',
        },
      )}
      description={t(
        'delete-description',
        {
          defaultValue:
            'Permanently remove your personal data and sign you out of every device. Your posts are kept but anonymized (shown as “Deleted user”). This cannot be undone.',
        },
      )}
    >
      {deviceSignOut.dialog}
      <p className="t-body mb-3 text-site-text-muted">
        {t(
          'delete-other-devices',
          {
            ns: 'device-data',
            defaultValue:
              'Other devices keep what this site stored in their own browsers, and we cannot reach them from here. Clear each one from its This device page.',
          },
        )}
      </p>
      <p className="t-body mb-3">
        <Link
          to="/settings/device"
          className="underline"
        >
          {t(
            'delete-other-devices-link',
            {
              ns: 'device-data',
              defaultValue:
                'Open this device page',
            },
          )}
        </Link>
      </p>
      {!open ? (
        <Button
          variant="danger"
          onClick={() =>
            setOpen(
              true,
            )
          }
        >
          {t(
            'delete-start',
            {
              defaultValue:
                'Delete my account',
            },
          )}
        </Button>
      ) : (
        <div className="space-y-3">
          <label
            htmlFor="delete-confirm"
            className="block text-sm text-site-text"
          >
            {expected
              ? t(
                  'delete-confirm-label',
                  {
                    defaultValue:
                      'Type your handle “{{handle}}” to confirm:',
                    handle:
                      expected,
                  },
                )
              : t(
                  'delete-confirm-label-generic',
                  {
                    defaultValue:
                      'Type your username or email to confirm:',
                  },
                )}
          </label>
          <Input
            id="delete-confirm"
            value={
              confirm
            }
            onChange={(
              e,
            ) =>
              setConfirm(
                e
                  .target
                  .value,
              )
            }
            autoComplete="off"
            placeholder={
              expected ||
              undefined
            }
            aria-invalid={
              confirm.length >
                0 &&
              !matches
            }
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              onClick={
                del
              }
              disabled={
                !matches ||
                busy
              }
            >
              {busy
                ? t(
                    'delete-working',
                    {
                      defaultValue:
                        'Deleting…',
                    },
                  )
                : t(
                    'delete-permanent',
                    {
                      defaultValue:
                        'Permanently delete',
                    },
                  )}
            </Button>
            <Button
              variant="default"
              onClick={() => {
                setOpen(
                  false,
                );
                setConfirm(
                  '',
                );
              }}
              disabled={
                busy
              }
            >
              {t(
                'cancel',
                {
                  defaultValue:
                    'Cancel',
                },
              )}
            </Button>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
