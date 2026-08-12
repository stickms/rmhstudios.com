'use client';

/**
 * The live profile card — the first thing on `/sohumtracker` and the thing the page
 * is really for: is he on, and what is he doing instead.
 *
 * Modelled on Discord's own user popout, because that is the vocabulary every
 * viewer already reads fluently: a banner, a cut-out avatar with a status dot,
 * the name, and one "activity" panel per thing he is doing. The status colours
 * are Discord's exact four (`STATUS_COLORS`) for the same reason — a green dot
 * has to mean online here or it means nothing anywhere.
 *
 * Status is never colour ALONE: the dot draws Discord's idle crescent and DND
 * bar as real shapes (see `sohumtracker.css`), and every panel is also labelled in
 * words, so nothing here depends on telling red from green.
 */

import {
  Gamepad2,
  Headphones,
  MessageSquare,
  MicOff,
  MonitorPlay,
  Music,
  Radio,
  VolumeX,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatAgo, formatClock, formatDuration, STATUS_COLORS } from '@/lib/sohumtracker/config';
import type { WatchLiveDTO } from '@/lib/sohumtracker/types';
import { agedSeconds, useTicker } from './live';

interface ProfileCardProps {
  live: WatchLiveDTO;
  /** When the server measured the figures, so live counters can age from it. */
  generatedAt: string;
}

export function ProfileCard({ live, generatedAt }: ProfileCardProps) {
  const { t } = useTranslation('r-sohumtracker');
  const now = useTicker();

  const statusLabel = {
    online: t('status-online', { defaultValue: 'Online' }),
    idle: t('status-idle', { defaultValue: 'Idle' }),
    dnd: t('status-dnd', { defaultValue: 'Do Not Disturb' }),
    offline: t('status-offline', { defaultValue: 'Offline' }),
  }[live.status];

  const initial = live.displayName.trim().charAt(0).toUpperCase() || '?';

  // Discord's CDN 404s an avatar hash the moment the avatar changes — it does
  // not redirect — so a cached hash can go dead between the tracker's hourly
  // refresh and the page being loaded. Falling back to the initial keeps a
  // broken-image icon off the top of the page for that window; the key resets
  // the flag when a new hash arrives, so recovery is automatic.
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => setAvatarFailed(false), [live.avatarUrl]);
  const showAvatar = live.avatarUrl !== null && !avatarFailed;

  return (
    <section
      className="stk-profile"
      style={{ '--stk-status-color': STATUS_COLORS[live.status] } as React.CSSProperties}
      aria-label={t('profile-label', { defaultValue: 'Live status' })}
    >
      <div className="stk-profile__banner" />

      <div className="stk-profile__body">
        <div className="stk-profile__avatar-wrap">
          {showAvatar ? (
            <img
              className="stk-profile__avatar"
              src={live.avatarUrl ?? undefined}
              alt=""
              width={76}
              height={76}
              // The card is above the fold and its avatar is the page's only
              // remote image; loading it eagerly is the point of it being here.
              loading="eager"
              decoding="async"
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            <div className="stk-profile__avatar stk-profile__avatar--fallback" aria-hidden>
              {initial}
            </div>
          )}
          {/* The dot is decorative: the same status is stated in words below. */}
          <span className="stk-status-dot" data-status={live.status} aria-hidden />
        </div>

        <div className="stk-profile__ident">
          <h2 className="stk-profile__name">{live.displayName}</h2>
          {live.username ? <p className="stk-profile__handle">@{live.username}</p> : null}
          {live.customStatus ? (
            <p className="stk-bubble">
              {live.customStatus.emoji ? (
                <span className="stk-bubble__emoji" aria-hidden>
                  {live.customStatus.emoji}
                </span>
              ) : null}
              <span className="stk-sr">
                {t('custom-status-label', { defaultValue: 'Custom status:' })}{' '}
              </span>
              {live.customStatus.text}
            </p>
          ) : null}
          <p className="stk-profile__handle" aria-live="polite">
            {statusLabel}
            {live.statusForSec > 60
              ? ` · ${t('status-for', {
                  duration: formatDuration(agedSeconds(live.statusForSec, generatedAt, now)),
                  defaultValue: 'for {{duration}}',
                })}`
              : null}
          </p>
        </div>

        <div className="stk-profile__state">
          {live.voice ? (
            <VoicePanel voice={live.voice} generatedAt={generatedAt} now={now} />
          ) : null}

          {/* Every activity, not just one: Discord stacks them and shows all,
              so a card that renders a single "Playing" line is wrong exactly
              when there is the most to say. */}
          {live.activities.map((activity, index) => (
            <Panel
              // Index in the key, not just type+name. Discord can report two
              // entries that are identical by both — the same title arriving
              // from a launcher and from the game itself is the common one — and
              // a duplicate React key silently DROPS the second panel. That is
              // the one way this list can lose a row that Discord is reporting,
              // and it would look exactly like the tracker having missed it.
              key={`${index}:${activity.type}:${activity.name}`}
              color={ACTIVITY_COLORS[activity.type] ?? 'var(--stk-accent)'}
              icon={activityIcon(activity.type)}
              label={activityLabel(activity.type, t)}
              value={activity.name}
              meta={
                <>
                  {activity.durationSec !== null ? (
                    <span className="stk-live-clock">
                      {formatClock(agedSeconds(activity.durationSec, generatedAt, now))}
                    </span>
                  ) : null}
                  {activity.details ? `${activity.durationSec !== null ? ' · ' : ''}${activity.details}` : null}
                  {activity.state ? ` · ${activity.state}` : null}
                </>
              }
            />
          ))}

          {live.lastMessage ? (
            <Panel
              color="var(--stk-text-faint)"
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

          {!live.voice && live.activities.length === 0 ? (
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
 * Discord's own colour per activity type, so a Spotify row reads as Spotify.
 * Anything unrecognised falls back to blurple rather than going uncoloured.
 */
const ACTIVITY_COLORS: Record<number, string> = {
  0: 'var(--stk-accent)', // playing
  1: 'var(--stk-streaming)', // streaming
  2: '#1db954', // listening — Spotify green, the only place this page borrows a third-party brand colour
  3: 'var(--stk-accent)', // watching
  5: 'var(--stk-accent)', // competing
};

/** The icon for an activity type. */
function activityIcon(type: number) {
  switch (type) {
    case 1:
      return <Radio aria-hidden size={20} />;
    case 2:
      return <Music aria-hidden size={20} />;
    case 3:
      return <MonitorPlay aria-hidden size={20} />;
    default:
      return <Gamepad2 aria-hidden size={20} />;
  }
}

/**
 * Discord's own verb per activity type. Literal `t()` keys per branch, because
 * `i18next-parser` is a static scanner and a lookup table extracts nothing.
 */
function activityLabel(type: number, t: (key: string, opts: { defaultValue: string }) => string) {
  switch (type) {
    case 1:
      return t('panel-streaming', { defaultValue: 'Streaming' });
    case 2:
      return t('panel-listening', { defaultValue: 'Listening to' });
    case 3:
      return t('panel-watching', { defaultValue: 'Watching' });
    case 5:
      return t('panel-competing', { defaultValue: 'Competing in' });
    default:
      return t('panel-playing', { defaultValue: 'Playing' });
  }
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
  const { t } = useTranslation('r-sohumtracker');
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
      className="stk-activity"
      style={{ '--stk-activity-color': 'var(--stk-online)' } as React.CSSProperties}
    >
      <span className="stk-activity__icon">
        {voice.deafened ? (
          <VolumeX aria-hidden size={20} />
        ) : voice.muted ? (
          <MicOff aria-hidden size={20} />
        ) : (
          <Headphones aria-hidden size={20} />
        )}
      </span>
      <span className="stk-activity__text">
        <span className="stk-activity__label">
          <span className="stk-pulse" aria-hidden />
          {t('panel-in-voice', { defaultValue: 'In voice' })}
        </span>
        <span className="stk-activity__value">
          {voice.channelName
            ? `#${voice.channelName}`
            : t('panel-unknown-channel', { defaultValue: 'a channel' })}
        </span>
        {/* aria-live so a screen reader hears the call start, not every tick:
            the region announces when the panel appears, and the polite level
            means the per-second clock never interrupts. */}
        <span className="stk-activity__meta" aria-live="polite">
          <span className="stk-live-clock">{formatClock(elapsed)}</span>
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
      className="stk-activity"
      style={{ '--stk-activity-color': color } as React.CSSProperties}
    >
      <span className="stk-activity__icon">{icon}</span>
      <span className="stk-activity__text">
        <span className="stk-activity__label">{label}</span>
        <span className="stk-activity__value">{value}</span>
        <span className="stk-activity__meta">{meta}</span>
      </span>
    </div>
  );
}
