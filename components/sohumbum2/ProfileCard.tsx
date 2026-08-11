'use client';

/**
 * The live profile card — the first thing on `/sohumbum2` and the thing the page
 * is really for: is he on, and what is he doing instead.
 *
 * Modelled on Discord's own user popout, because that is the vocabulary every
 * viewer already reads fluently: a banner, a cut-out avatar with a status dot,
 * the name, and one "activity" panel per thing he is doing. The status colours
 * are Discord's exact four (`STATUS_COLORS`) for the same reason — a green dot
 * has to mean online here or it means nothing anywhere.
 *
 * Status is never colour ALONE: the dot draws Discord's idle crescent and DND
 * bar as real shapes (see `sohumbum2.css`), and every panel is also labelled in
 * words, so nothing here depends on telling red from green.
 */

import { Gamepad2, Headphones, MessageSquare, MicOff, Radio, VolumeX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatAgo, formatClock, formatDuration, STATUS_COLORS } from '@/lib/sohumbum2/config';
import type { WatchLiveDTO } from '@/lib/sohumbum2/types';
import { agedSeconds, useTicker } from './live';

interface ProfileCardProps {
  live: WatchLiveDTO;
  /** When the server measured the figures, so live counters can age from it. */
  generatedAt: string;
}

export function ProfileCard({ live, generatedAt }: ProfileCardProps) {
  const { t } = useTranslation('r-sohumbum2');
  const now = useTicker();

  const statusLabel = {
    online: t('status-online', { defaultValue: 'Online' }),
    idle: t('status-idle', { defaultValue: 'Idle' }),
    dnd: t('status-dnd', { defaultValue: 'Do Not Disturb' }),
    offline: t('status-offline', { defaultValue: 'Offline' }),
  }[live.status];

  const initial = live.displayName.trim().charAt(0).toUpperCase() || '?';

  return (
    <section
      className="sb2-profile"
      style={{ '--sb2-status-color': STATUS_COLORS[live.status] } as React.CSSProperties}
      aria-label={t('profile-label', { defaultValue: 'Live status' })}
    >
      <div className="sb2-profile__banner" />

      <div className="sb2-profile__body">
        <div className="sb2-profile__avatar-wrap">
          {live.avatarUrl ? (
            <img
              className="sb2-profile__avatar"
              src={live.avatarUrl}
              alt=""
              width={76}
              height={76}
              // The card is above the fold and its avatar is the page's only
              // remote image; loading it eagerly is the point of it being here.
              loading="eager"
              decoding="async"
            />
          ) : (
            <div className="sb2-profile__avatar sb2-profile__avatar--fallback" aria-hidden>
              {initial}
            </div>
          )}
          {/* The dot is decorative: the same status is stated in words below. */}
          <span className="sb2-status-dot" data-status={live.status} aria-hidden />
        </div>

        <div className="sb2-profile__ident">
          <h2 className="sb2-profile__name">{live.displayName}</h2>
          {live.username ? <p className="sb2-profile__handle">@{live.username}</p> : null}
          <p className="sb2-profile__handle" aria-live="polite">
            {statusLabel}
            {live.statusForSec > 60
              ? ` · ${t('status-for', {
                  duration: formatDuration(agedSeconds(live.statusForSec, generatedAt, now)),
                  defaultValue: 'for {{duration}}',
                })}`
              : null}
          </p>
        </div>

        <div className="sb2-profile__state">
          {live.voice ? (
            <VoicePanel voice={live.voice} generatedAt={generatedAt} now={now} />
          ) : null}

          {live.playing ? (
            <Panel
              color="var(--sb2-accent)"
              icon={<Gamepad2 aria-hidden size={20} />}
              label={t('panel-playing', { defaultValue: 'Playing' })}
              value={live.playing.name}
              meta={
                <>
                  <span className="sb2-live-clock">
                    {formatClock(agedSeconds(live.playing.durationSec, generatedAt, now))}
                  </span>
                  {live.playing.details ? ` · ${live.playing.details}` : null}
                </>
              }
            />
          ) : null}

          {live.lastMessage ? (
            <Panel
              color="var(--sb2-text-faint)"
              icon={<MessageSquare aria-hidden size={20} />}
              label={t('panel-last-message', { defaultValue: 'Last message' })}
              value={
                live.lastMessage.channelName
                  ? `#${live.lastMessage.channelName}`
                  : t('panel-unknown-channel', { defaultValue: 'a channel' })
              }
              meta={formatAgo(agedSeconds(live.lastMessage.agoSec, generatedAt, now))}
            />
          ) : null}

          {!live.voice && !live.playing ? (
            <Panel
              color={STATUS_COLORS[live.status]}
              icon={<Radio aria-hidden size={20} />}
              label={t('panel-doing', { defaultValue: 'Currently' })}
              value={
                live.status === 'offline'
                  ? t('panel-nothing-offline', { defaultValue: 'Not online' })
                  : t('panel-nothing', { defaultValue: 'Nothing observable' })
              }
              meta={
                live.lastSeenAt
                  ? t('panel-last-seen', {
                      ago: formatAgo(
                        agedSeconds(
                          Math.max(0, (Date.parse(generatedAt) - Date.parse(live.lastSeenAt)) / 1000),
                          generatedAt,
                          now,
                        ),
                      ),
                      defaultValue: 'Last seen {{ago}}',
                    })
                  : t('panel-never-seen', { defaultValue: 'Nothing recorded yet' })
              }
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * The voice panel, which is the one that matters.
 *
 * It carries the mute/deafen/stream flags as icons because those are exactly
 * what changes the meaning of "in a call for six hours" — six hours deafened in
 * an empty channel is a different fact from six hours talking to people, and
 * the page has both numbers.
 */
function VoicePanel({
  voice,
  generatedAt,
  now,
}: {
  voice: NonNullable<WatchLiveDTO['voice']>;
  generatedAt: string;
  now: number | null;
}) {
  const { t } = useTranslation('r-sohumbum2');
  const elapsed = agedSeconds(voice.durationSec, generatedAt, now);

  const flags: string[] = [];
  if (voice.muted) flags.push(t('flag-muted', { defaultValue: 'muted' }));
  if (voice.deafened) flags.push(t('flag-deafened', { defaultValue: 'deafened' }));
  if (voice.streaming) flags.push(t('flag-streaming', { defaultValue: 'streaming' }));
  if (voice.video) flags.push(t('flag-video', { defaultValue: 'camera on' }));

  const company =
    voice.peers === 0
      ? t('voice-alone', { defaultValue: 'alone in the channel' })
      : t('voice-with', { count: voice.peers, defaultValue: 'with {{count}} others' });

  return (
    <div
      className="sb2-activity"
      style={{ '--sb2-activity-color': 'var(--sb2-online)' } as React.CSSProperties}
    >
      <span className="sb2-activity__icon">
        {voice.deafened ? (
          <VolumeX aria-hidden size={20} />
        ) : voice.muted ? (
          <MicOff aria-hidden size={20} />
        ) : (
          <Headphones aria-hidden size={20} />
        )}
      </span>
      <span className="sb2-activity__text">
        <span className="sb2-activity__label">
          <span className="sb2-pulse" aria-hidden />
          {t('panel-in-voice', { defaultValue: 'In voice' })}
        </span>
        <span className="sb2-activity__value">
          {voice.channelName
            ? `#${voice.channelName}`
            : t('panel-unknown-channel', { defaultValue: 'a channel' })}
        </span>
        {/* aria-live so a screen reader hears the call start, not every tick:
            the region announces when the panel appears, and the polite level
            means the per-second clock never interrupts. */}
        <span className="sb2-activity__meta" aria-live="polite">
          <span className="sb2-live-clock">{formatClock(elapsed)}</span>
          {` · ${company}`}
          {flags.length > 0 ? ` · ${flags.join(', ')}` : null}
        </span>
      </span>
    </div>
  );
}

function Panel({
  color,
  icon,
  label,
  value,
  meta,
}: {
  color: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  meta: React.ReactNode;
}) {
  return (
    <div
      className="sb2-activity"
      style={{ '--sb2-activity-color': color } as React.CSSProperties}
    >
      <span className="sb2-activity__icon">{icon}</span>
      <span className="sb2-activity__text">
        <span className="sb2-activity__label">{label}</span>
        <span className="sb2-activity__value">{value}</span>
        <span className="sb2-activity__meta">{meta}</span>
      </span>
    </div>
  );
}
