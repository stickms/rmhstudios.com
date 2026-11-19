/**
 * Share a result (RMH Music Phase 6, plan 1.4 and 1.8): a secondary Share button and its dialog.
 *
 * The dialog shows, as plain lines, exactly what the link will show, with "Show my name and
 * picture" off unless ticked, and says who can see it and for how long. Nothing is public until
 * Copy link is pressed: that press makes the link (or gets back the live one already made for the
 * same result and name choice) and writes it to the clipboard; the button then reads "Link copied"
 * and a polite live region says so. If the clipboard is refused, a read-only field with the link
 * appears, selected. Where the device has a share sheet, "More ways to share" opens it once the
 * link exists. Focus returns to Share on close. Copy link is the dialog's one primary (R4).
 */
import {
  useId,
  useRef,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDialogHost } from '@/components/shared/useDialogHost';
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import {
  createShareApi,
  type CreateShareInput,
  type ShareSummary,
} from '@/lib/rmhmusic/social/share.contract';
import type { SharePayload } from '@/lib/rmhmusic/learn/social/share';
import {
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TEXT_BUTTON,
} from '../buttons';
import { shareText } from './share-text';

/** What to share: a Daily date, or a song and mode. The server builds the rest. */
type Target =
  | {
      kind: 'daily';
      date: string;
    }
  | {
      kind: 'song';
      songId: string;
      mode:
        | 'wait'
        | 'play';
    };

export function ShareButton({
  target,
  preview,
  label,
}: {
  /** What to share: a Daily date, or a song and mode. The server builds the rest. */
  target: Target;
  /** The lines to preview, from the result on screen (the link shows the server's stored copy). */
  preview: SharePayload;
  label?: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  const [
    open,
    setOpen,
  ] =
    useState(
      false,
    );
  const button =
    useRef<HTMLButtonElement>(
      null,
    );
  return (
    <>
      <button
        ref={
          button
        }
        type="button"
        onClick={() =>
          setOpen(
            true,
          )
        }
        className={
          SECONDARY_BUTTON
        }
      >
        {label ??
          t(
            'share-button',
            {
              defaultValue:
                'Share',
            },
          )}
      </button>
      <ShareDialog
        open={
          open
        }
        onOpenChange={
          setOpen
        }
        target={
          target
        }
        preview={
          preview
        }
        returnFocus={
          button
        }
      />
    </>
  );
}

type Phase =
  | {
      kind: 'idle';
    }
  | {
      kind: 'making';
    }
  | {
      kind: 'copied';
      share: ShareSummary;
      url: string;
    }
  | {
      kind: 'manual';
      share: ShareSummary;
      url: string;
    }
  | {
      kind: 'failed';
      reason:
        | 'cap'
        | 'nothing'
        | 'other';
    };

function ShareDialog({
  open,
  onOpenChange,
  target,
  preview,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (
    open: boolean,
  ) => void;
  target: Target;
  preview: SharePayload;
  returnFocus: React.RefObject<HTMLButtonElement | null>;
}) {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  const {
    host,
    sentinel,
  } =
    useDialogHost(
      '.rmhmusic-theme',
    );
  const queryClient =
    useQueryClient();
  const [
    showName,
    setShowName,
  ] =
    useState(
      false,
    );
  const [
    phase,
    setPhase,
  ] =
    useState<Phase>(
      {
        kind: 'idle',
      },
    );
  const id =
    useId();
  // Once made, the dialog shows what the link shows: the server's stored copy.
  const made =
    phase.kind ===
      'copied' ||
    phase.kind ===
      'manual'
      ? phase.share
      : null;
  const lines =
    shareText(
      t,
      i18n.language,
      made?.payload ??
        preview,
    );

  function close(
    next: boolean,
  ) {
    onOpenChange(
      next,
    );
    if (
      !next
    )
      setPhase(
        {
          kind: 'idle',
        },
      );
  }

  async function copy() {
    setPhase(
      {
        kind: 'making',
      },
    );
    let share: ShareSummary;
    try {
      share =
        await api(
          createShareApi,
          {
            body: {
              ...target,
              showName,
            } as CreateShareInput,
          },
        );
    } catch (err) {
      const status =
        err instanceof
        HttpError
          ? err.status
          : 0;
      setPhase(
        {
          kind: 'failed',
          reason:
            status ===
            409
              ? 'cap'
              : status ===
                  400
                ? 'nothing'
                : 'other',
        },
      );
      return;
    }
    void queryClient.invalidateQueries(
      {
        queryKey:
          [
            'rmhmusic',
            'shares',
          ],
      },
    );
    const url = `${window.location.origin}${share.path}`;
    try {
      await navigator.clipboard.writeText(
        url,
      );
      setPhase(
        {
          kind: 'copied',
          share,
          url,
        },
      );
    } catch {
      // The field selects itself when it mounts, so a long-press or Ctrl+C copies it.
      setPhase(
        {
          kind: 'manual',
          share,
          url,
        },
      );
    }
  }

  const canShareSheet =
    typeof navigator !==
      'undefined' &&
    typeof navigator.share ===
      'function';

  return (
    <>
      {
        sentinel
      }
      {host && (
        <Dialog
          open={
            open
          }
          onOpenChange={
            close
          }
        >
          <DialogContent
            container={
              host
            }
            className="app-glass max-w-md grid-cols-[minmax(0,1fr)] gap-4 p-5 text-app-text sm:p-6"
            aria-describedby={`${id}-who`}
            onCloseAutoFocus={(
              e,
            ) => {
              const target =
                returnFocus.current;
              if (
                !target
              )
                return;
              e.preventDefault();
              target.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle className="rmm-display text-2xl leading-8 text-app-text">
                {t(
                  'share-title',
                  {
                    defaultValue:
                      'Share this result',
                  },
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="rmm-sheet divide-y divide-app-border">
              <div className="space-y-1 p-4">
                <p className="text-sm leading-5 text-app-text-muted">
                  {
                    lines.lead
                  }
                </p>
                <p className="text-xl leading-7 font-semibold text-app-text">
                  {
                    lines.title
                  }
                </p>
                {lines.subtitle ? (
                  <p className="text-sm leading-5 text-app-text">
                    {
                      lines.subtitle
                    }
                  </p>
                ) : null}
                <p className="text-sm leading-5 text-app-text-muted">
                  {
                    lines.stars
                  }
                </p>
              </div>
              <p className="px-4 py-3 text-sm leading-5 text-app-text">
                {showName
                  ? t(
                      'share-shows-name',
                      {
                        defaultValue:
                          'Shows your name and picture.',
                      },
                    )
                  : t(
                      'share-shows-learner',
                      {
                        defaultValue:
                          'Shows "A learner" instead of your name.',
                      },
                    )}
              </p>
            </div>
            <label className="flex min-h-11 items-center gap-3 text-sm leading-5 text-app-text">
              <input
                type="checkbox"
                checked={
                  showName
                }
                disabled={
                  phase.kind !==
                    'idle' &&
                  phase.kind !==
                    'failed'
                }
                onChange={(
                  e,
                ) =>
                  setShowName(
                    e
                      .target
                      .checked,
                  )
                }
                className="h-5 w-5 accent-app-accent"
              />
              {t(
                'share-show-name',
                {
                  defaultValue:
                    'Show my name and picture',
                },
              )}
            </label>
            <p
              id={`${id}-who`}
              className="text-sm leading-5 text-app-text-muted"
            >
              {t(
                'share-who',
                {
                  defaultValue:
                    'Anyone with the link can see this. It stops working after 90 days, or when you stop sharing it under Friends and sharing. Previews already posted elsewhere may stay.',
                },
              )}
            </p>
            {phase.kind ===
            'manual' ? (
              <div className="space-y-1">
                <label
                  htmlFor={`${id}-url`}
                  className="text-sm leading-5 font-medium text-app-text"
                >
                  {t(
                    'share-copy-this',
                    {
                      defaultValue:
                        'Copy this link',
                    },
                  )}
                </label>
                <input
                  ref={(
                    el,
                  ) =>
                    el?.select()
                  }
                  id={`${id}-url`}
                  readOnly
                  value={
                    phase.url
                  }
                  onFocus={(
                    e,
                  ) =>
                    e.currentTarget.select()
                  }
                  className="h-11 w-full rounded-app-sm border border-app-border bg-app-surface px-3 font-mono text-sm text-app-text"
                />
              </div>
            ) : null}
            <p
              role="status"
              aria-live="polite"
              className="min-h-5 text-sm leading-5 text-app-text"
            >
              {phase.kind ===
              'copied'
                ? t(
                    'share-copied-status',
                    {
                      defaultValue:
                        'Link copied.',
                    },
                  )
                : phase.kind ===
                    'failed'
                  ? phase.reason ===
                    'cap'
                    ? t(
                        'share-failed-cap',
                        {
                          defaultValue:
                            'You have 50 shared links. Stop sharing one under Friends and sharing to share another.',
                        },
                      )
                    : phase.reason ===
                        'nothing'
                      ? t(
                          'share-failed-nothing',
                          {
                            defaultValue:
                              'There is no saved result to share yet.',
                          },
                        )
                      : t(
                          'share-failed',
                          {
                            defaultValue:
                              "Couldn't make the link. Try again.",
                          },
                        )
                  : ''}
            </p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <button
                type="button"
                disabled={
                  phase.kind ===
                  'making'
                }
                onClick={() =>
                  void copy()
                }
                className={
                  PRIMARY_BUTTON
                }
              >
                {phase.kind ===
                'copied'
                  ? t(
                      'share-copied',
                      {
                        defaultValue:
                          'Link copied',
                      },
                    )
                  : t(
                      'share-copy',
                      {
                        defaultValue:
                          'Copy link',
                      },
                    )}
              </button>
              {made &&
              canShareSheet ? (
                <button
                  type="button"
                  onClick={() => {
                    void navigator
                      .share(
                        {
                          title: `${lines.title}: ${lines.lead}`,
                          url:
                            phase.kind ===
                              'copied' ||
                            phase.kind ===
                              'manual'
                              ? phase.url
                              : '',
                        },
                      )
                      .catch(
                        () => {},
                      );
                  }}
                  className={
                    TEXT_BUTTON
                  }
                >
                  {t(
                    'share-sheet',
                    {
                      defaultValue:
                        'More ways to share',
                    },
                  )}
                </button>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
