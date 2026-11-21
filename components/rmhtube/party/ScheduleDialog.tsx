/**
 * ScheduleDialog — schedule a watch party, or edit one (host only). The same form both times: an edit sends
 * only what changed. The time is a `datetime-local` value in the viewer's own zone, converted to a UTC instant
 * on submit; the server checks the 15-minute-to-30-day window again.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/shared/app-toast';
import {
  api,
  errorField,
} from '@/lib/contract/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useDialogHost } from '@/components/shared/useDialogHost';
import {
  schedulePartyApi,
  updatePartyApi,
  type PartyDTO,
} from '@/lib/rmhtube/parties.contract';
import {
  ABSOLUTE_MAX_MEMBERS,
  DEFAULT_MAX_MEMBERS,
} from '@/lib/rmhtube/constants';
import {
  PARTY_DESCRIPTION_MAX,
  PARTY_NAME_MAX,
} from '@/lib/rmhtube/parties-schema';
import { toLocalInputValue } from './party-format';

interface Props {
  open: boolean;
  onOpenChange: (
    open: boolean,
  ) => void;
  /** Present when editing: the form starts from it and PATCHes. */
  party?: PartyDTO;
  onSaved: (
    party: PartyDTO,
  ) => void;
}

export default function ScheduleDialog({
  open,
  onOpenChange,
  party,
  onSaved,
}: Props) {
  const {
    t,
  } =
    useTranslation(
      'watch-parties',
    );
  const {
    host,
    sentinel,
  } =
    useDialogHost(
      '.app-theme',
    );
  const editing =
    party !==
    undefined;
  const [
    name,
    setName,
  ] =
    useState(
      party?.name ??
        '',
    );
  const [
    description,
    setDescription,
  ] =
    useState(
      party?.description ??
        '',
    );
  const [
    startsAt,
    setStartsAt,
  ] =
    useState(
      party
        ? toLocalInputValue(
            party.scheduledFor,
          )
        : '',
    );
  const [
    isPublic,
    setIsPublic,
  ] =
    useState(
      party?.isPublic ??
        true,
    );
  const [
    maxMembers,
    setMaxMembers,
  ] =
    useState(
      String(
        party?.maxMembers ??
          DEFAULT_MAX_MEMBERS,
      ),
    );
  const [
    firstVideoUrl,
    setFirstVideoUrl,
  ] =
    useState(
      '',
    );
  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    );
  const [
    error,
    setError,
  ] =
    useState<
      | string
      | null
    >(
      null,
    );

  const when =
    startsAt
      ? new Date(
          startsAt,
        )
      : null;
  const whenValid =
    when !==
      null &&
    !Number.isNaN(
      when.getTime(),
    );
  const members =
    Number(
      maxMembers,
    );
  const membersValid =
    Number.isInteger(
      members,
    ) &&
    members >=
      2 &&
    members <=
      ABSOLUTE_MAX_MEMBERS;
  const canSave =
    name.trim()
      .length >
      0 &&
    whenValid &&
    (editing ||
      membersValid) &&
    !saving;

  /** The server's `reason` for a refusal, as the sentence the member reads. */
  function refusalText(
    reason:
      | string
      | undefined,
  ): string {
    switch (
      reason
    ) {
      case 'TOO_SOON':
        return t(
          'error-too-soon',
          {
            defaultValue:
              'Pick a time at least 15 minutes from now.',
          },
        );
      case 'TOO_FAR':
        return t(
          'error-too-far',
          {
            defaultValue:
              'Pick a time within the next 30 days.',
          },
        );
      case 'HOST_LIMIT':
        return t(
          'error-host-limit',
          {
            defaultValue:
              'You already have 5 upcoming parties.',
          },
        );
      case 'DAILY_LIMIT':
        return t(
          'error-daily-limit',
          {
            defaultValue:
              'You can schedule 5 parties a day. Try again tomorrow.',
          },
        );
      case 'FORBIDDEN':
        return t(
          'error-forbidden',
          {
            defaultValue:
              'Only the host can change this party.',
          },
        );
      case 'CLOSED':
        return t(
          'error-closed',
          {
            defaultValue:
              'This party is closed.',
          },
        );
      default:
        return t(
          'error-generic',
          {
            defaultValue:
              'Could not save the party. Try again.',
          },
        );
    }
  }

  async function save() {
    if (
      !canSave ||
      !when
    )
      return;
    setSaving(
      true,
    );
    setError(
      null,
    );
    try {
      const startsAtIso =
        when.toISOString();
      const result =
        party
          ? await api(
              updatePartyApi,
              {
                params:
                  {
                    roomId:
                      party.roomId,
                  },
                body: {
                  name: name.trim(),
                  description:
                    description.trim(),
                  ...(startsAtIso !==
                  party.scheduledFor
                    ? {
                        startsAt:
                          startsAtIso,
                      }
                    : {}),
                },
              },
            )
          : await api(
              schedulePartyApi,
              {
                body: {
                  name: name.trim(),
                  ...(description.trim()
                    ? {
                        description:
                          description.trim(),
                      }
                    : {}),
                  startsAt:
                    startsAtIso,
                  isPublic,
                  maxMembers:
                    members,
                  ...(firstVideoUrl.trim()
                    ? {
                        firstVideoUrl:
                          firstVideoUrl.trim(),
                      }
                    : {}),
                },
              },
            );
      toast.success(
        editing
          ? t(
              'saved',
              {
                defaultValue:
                  'Party updated',
              },
            )
          : t(
              'scheduled',
              {
                defaultValue:
                  'Party scheduled',
              },
            ),
      );
      onSaved(
        result.party,
      );
      onOpenChange(
        false,
      );
    } catch (err) {
      setError(
        refusalText(
          errorField<string>(
            err,
            'reason',
          ),
        ),
      );
    } finally {
      setSaving(
        false,
      );
    }
  }

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
            onOpenChange
          }
        >
          <DialogContent
            container={
              host
            }
            className="max-w-md"
          >
            <DialogHeader>
              <DialogTitle>
                {editing
                  ? t(
                      'edit-title',
                      {
                        defaultValue:
                          'Edit party',
                      },
                    )
                  : t(
                      'schedule-title',
                      {
                        defaultValue:
                          'Schedule a party',
                      },
                    )}
              </DialogTitle>
              <DialogDescription>
                {t(
                  'schedule-description',
                  {
                    defaultValue:
                      'Pick a time. People who say they are going get a reminder.',
                  },
                )}
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(
                e,
              ) => {
                e.preventDefault();
                void save();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="party-name">
                  {t(
                    'field-name',
                    {
                      defaultValue:
                        'Name',
                    },
                  )}
                </Label>
                <Input
                  id="party-name"
                  value={
                    name
                  }
                  maxLength={
                    PARTY_NAME_MAX
                  }
                  onChange={(
                    e,
                  ) =>
                    setName(
                      e
                        .target
                        .value,
                    )
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="party-description">
                  {t(
                    'field-description',
                    {
                      defaultValue:
                        'Description',
                    },
                  )}
                </Label>
                <Textarea
                  id="party-description"
                  value={
                    description
                  }
                  maxLength={
                    PARTY_DESCRIPTION_MAX
                  }
                  rows={
                    3
                  }
                  onChange={(
                    e,
                  ) =>
                    setDescription(
                      e
                        .target
                        .value,
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="party-when">
                  {t(
                    'field-when',
                    {
                      defaultValue:
                        'Date and time',
                    },
                  )}
                </Label>
                <Input
                  id="party-when"
                  type="datetime-local"
                  value={
                    startsAt
                  }
                  onChange={(
                    e,
                  ) =>
                    setStartsAt(
                      e
                        .target
                        .value,
                    )
                  }
                  required
                />
                <p className="text-xs text-app-text-muted">
                  {t(
                    'field-when-hint',
                    {
                      defaultValue:
                        'In your time zone, from 15 minutes to 30 days ahead.',
                    },
                  )}
                </p>
              </div>
              {!editing && (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="party-public">
                      {t(
                        'field-public',
                        {
                          defaultValue:
                            'List it publicly',
                        },
                      )}
                    </Label>
                    <Switch
                      id="party-public"
                      checked={
                        isPublic
                      }
                      onCheckedChange={
                        setIsPublic
                      }
                      aria-label={t(
                        'field-public',
                        {
                          defaultValue:
                            'List it publicly',
                        },
                      )}
                    />
                  </div>
                  <p className="text-xs text-app-text-muted">
                    {isPublic
                      ? t(
                          'public-hint',
                          {
                            defaultValue:
                              'Shown in Upcoming parties for everyone.',
                          },
                        )
                      : t(
                          'private-hint',
                          {
                            defaultValue:
                              'Only people with the link can find it.',
                          },
                        )}
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="party-max">
                      {t(
                        'field-max',
                        {
                          defaultValue:
                            'Max members',
                        },
                      )}
                    </Label>
                    <Input
                      id="party-max"
                      type="number"
                      inputMode="numeric"
                      min={
                        2
                      }
                      max={
                        ABSOLUTE_MAX_MEMBERS
                      }
                      value={
                        maxMembers
                      }
                      onChange={(
                        e,
                      ) =>
                        setMaxMembers(
                          e
                            .target
                            .value,
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="party-video">
                      {t(
                        'field-video',
                        {
                          defaultValue:
                            'First video (optional)',
                        },
                      )}
                    </Label>
                    <Input
                      id="party-video"
                      type="url"
                      value={
                        firstVideoUrl
                      }
                      placeholder="https://"
                      onChange={(
                        e,
                      ) =>
                        setFirstVideoUrl(
                          e
                            .target
                            .value,
                        )
                      }
                    />
                  </div>
                </>
              )}
              {error && (
                <p
                  role="alert"
                  className="text-sm text-app-danger"
                >
                  {
                    error
                  }
                </p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="default"
                  onClick={() =>
                    onOpenChange(
                      false,
                    )
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
                <Button
                  type="submit"
                  variant="primary"
                  disabled={
                    !canSave
                  }
                >
                  {editing
                    ? t(
                        'save',
                        {
                          defaultValue:
                            'Save',
                        },
                      )
                    : t(
                        'schedule',
                        {
                          defaultValue:
                            'Schedule',
                        },
                      )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/**
 * The landing's "Schedule a party" button with its dialog. After saving it opens the new party's page, where
 * the host can copy the link.
 */
export function ScheduleButton({
  className,
}: {
  className?: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'watch-parties',
    );
  const router =
    useRouter();
  const queryClient =
    useQueryClient();
  const [
    open,
    setOpen,
  ] =
    useState(
      false,
    );
  return (
    <>
      <button
        type="button"
        onClick={() =>
          setOpen(
            true,
          )
        }
        className={
          className
        }
      >
        {t(
          'schedule-party',
          {
            defaultValue:
              'Schedule a party',
          },
        )}
      </button>
      {open && (
        <ScheduleDialog
          open
          onOpenChange={
            setOpen
          }
          onSaved={(
            party,
          ) => {
            void queryClient.invalidateQueries(
              {
                queryKey:
                  [
                    '/api/rmhtube/parties',
                  ],
              },
            );
            void router.navigate(
              {
                to: '/rmhtube/party/$roomId',
                params:
                  {
                    roomId:
                      party.roomId,
                  },
              },
            );
          }}
        />
      )}
    </>
  );
}
