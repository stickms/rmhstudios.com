/**
 * PartyPage — one scheduled watch party: name, host, the time in the viewer's zone, who is going, Going,
 * Add to calendar, Copy link and Join room (open from 15 minutes before). The host also gets Edit and Cancel.
 * The relative time is computed when the page renders; nothing ticks.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, Check, Link2, Users } from 'lucide-react';
import { toast } from '@/lib/shared/app-toast';
import { api, apiQuery, errorField } from '@/lib/contract/client';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useArrival } from '@/components/ui/arrive';
import RmhTubeHeader from '@/components/rmhtube/RmhTubeHeader';
import {
  cancelPartyApi,
  getPartyApi,
  goingApi,
  notGoingApi,
  partyIcsPath,
  type PartyDTO,
} from '@/lib/rmhtube/parties.contract';
import { canJoin, partyPath } from '@/lib/rmhtube/parties';
import ScheduleDialog from './ScheduleDialog';
import SubscribeButton from './SubscribeButton';
import { formatPartyTime, formatRelativeStart } from './party-format';

export default function PartyPage() {
  const { t, i18n } = useTranslation('watch-parties');
  const { roomId } = useParams({
    from: '/rmhtube/party/$roomId',
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const query = useQuery(
    apiQuery(getPartyApi, {
      params: {
        roomId,
      },
    }),
  );
  const arrive = useArrival(query.isSuccess);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const party = query.data?.party;

  const setParty = (next: PartyDTO) =>
    queryClient.setQueryData(
      apiQuery(getPartyApi, {
        params: {
          roomId,
        },
      }).queryKey,
      {
        party: next,
      },
    );

  async function toggleGoing(p: PartyDTO) {
    setBusy(true);
    try {
      const res = await api(p.viewerGoing ? notGoingApi : goingApi, {
        params: {
          roomId,
        },
      });
      setParty(res.party);
      void queryClient.invalidateQueries({
        queryKey: ['/api/rmhtube/parties'],
      });
    } catch (err) {
      toast.error(
        errorField<string>(err, 'reason') === 'CLOSED'
          ? t('error-closed', {
              defaultValue: 'This party is closed.',
            })
          : t('error-going', {
              defaultValue: 'Could not update your answer. Try again.',
            }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${partyPath(roomId)}`);
      toast.success(
        t('link-copied', {
          defaultValue: 'Link copied',
        }),
      );
    } catch {
      toast.error(
        t('link-copy-failed', {
          defaultValue: 'Could not copy the link',
        }),
      );
    }
  }

  async function cancel() {
    const ok = await confirm({
      title: t('cancel-title', {
        defaultValue: 'Cancel this party?',
      }),
      description: t('cancel-confirm', {
        defaultValue: 'Everyone going is told, and the room closes.',
      }),
      confirmLabel: t('cancel-party', {
        defaultValue: 'Cancel party',
      }),
      cancelLabel: t('keep-party', {
        defaultValue: 'Keep it',
      }),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(cancelPartyApi, {
        params: {
          roomId,
        },
      });
      toast.success(
        t('cancelled', {
          defaultValue: 'Party cancelled',
        }),
      );
      void queryClient.invalidateQueries({
        queryKey: ['/api/rmhtube/parties'],
      });
      await navigate({
        to: '/rmhtube',
      });
    } catch {
      toast.error(
        t('error-generic', {
          defaultValue: 'Could not save the party. Try again.',
        }),
      );
      setBusy(false);
    }
  }

  const nowMs = Date.now();
  const joinable = party ? !party.closed && canJoin(Date.parse(party.scheduledFor), nowMs) : false;

  return (
    <div className="app-page">
      <div className="border-b border-app-border">
        <RmhTubeHeader
          backLabel={t('back', {
            defaultValue: 'RMHTube',
          })}
          backHref="/rmhtube"
        />
      </div>
      <div className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-2xl">
          {query.isPending && (
            <p className="py-8 text-sm text-app-text-muted" role="status">
              {t('loading-party', {
                defaultValue: 'Loading party',
              })}
            </p>
          )}
          {query.isError && (
            <div className="py-8">
              <h1 className="mb-2 text-xl font-semibold">
                {t('not-found-title', {
                  defaultValue: 'Party not found',
                })}
              </h1>
              <p className="mb-4 text-sm text-app-text-muted">
                {t('not-found-body', {
                  defaultValue: 'The link may be wrong, or the party was removed.',
                })}
              </p>
              <Link to="/rmhtube" className="text-sm underline">
                {t('back-landing', {
                  defaultValue: 'Back to RMHTube',
                })}
              </Link>
            </div>
          )}
          {party && (
            <article className={arrive}>
              <h1 className="mb-1 text-2xl font-semibold">{party.name}</h1>
              <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-sm text-app-text-muted">
                  {t('hosted-by', {
                    defaultValue: 'Hosted by {{name}}',
                    name: party.host.name ?? '',
                  })}
                </p>
                <SubscribeButton hostId={party.host.id} hostName={party.host.name} isSelf={party.viewerIsHost} />
              </div>
              <p className="text-base text-app-text">
                <time dateTime={party.scheduledFor}>{formatPartyTime(party.scheduledFor, i18n.language)}</time>
              </p>
              <p className="mb-4 text-sm text-app-text-muted">
                {party.closed
                  ? t('closed-note', {
                      defaultValue: 'This party is closed.',
                    })
                  : formatRelativeStart(party.scheduledFor, nowMs, i18n.language)}
              </p>
              {party.description && (
                <p dir="auto" className="mb-4 whitespace-pre-wrap text-sm text-app-text">
                  {party.description}
                </p>
              )}
              <div className="mb-6 flex items-center gap-3 border-y border-app-border py-3">
                <Users className="h-4 w-4 text-app-text-muted" aria-hidden />
                <span className="text-sm">
                  {t('going-count', {
                    defaultValue: '{{count}} going',
                    count: party.goingCount,
                  })}
                </span>
                <ul
                  className="flex -space-x-1"
                  aria-label={t('going-avatars', {
                    defaultValue: 'Some of the people going',
                  })}
                >
                  {party.firstGoing.map((g) => (
                    <li key={g.id}>
                      <UserAvatar src={g.image} alt={g.name ?? ''} size={24} fallbackName={g.name ?? undefined} />
                    </li>
                  ))}
                </ul>
              </div>
              {!party.closed && (
                <div className="flex flex-wrap gap-2">
                  {joinable ? (
                    <>
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() =>
                          void navigate({
                            to: '/rmhtube/$roomId',
                            params: {
                              roomId,
                            },
                          })
                        }
                      >
                        {t('join-room', {
                          defaultValue: 'Join room',
                        })}
                      </Button>
                      <Button
                        type="button"
                        aria-pressed={party.viewerGoing}
                        disabled={busy}
                        onClick={() => void toggleGoing(party)}
                      >
                        {party.viewerGoing && <Check aria-hidden />}
                        {t('going', {
                          defaultValue: 'Going',
                        })}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="primary"
                        aria-pressed={party.viewerGoing}
                        disabled={busy}
                        onClick={() => void toggleGoing(party)}
                      >
                        {party.viewerGoing && <Check aria-hidden />}
                        {t('going', {
                          defaultValue: 'Going',
                        })}
                      </Button>
                      <Button
                        type="button"
                        disabled
                        title={t('join-opens', {
                          defaultValue: 'Opens 15 minutes before the start',
                        })}
                      >
                        {t('join-room', {
                          defaultValue: 'Join room',
                        })}
                      </Button>
                    </>
                  )}
                  <Button asChild>
                    <a href={partyIcsPath(roomId)} download>
                      <CalendarPlus aria-hidden />
                      {t('add-calendar', {
                        defaultValue: 'Add to calendar',
                      })}
                    </a>
                  </Button>
                  <Button type="button" onClick={() => void copyLink()}>
                    <Link2 aria-hidden />
                    {t('copy-link', {
                      defaultValue: 'Copy link',
                    })}
                  </Button>
                </div>
              )}
              {party.viewerIsHost && !party.closed && (
                <div className="mt-6 flex flex-wrap gap-2 border-t border-app-border pt-4">
                  <Button type="button" onClick={() => setEditing(true)}>
                    {t('edit', {
                      defaultValue: 'Edit',
                    })}
                  </Button>
                  <Button type="button" variant="danger" disabled={busy} onClick={() => void cancel()}>
                    {t('cancel-party', {
                      defaultValue: 'Cancel party',
                    })}
                  </Button>
                  <ScheduleDialog
                    key={party.scheduledFor + party.name + (party.description ?? '')}
                    open={editing}
                    onOpenChange={setEditing}
                    party={party}
                    onSaved={setParty}
                  />
                </div>
              )}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
