import { lazy, Suspense, useCallback, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { UnsentCounts } from '@/lib/device-data/inspect';
import { signOutAndMaybeClear, type SignOutOutcome, type UnsentChoice } from '@/lib/device-data/sign-out';

const UnsentWorkDialog = lazy(() => import('./UnsentWorkDialog'));

export interface DeviceSignOutOptions {
  /** Clear whatever the switch says (account deletion). */
  force?: boolean;
  /** Never clear (signing in again right away). */
  skipClear?: boolean;
  /** `keep` when the sign-out is already unavoidable, as after an account deletion. */
  cancelMeans?: 'abort' | 'keep';
}

/**
 * The sign-out every call site shares (sprint 07, feature 03): `run(signOut)` clears this device first when the member
 * asked for that, asking keep-or-delete when Studio work or unsent drafts exist only here, then calls the caller's own
 * `signOut`. The caller renders `dialog` once, anywhere in its tree.
 */
export function useDeviceSignOut(): {
  run: (signOut: () => Promise<unknown>, options?: DeviceSignOutOptions) => Promise<SignOutOutcome>;
  dialog: ReactNode;
} {
  const { t } = useTranslation('device-data');
  const [pending, setPending] = useState<{
    counts: UnsentCounts;
  } | null>(null);
  const settleRef = useRef<((choice: UnsentChoice) => void) | null>(null);

  const choose = useCallback(
    (counts: UnsentCounts) =>
      new Promise<UnsentChoice>((resolve) => {
        settleRef.current = (choice) => {
          settleRef.current = null;
          setPending(null);
          resolve(choice);
        };
        setPending({
          counts,
        });
      }),
    [],
  );

  const run = useCallback(
    (signOut: () => Promise<unknown>, options: DeviceSignOutOptions = {}) =>
      signOutAndMaybeClear({
        signOut,
        choose,
        ...options,
      }),
    [choose],
  );

  const lines: string[] = [];
  if (pending) {
    const { projects, samples, drafts } = pending.counts;
    if (projects > 0)
      lines.push(
        t('unsent-projects', {
          count: projects,
          defaultValue_one: '{{count}} Studio project',
          defaultValue_other: '{{count}} Studio projects',
          defaultValue: '{{count}} Studio projects',
        }),
      );
    if (samples > 0)
      lines.push(
        t('unsent-samples', {
          count: samples,
          defaultValue_one: '{{count}} Studio sample',
          defaultValue_other: '{{count}} Studio samples',
          defaultValue: '{{count}} Studio samples',
        }),
      );
    if (drafts > 0)
      lines.push(
        t('unsent-drafts', {
          count: drafts,
          defaultValue_one: '{{count}} unsent draft',
          defaultValue_other: '{{count}} unsent drafts',
          defaultValue: '{{count}} unsent drafts',
        }),
      );
  }

  const dialog = pending ? (
    <Suspense fallback={null}>
      <UnsentWorkDialog
        title={t('unsent-title', {
          defaultValue: 'Some of your work exists only on this device',
        })}
        intro={t('unsent-intro', {
          defaultValue: 'Keep it, or delete it from this device. Deleting cannot be undone.',
        })}
        lines={lines}
        cancelLabel={t('unsent-cancel', {
          defaultValue: 'Cancel',
        })}
        keepLabel={t('unsent-keep', {
          defaultValue: 'Sign out and keep them',
        })}
        deleteLabel={t('unsent-delete', {
          defaultValue: 'Sign out and delete them',
        })}
        onChoose={(choice) => settleRef.current?.(choice)}
      />
    </Suspense>
  ) : null;

  return {
    run,
    dialog,
  };
}
