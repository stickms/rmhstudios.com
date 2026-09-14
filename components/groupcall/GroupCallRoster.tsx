/**
 * The participant list for a group call.
 *
 * This is the component with no 1:1 equivalent, and the mesh is the reason. In a
 * two-person call "connected" is a single fact about the call, so
 * `components/call/CallOverlay.tsx` can state it once in the status line. In a
 * room of eight it is N-1 separate facts — Ana can be reconnecting while nobody
 * else notices anything — so connection trouble is a property of a **row**,
 * never of the call. The same is true of mute, of who is talking, and of who is
 * still ringing. That is what this file renders, and it is the only place in the
 * group UI that knows about `GroupCallPeerStatus` at all.
 *
 * ## Why every row subscribes to the store itself
 *
 * The level meters write twelve times a second (`LEVEL_SAMPLE_MS`), and each
 * write replaces the `GroupCallPeerView` objects whose level moved. A single
 * `useShallow(selectGroupCallPeers)` subscription up here would therefore
 * re-render all nine rows on every tick — `useShallow` compares the array's
 * ELEMENTS, and the elements are precisely the objects that changed.
 *
 * So the list subscribes to the ordered **ids** (strings, and shallow-stable
 * across a level tick) and each row subscribes to the three fields it actually
 * paints. A level tick then re-renders nothing at all, and one peer dropping
 * re-renders one row.
 *
 * ## Why there is no level meter
 *
 * `level` is deliberately not rendered. An amplitude bar per row is the one
 * thing here that genuinely has to repaint at 12Hz, for information the
 * noise-gated `speaking` flag already carries — and eight of them is exactly the
 * "ring of pulsing avatars" the motion rules exist to prevent. Speaking is a
 * boolean with an attack/release gate behind it (`SPEAKING_RELEASE_MS`), so it
 * flips rarely, and it renders as a ring colour plus one spring.
 */

'use client';

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/shallow';
import { m as motion } from 'framer-motion';
import { Crown, MicOff, PhoneOutgoing, SignalLow, SignalZero } from 'lucide-react';
import {
  selectGroupCallPeers,
  selectSelfParticipant,
  useGroupCallStore,
  type GroupCallStore,
} from '@/lib/groupcall/store';
import type { GroupCallPeerStatus } from '@/lib/groupcall/types';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { APPLE_SPRING } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * `list` — one labelled row per person, for the expanded panel and the incoming
 * card. `strip` — overlapped avatars, for the pinned bar, where names would not
 * fit and are carried as screen-reader text instead.
 */
export type GroupCallRosterLayout = 'list' | 'strip';

export interface GroupCallRosterProps {
  layout?: GroupCallRosterLayout;
  /**
   * Render our own row too.
   *
   * Off on the incoming card: we are not in the room yet, and the server has not
   * put us on the roster, so there would be nothing honest to draw.
   */
  includeSelf?: boolean;
  /**
   * Drop one person from the list.
   *
   * The incoming card names the caller in its own headline; repeating them as
   * the first roster row underneath reads as a duplicate rather than as state.
   */
  excludeUserId?: string | null;
  /** Rendered above the rows, and only when there is at least one row to head. */
  heading?: ReactNode;
  /** `strip` only: how many avatars before the rest collapse into a "+N" chip. */
  max?: number;
  className?: string;
}

/** Ordered remote ids. A string array, so `useShallow` survives a level tick. */
const selectPeerIds = (state: GroupCallStore): string[] =>
  selectGroupCallPeers(state).map((peer) => peer.participant.userId);

/**
 * The two leg states worth telling the user about.
 *
 * `new`/`connecting` are the normal opening seconds of every leg and saying
 * anything about them would put "connecting" next to seven names each time
 * somebody joins; `closed` means the row is on its way off the roster anyway.
 */
type RosterTrouble = 'reconnecting' | 'failed';

function troubleOf(status: GroupCallPeerStatus): RosterTrouble | null {
  return status === 'reconnecting' || status === 'failed' ? status : null;
}

interface RosterAvatarProps {
  name: string;
  image: string | null;
  size: number;
  speaking: boolean;
  reducedMotion: boolean;
}

/**
 * Avatar plus the speaking indicator.
 *
 * A ring colour swap (transitioned as a box-shadow, which is what a Tailwind
 * ring is) plus a single spring on scale. Nothing loops, nothing samples a
 * frame clock, and nothing writes a custom property to `<html>`. Under reduced
 * motion the scale is pinned and only the ring changes, so the information
 * survives the animation being removed — which is the actual requirement.
 *
 * `alt=""` on purpose: the name is always adjacent (visibly in `list`, as
 * screen-reader text in `strip`), so a named image would read it twice.
 */
function RosterAvatar({ name, image, size, speaking, reducedMotion }: RosterAvatarProps) {
  return (
    <motion.span
      className={cn(
        'relative inline-flex shrink-0 rounded-full ring-2 transition-shadow',
        speaking ? 'ring-site-accent' : 'ring-transparent',
      )}
      animate={{ scale: speaking && !reducedMotion ? 1.06 : 1 }}
      transition={APPLE_SPRING.snappy}
    >
      <UserAvatar src={image} alt="" size={size} fallbackName={name} />
    </motion.span>
  );
}

interface RosterRowProps {
  layout: GroupCallRosterLayout;
  name: string;
  image: string | null;
  host: boolean;
  muted: boolean;
  speaking: boolean;
  /** On the roster but not in the room yet — `joinedAt === null`. */
  ringing: boolean;
  trouble: RosterTrouble | null;
  /** Us. Gets the "You" label and sorts to the top of the list. */
  self: boolean;
  reducedMotion: boolean;
}

/**
 * One person, rendered.
 *
 * Purely presentational so that our own row — which is assembled from
 * `state.muted` and `self.speaking` rather than from a `peers` entry, because we
 * do not hold a peer connection to ourselves — is drawn by exactly the same code
 * as everybody else's.
 */
function RosterRow({
  layout,
  name,
  image,
  host,
  muted,
  speaking,
  ringing,
  trouble,
  self,
  reducedMotion,
}: RosterRowProps) {
  const { t } = useTranslation('c-groupcall');

  const displayName = self ? t('you', { defaultValue: 'You' }) : name;
  const statusLabel = ringing
    ? t('ringing', { defaultValue: 'Ringing…' })
    : trouble === 'failed'
      ? t('peer-failed', { defaultValue: "Can't connect" })
      : trouble === 'reconnecting'
        ? t('reconnecting', { defaultValue: 'Reconnecting…' })
        : null;

  const avatar = (
    <RosterAvatar
      name={name}
      image={image}
      size={layout === 'strip' ? 26 : 32}
      speaking={speaking}
      reducedMotion={reducedMotion}
    />
  );

  const TroubleIcon = trouble === 'failed' ? SignalZero : SignalLow;
  const troubleTone = trouble === 'failed' ? 'text-site-danger' : 'text-site-warning';

  if (layout === 'strip') {
    // One badge, not three: the corner of a 26px avatar holds exactly one glyph,
    // so the states are ranked by how much they change what the user should do.
    const BadgeIcon = trouble ? TroubleIcon : ringing ? PhoneOutgoing : muted ? MicOff : null;
    const badgeTone = trouble ? troubleTone : 'text-site-text-muted';

    return (
      <li className={cn('relative -ms-2 first:ms-0', speaking && 'z-10', ringing && 'opacity-70')}>
        {avatar}
        {BadgeIcon && (
          <span className="glass-fill absolute -bottom-0.5 -end-0.5 inline-flex rounded-full p-0.5">
            <BadgeIcon className={cn('h-2.5 w-2.5', badgeTone)} aria-hidden />
          </span>
        )}
        <span className="sr-only">
          {displayName}
          {statusLabel ? ` — ${statusLabel}` : ''}
          {muted ? ` — ${t('muted', { defaultValue: 'muted' })}` : ''}
          {speaking ? ` — ${t('speaking', { defaultValue: 'Speaking' })}` : ''}
        </span>
      </li>
    );
  }

  return (
    <li
      className={cn(
        'glass-fill flex items-center gap-2.5 rounded-site px-2.5 py-1.5',
        ringing && 'opacity-70',
      )}
    >
      {avatar}
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate text-sm font-medium text-site-text">{displayName}</span>
        {host && (
          <>
            <Crown className="h-3.5 w-3.5 shrink-0 text-site-text-muted" aria-hidden />
            <span className="sr-only">{t('host', { defaultValue: 'Host' })}</span>
          </>
        )}
        {speaking && <span className="sr-only">{t('speaking', { defaultValue: 'Speaking' })}</span>}
      </span>

      <span className="flex shrink-0 items-center gap-1.5 text-xs">
        {muted && (
          <>
            <MicOff className="h-3.5 w-3.5 text-site-text-muted" aria-hidden />
            <span className="sr-only">{t('muted', { defaultValue: 'muted' })}</span>
          </>
        )}
        {statusLabel && (
          <span
            className={cn(
              'inline-flex items-center gap-1',
              trouble ? troubleTone : 'text-site-text-muted',
            )}
          >
            {trouble && <TroubleIcon className="h-3.5 w-3.5" aria-hidden />}
            {statusLabel}
          </span>
        )}
      </span>
    </li>
  );
}

/**
 * One remote row, subscribed field by field.
 *
 * Three scalar/stable-reference selectors rather than one `s.peers[userId]`,
 * because that object is replaced on every level tick and this row must not be.
 * `participant` is safe to read whole: `reconcilePeers` keeps its identity
 * across snapshots that say the same thing.
 */
function PeerRow({
  userId,
  layout,
  reducedMotion,
}: {
  userId: string;
  layout: GroupCallRosterLayout;
  reducedMotion: boolean;
}) {
  const participant = useGroupCallStore((s) => s.peers[userId]?.participant ?? null);
  const status = useGroupCallStore((s) => s.peers[userId]?.status ?? 'new');
  const speaking = useGroupCallStore((s) => s.peers[userId]?.speaking ?? false);

  if (!participant) return null;

  return (
    <RosterRow
      layout={layout}
      name={participant.name}
      image={participant.image}
      host={participant.host}
      muted={participant.muted}
      speaking={speaking}
      ringing={participant.joinedAt === null}
      trouble={troubleOf(status)}
      self={false}
      reducedMotion={reducedMotion}
    />
  );
}

/**
 * The roster.
 *
 * Deliberately **not** an `aria-live` region. A room of eight changes state
 * constantly — mutes, speaking flips, a leg reconnecting — and announcing any of
 * it would make the call unusable with a screen reader. The list is ordinary,
 * navigable content whose every row carries its state as text; the one thing
 * that does announce is the call-level line in `GroupCallOverlay`.
 */
export function GroupCallRoster({
  layout = 'list',
  includeSelf = false,
  excludeUserId = null,
  heading,
  max,
  className,
}: GroupCallRosterProps) {
  const { t } = useTranslation('c-groupcall');
  const reducedMotion = useReducedMotion();

  const peerIds = useGroupCallStore(useShallow(selectPeerIds));
  const selfParticipant = useGroupCallStore(selectSelfParticipant);
  const selfMuted = useGroupCallStore((s) => s.muted);
  const selfSpeaking = useGroupCallStore((s) => s.self.speaking);

  const ids = excludeUserId ? peerIds.filter((id) => id !== excludeUserId) : peerIds;
  // Truncation is a `strip` concern only: the list scrolls, and a "+3" chip in
  // place of three rows that were about to be reachable is worse than scrolling.
  const capped = layout === 'strip' && typeof max === 'number' && ids.length > max;
  const shown = capped && typeof max === 'number' ? ids.slice(0, max) : ids;
  const overflow = ids.length - shown.length;

  const showSelf = includeSelf && selfParticipant !== null;
  if (shown.length === 0 && !showSelf) return null;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {heading}
      <ul
        className={cn(
          layout === 'strip' ? 'flex items-center' : 'flex flex-col gap-1',
          layout === 'list' && 'max-h-64 overflow-y-auto',
        )}
        aria-label={t('roster-label', { defaultValue: 'People in this call' })}
      >
        {showSelf && selfParticipant && (
          <RosterRow
            layout={layout}
            name={selfParticipant.name}
            image={selfParticipant.image}
            host={selfParticipant.host}
            muted={selfMuted}
            speaking={selfSpeaking}
            ringing={false}
            trouble={null}
            self
            reducedMotion={reducedMotion}
          />
        )}
        {shown.map((userId) => (
          <PeerRow key={userId} userId={userId} layout={layout} reducedMotion={reducedMotion} />
        ))}
        {overflow > 0 && (
          <li className="glass-fill -ms-2 inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-full px-1.5 text-[0.65rem] font-semibold text-site-text-muted">
            <span aria-hidden>+{overflow}</span>
            <span className="sr-only">
              {t('more-people', { count: overflow, defaultValue: '{{count}} more' })}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}
