import {
  useRef,
  useState,
} from 'react';
import {
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  CalendarClock,
  CalendarDays,
  ChevronDown,
  Sunrise,
} from 'lucide-react';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  MenuItem,
  MenuLabel,
} from '@/components/ui/menu';
import { ScheduleControl } from '@/components/ui/schedule-control';
import { api } from '@/lib/contract/client';
import { isValidTimeZone } from '@/lib/calendar/tz';
import { serverError } from '@/lib/http';
import { toast } from '@/lib/toast';
import {
  createScheduledMessageApi,
  listScheduledMessagesApi,
} from '@/lib/messages/scheduled.contract';
import {
  sendLaterPresets,
  type SendLaterPresets,
} from '@/lib/messages/scheduled';

/** What the composer holds right now: the same fields a hand-sent message carries. */
export interface ScheduleDraft {
  content: string;
  gifUrl:
    | string
    | null;
  /** The GIF's description (sprint 06 #15); carried to the scheduled message. */
  gifAlt?: string;
  imageUrls: string[];
  /** Index-aligned with `imageUrls`; '' = none. */
  imageAlts?: string[];
}

/** The sender's zone: the browser's, or UTC where `Intl` cannot say. */
function senderZone(): string {
  try {
    const zone =
      Intl.DateTimeFormat().resolvedOptions()
        .timeZone;
    return zone &&
      isValidTimeZone(
        zone,
      )
      ? zone
      : 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * "Send later" beside Send (s03-12): a menu with Tomorrow 9:00, Monday 9:00 and
 * a custom time. Scheduling stores the draft on the server and clears the
 * composer; the Scheduled strip then lists it. The trigger is a plain button, so
 * Enter or Space opens the menu and the arrow keys move through it.
 */
export function SendLaterMenu({
  chatId,
  disabled,
  getDraft,
  onScheduled,
  className,
}: {
  chatId: string;
  /** True when there is nothing to schedule (or a send is in flight). */
  disabled: boolean;
  getDraft: () => ScheduleDraft;
  /** Clear the composer: the message now lives on the server. */
  onScheduled: () => void;
  className?: string;
}) {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'send-later',
    );
  const queryClient =
    useQueryClient();
  const triggerRef =
    useRef<HTMLButtonElement>(
      null,
    );
  const [
    menuOpen,
    setMenuOpen,
  ] =
    useState(
      false,
    );
  const [
    presets,
    setPresets,
  ] =
    useState<SendLaterPresets | null>(
      null,
    );
  const [
    customOpen,
    setCustomOpen,
  ] =
    useState(
      false,
    );
  const [
    customValue,
    setCustomValue,
  ] =
    useState(
      '',
    );

  const locale =
    i18n.language ||
    undefined;
  const time =
    (
      ms: number,
    ) =>
      new Intl.DateTimeFormat(
        locale,
        {
          hour: 'numeric',
          minute:
            '2-digit',
        },
      ).format(
        new Date(
          ms,
        ),
      );
  const day =
    (
      ms: number,
    ) =>
      new Intl.DateTimeFormat(
        locale,
        {
          weekday:
            'short',
          month:
            'short',
          day: 'numeric',
        },
      ).format(
        new Date(
          ms,
        ),
      );
  const when =
    (
      ms: number,
    ) =>
      new Intl.DateTimeFormat(
        locale,
        {
          dateStyle:
            'medium',
          timeStyle:
            'short',
        },
      ).format(
        new Date(
          ms,
        ),
      );

  const schedule =
    useMutation(
      {
        mutationFn:
          (
            sendAt: string,
          ) => {
            const draft =
              getDraft();
            return api(
              createScheduledMessageApi,
              {
                body: {
                  chatId,
                  content:
                    draft.content.trim(),
                  ...(draft.gifUrl
                    ? {
                        gifUrl:
                          draft.gifUrl,
                        ...(draft.gifAlt?.trim()
                          ? {
                              gifAlt:
                                draft.gifAlt.trim(),
                            }
                          : {}),
                      }
                    : {}),
                  ...(draft
                    .imageUrls
                    .length
                    ? {
                        imageUrls:
                          draft.imageUrls,
                        imageAlts:
                          draft.imageUrls.map(
                            (
                              _,
                              i,
                            ) =>
                              draft
                                .imageAlts?.[
                                i
                              ] ??
                              '',
                          ),
                      }
                    : {}),
                  sendAt,
                },
              },
            );
          },
        onSuccess:
          ({
            message,
          }) => {
            setCustomOpen(
              false,
            );
            onScheduled();
            toast.success(
              t(
                'scheduled-toast',
                {
                  time: when(
                    new Date(
                      message.sendAt,
                    ).getTime(),
                  ),
                  defaultValue:
                    'Scheduled for {{time}}',
                },
              ),
            );
            void queryClient.invalidateQueries(
              {
                queryKey:
                  [
                    listScheduledMessagesApi.path,
                  ],
              },
            );
          },
        onError:
          (
            error,
          ) => {
            toast.error(
              serverError(
                error,
              ) ||
                t(
                  'schedule-failed',
                  {
                    defaultValue:
                      'Could not schedule the message',
                  },
                ),
            );
          },
      },
    );

  const toggle =
    () => {
      if (
        !menuOpen
      )
        setPresets(
          sendLaterPresets(
            Date.now(),
            senderZone(),
          ),
        );
      setMenuOpen(
        (
          open,
        ) =>
          !open,
      );
    };

  const pick =
    (
      ms: number,
    ) => {
      setMenuOpen(
        false,
      );
      schedule.mutate(
        new Date(
          ms,
        ).toISOString(),
      );
    };

  return (
    <>
      <Button
        ref={
          triggerRef
        }
        type="button"
        variant="default"
        size="icon"
        className={
          className
        }
        disabled={
          disabled ||
          schedule.isPending
        }
        aria-label={t(
          'menu-label',
          {
            defaultValue:
              'Send later',
          },
        )}
        aria-haspopup="menu"
        aria-expanded={
          menuOpen
        }
        onClick={
          toggle
        }
      >
        <ChevronDown
          aria-hidden
        />
      </Button>
      <AnchoredMenu
        open={
          menuOpen
        }
        onClose={() =>
          setMenuOpen(
            false,
          )
        }
        anchorRef={
          triggerRef
        }
        label={t(
          'menu-label',
          {
            defaultValue:
              'Send later',
          },
        )}
        side="top"
        align="end"
        className="w-64"
      >
        <MenuLabel>
          {t(
            'menu-heading',
            {
              defaultValue:
                'Send later',
            },
          )}
        </MenuLabel>
        {presets && (
          <>
            <MenuItem
              icon={
                Sunrise
              }
              hint={day(
                presets.tomorrow,
              )}
              onSelect={() =>
                pick(
                  presets.tomorrow,
                )
              }
            >
              {t(
                'preset-tomorrow',
                {
                  time: time(
                    presets.tomorrow,
                  ),
                  defaultValue:
                    'Tomorrow {{time}}',
                },
              )}
            </MenuItem>
            <MenuItem
              icon={
                CalendarDays
              }
              hint={day(
                presets.monday,
              )}
              onSelect={() =>
                pick(
                  presets.monday,
                )
              }
            >
              {t(
                'preset-monday',
                {
                  time: time(
                    presets.monday,
                  ),
                  defaultValue:
                    'Monday {{time}}',
                },
              )}
            </MenuItem>
          </>
        )}
        <MenuItem
          icon={
            CalendarClock
          }
          onSelect={() => {
            setMenuOpen(
              false,
            );
            setCustomOpen(
              true,
            );
          }}
        >
          {t(
            'preset-custom',
            {
              defaultValue:
                'Pick date and time',
            },
          )}
        </MenuItem>
      </AnchoredMenu>
      <Dialog
        open={
          customOpen
        }
        onOpenChange={
          setCustomOpen
        }
      >
        <DialogContent
          className="sm:max-w-md"
          onCloseAutoFocus={(
            event,
          ) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {t(
                'custom-title',
                {
                  defaultValue:
                    'Send later',
                },
              )}
            </DialogTitle>
            <DialogDescription>
              {t(
                'custom-description',
                {
                  defaultValue:
                    'Choose when this message is sent. Between a minute and 30 days from now.',
                },
              )}
            </DialogDescription>
          </DialogHeader>
          <ScheduleControl
            id="send-later-at"
            value={
              customValue
            }
            onChange={
              setCustomValue
            }
            onSubmit={(
              iso,
            ) =>
              schedule.mutate(
                iso,
              )
            }
            submitting={
              schedule.isPending
            }
            submitLabel={t(
              'custom-submit',
              {
                defaultValue:
                  'Schedule',
              },
            )}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
