import {
  useEffect,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { VmPhaseDetail } from '../engine/vm-types';
import { TRY_AGAIN_AFTER_MS } from '../engine/boot-watchdog';
import {
  announcedProgress,
  failureKey,
  tryAgainVisible,
} from './boot-state';
import type {
  RmhosFailure,
  RmhosPhase,
} from './useRmhosSession';

interface Props {
  phase: RmhosPhase;
  detail?:
    | VmPhaseDetail
    | undefined;
  failure: RmhosFailure | null;
  /** A phone with no keyboard: ask before downloading the machine. */
  needsKeyboardNotice: boolean;
  /** With the notice: this device may not have the memory for it either. */
  lowMemory?: boolean;
  onStart: () => void;
  /** Starts the machine over (Try again / Restart). */
  onRetry: () => void;
  /** `corrupt` only: the raw stored bytes as a download. */
  onDownloadDamaged: () => void | Promise<void>;
  /** `corrupt` only: keep the unreadable entry aside and start with an empty home. */
  onStartEmpty: () => void | Promise<void>;
  /** `corrupt` only: open the file picker for a backup. */
  onRestoreBackup: () => void;
  /** `handshake` only, when a restored backup replaced a home that can be put back. */
  previousAvailable: boolean;
  onPutPreviousBack: () => void | Promise<void>;
}

export default function BootScreen({
  phase,
  detail,
  failure,
  needsKeyboardNotice,
  lowMemory = false,
  onStart,
  onRetry,
  onDownloadDamaged,
  onStartEmpty,
  onRestoreBackup,
  previousAvailable,
  onPutPreviousBack,
}: Props) {
  const {
    t,
  } =
    useTranslation(
      'c-rmhos',
    );
  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );
  const progress =
    detail &&
    'total' in
      detail &&
    detail.total >
      0
      ? Math.min(
          1,
          detail.loaded /
            detail.total,
        )
      : null;
  const error =
    detail &&
    'error' in
      detail
      ? detail.error
      : null;
  const ended =
    phase ===
      'failed' ||
    phase ===
      'stopped';

  const failureText: Record<
    string,
    string
  > =
    {
      corrupt:
        t(
          'failed-corrupt',
          {
            defaultValue:
              'Your saved files could not be read.',
          },
        ),
      locked:
        t(
          'failed-locked',
          {
            defaultValue:
              'rmhOS is already open in another tab.',
          },
        ),
      handshake:
        t(
          'failed-handshake',
          {
            defaultValue:
              'rmhOS started but could not sign you in.',
          },
        ),
      'image-missing':
        t(
          'failed-image-missing',
          {
            defaultValue:
              'The files rmhOS needs are not available right now. Try again later.',
          },
        ),
      'image-invalid':
        t(
          'failed-image-invalid',
          {
            defaultValue:
              'The files rmhOS needs could not be used. Try again later.',
          },
        ),
      network:
        t(
          'failed-network',
          {
            defaultValue:
              'rmhOS could not download its files. Check your connection and try again.',
          },
        ),
      stalled:
        t(
          'failed-stalled',
          {
            defaultValue:
              'The download stopped. Check your connection and try again.',
          },
        ),
      'boot-timeout':
        t(
          'failed-boot-timeout',
          {
            defaultValue:
              'rmhOS did not start in time. Try again.',
          },
        ),
      load: t(
        'failed-load',
        {
          defaultValue:
            'rmhOS could not be loaded.',
        },
      ),
    };
  let status: string;
  if (
    phase ===
    'failed'
  )
    status =
      failureText[
        failureKey(
          failure,
          detail,
        )
      ] ??
      failureText.load!;
  else if (
    phase ===
    'stopped'
  )
    status =
      t(
        'stopped',
        {
          defaultValue:
            'rmhOS has stopped.',
        },
      );
  else if (
    phase ===
    'session'
  )
    status =
      t(
        'boot-session',
        {
          defaultValue:
            'Signing in',
        },
      );
  else if (
    phase ===
    'booting'
  )
    status =
      t(
        'boot-starting',
        {
          defaultValue:
            'Starting the machine',
        },
      );
  else if (
    phase ===
    'downloading'
  )
    status =
      t(
        'boot-downloading',
        {
          defaultValue:
            'Downloading the machine',
        },
      );
  else
    status =
      t(
        'boot-preparing',
        {
          defaultValue:
            'Preparing',
        },
      );

  // After a while in downloading, starting or signing in, "Try again" appears: a machine that
  // does not come up is not a spinner with no way out (the watchdog ends it for good later).
  const [
    waited,
    setWaited,
  ] =
    useState(
      0,
    );
  useEffect(() => {
    setWaited(
      0,
    );
    if (
      phase !==
        'downloading' &&
      phase !==
        'booting' &&
      phase !==
        'session'
    )
      return;
    const id =
      setTimeout(
        () =>
          setWaited(
            TRY_AGAIN_AFTER_MS,
          ),
        TRY_AGAIN_AFTER_MS,
      );
    return () =>
      clearTimeout(
        id,
      );
  }, [
    phase,
  ]);
  const announced =
    phase ===
    'downloading'
      ? announcedProgress(
          progress,
        )
      : null;

  const run =

      (
        fn: () => void | Promise<void>,
      ) =>
      async () => {
        setBusy(
          true,
        );
        try {
          await fn();
        } finally {
          setBusy(
            false,
          );
        }
      };

  const retryLabel =
    failure ===
      'handshake' ||
    phase ===
      'stopped'
      ? t(
          'restart',
          {
            defaultValue:
              'Restart',
          },
        )
      : t(
          'retry',
          {
            defaultValue:
              'Try again',
          },
        );

  return (
    <div
      className="rmhos-boot"
      data-phase={
        phase
      }
    >
      <div className="rmhos-boot-panel">
        <h1 className="text-lg font-semibold">
          {t(
            'title',
            {
              defaultValue:
                'rmhOS',
            },
          )}
        </h1>
        {needsKeyboardNotice ? (
          <>
            <p className="text-sm text-(--app-text-muted)">
              {t(
                'keyboard-needed',
                {
                  defaultValue:
                    'rmhOS needs a keyboard.',
                },
              )}
            </p>
            {lowMemory && (
              <p className="text-sm text-(--app-text-muted)">
                {t(
                  'low-memory',
                  {
                    defaultValue:
                      'This device may not have enough memory to run it, and the page could close.',
                  },
                )}
              </p>
            )}
            <div>
              <Button
                variant="primary"
                onClick={
                  onStart
                }
              >
                {t(
                  'start-anyway',
                  {
                    defaultValue:
                      'Start anyway',
                  },
                )}
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* The live region holds only what should be spoken: the phase, and the progress at
                every 25 %. The buttons below it are outside it. */}
            <div
              role="status"
              aria-live="polite"
            >
              <p className="text-sm text-(--app-text-muted)">
                {
                  status
                }
              </p>
              {announced !==
                null &&
                announced >
                  0 && (
                  <p className="sr-only">
                    {t(
                      'boot-percent',
                      {
                        defaultValue:
                          '{{percent}}%',
                        percent:
                          announced,
                      },
                    )}
                  </p>
                )}
            </div>
            {!ended && (
              <div
                className="rmhos-boot-bar"
                aria-hidden="true"
              >
                <span
                  style={{
                    width: `${Math.round((progress ?? 0) * 100)}%`,
                  }}
                />
              </div>
            )}
            {phase ===
              'downloading' &&
              progress !==
                null && (
                <p
                  className="text-xs font-mono text-(--app-text-muted)"
                  aria-hidden="true"
                >
                  {Math.round(
                    progress *
                      100,
                  )}

                  %
                </p>
              )}
            {!ended &&
              tryAgainVisible(
                phase,
                waited,
              ) && (
                <div>
                  <Button
                    onClick={
                      onRetry
                    }
                  >
                    {t(
                      'retry',
                      {
                        defaultValue:
                          'Try again',
                      },
                    )}
                  </Button>
                </div>
              )}
            {ended &&
              failure ===
                'corrupt' && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    disabled={
                      busy
                    }
                    onClick={run(
                      onDownloadDamaged,
                    )}
                  >
                    {t(
                      'download-damaged',
                      {
                        defaultValue:
                          'Download the damaged backup',
                      },
                    )}
                  </Button>
                  <Button
                    disabled={
                      busy
                    }
                    onClick={
                      onRestoreBackup
                    }
                  >
                    {t(
                      'restore-backup',
                      {
                        defaultValue:
                          'Restore backup',
                      },
                    )}
                  </Button>
                  <Button
                    disabled={
                      busy
                    }
                    onClick={run(
                      onStartEmpty,
                    )}
                  >
                    {t(
                      'start-empty',
                      {
                        defaultValue:
                          'Start with an empty home',
                      },
                    )}
                  </Button>
                </div>
              )}
            {ended &&
              failure !==
                'corrupt' && (
                <>
                  {error &&
                    failure !==
                      'locked' && (
                      <details className="text-xs text-(--app-text-muted)">
                        <summary className="cursor-pointer">
                          {t(
                            'details',
                            {
                              defaultValue:
                                'Details',
                            },
                          )}
                        </summary>
                        <p className="font-mono mt-1">
                          {
                            error
                          }
                        </p>
                      </details>
                    )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      onClick={
                        onRetry
                      }
                    >
                      {
                        retryLabel
                      }
                    </Button>
                    {failure ===
                      'handshake' &&
                      previousAvailable && (
                        <Button
                          disabled={
                            busy
                          }
                          onClick={run(
                            onPutPreviousBack,
                          )}
                        >
                          {t(
                            'put-previous-back',
                            {
                              defaultValue:
                                'Put the previous files back',
                            },
                          )}
                        </Button>
                      )}
                  </div>
                </>
              )}
          </>
        )}
      </div>
    </div>
  );
}
