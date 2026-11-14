import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ExternalLink, ListVideo, Pause, Play, Pin } from 'lucide-react';
import type { ElectionEvent, FollowMode } from '@/lib/elections/events';
import {
  FOLLOW_MODES,
  type Pane,
  type RacePane,
  type StreamPane,
} from '@/lib/elections/room-config';
import { parseEmbed } from '@/lib/elections/streams';
import { useLiveStreams } from '../useLiveStreams';
import { buildStateViews, emptyView } from '@/lib/elections/map-model';
import { STATE_CODES, STATE_NAMES } from '@/lib/elections/states';
import { OFFICES, OFFICE_NAME, type ElectionSnapshot, type Office } from '@/lib/elections/types';
import { RaceCard } from '../RaceCard';
import { NewsWire } from '../NewsWire';
import { TileGrid, type TileCell } from '../TileGrid';
import { ElectionChat } from '../ElectionChat';
import { VoteChart } from './VoteChart';
import { useFollow } from './useFollow';
import type { ChatMessage } from '@/lib/elections/chat';
import type { ReactionBurst, StreamStatus } from '../useRoomStream';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

export interface PaneContext {
  /** The `?cycle=` value for API calls. */
  cycle: string;
  snapshot: ElectionSnapshot | undefined;
  events: ElectionEvent[];
  live: boolean;
  /** Shared "selected state" (set by map panes and event clicks; read by race/graph/wire panes with no pin). */
  selectedState: string | null;
  setSelectedState: (s: string | null) => void;
  room: string | null;
  canModerate: boolean;
  chat: { messages: ChatMessage[]; status: StreamStatus; reactions: ReactionBurst[] };
  /** Whether this viewer may change the pane's settings. */
  canEdit: boolean;
  onChange: (pane: Pane) => void;
}

const FOLLOW_LABEL: Record<FollowMode, [string, string]> = {
  off: ['follow.off', 'Pinned'],
  major: ['follow.major', 'Follow major calls'],
  calls: ['follow.calls', 'Follow every call'],
  closings: ['follow.closings', 'Follow polls closing'],
  all: ['follow.all', 'Follow everything'],
};

/* ── stream ───────────────────────────────────────────────────────────── */
/**
 * A stream pane is the video and nothing else. Until something is chosen it shows the picker (live
 * newsrooms, a link box); once a stream is chosen the picker folds into a small overlay button that opens a
 * dropdown, so the video gets the whole pane instead of being squeezed by controls it no longer needs.
 */
export function StreamBody({ pane, ctx }: { pane: StreamPane; ctx: PaneContext }) {
  const { t } = useTranslation('c-elections');
  const [draft, setDraft] = useState(pane.url);
  const [bad, setBad] = useState(false);
  const [open, setOpen] = useState(false);
  const live = useLiveStreams();
  const [armed, setArmed] = useState(false); // nothing third-party loads until the viewer clicks play
  const wrap = useRef<HTMLDivElement | null>(null);
  const embed = useMemo(() => (pane.url ? parseEmbed(pane.url) : null), [pane.url]);
  const src = embed && typeof location !== 'undefined' ? embed.src(location.hostname) : null;

  // The dropdown closes on Escape and on any press outside it.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc, true);
    };
  }, [open]);

  const choose = (url: string) => {
    setDraft(url);
    setBad(false);
    setArmed(true);
    setOpen(false);
    ctx.onChange({ ...pane, url });
  };

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || parseEmbed(draft.trim())) choose(draft.trim());
    else setBad(true);
  };

  const picker = ctx.canEdit ? (
    <div className="el-streampick">
      {live.length ? (
        <div className="el-pick-row" role="group" aria-label={t('watch.live', { defaultValue: 'Live now' })} style={{ margin: 0 }}>
          {live.map((s) => (
            <button
              key={s.url}
              type="button"
              className="el-btn el-btn--sm"
              aria-pressed={pane.url === s.url}
              onClick={() => choose(s.url)}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
      <form onSubmit={go} className="el-pick-row" style={{ flexWrap: 'nowrap', margin: 0 }}>
        <label className="el-sr" htmlFor={`stream-${pane.id}`}>
          {t('watch.label', { defaultValue: 'Stream link' })}
        </label>
        <input
          id={`stream-${pane.id}`}
          className="el-input"
          inputMode="url"
          value={draft}
          aria-invalid={bad}
          placeholder={t('watch.ph', { defaultValue: 'youtube.com/watch?v=… or twitch.tv/…' })}
          onChange={(e) => setDraft(e.target.value)}
          style={{ flex: 1, minWidth: 0, minHeight: 36 }}
        />
        <button type="submit" className="el-btn el-btn--sm el-btn--pink">
          {t('watch.go', { defaultValue: 'Watch' })}
        </button>
      </form>
      {bad ? (
        <p className="el-eyebrow" role="alert" style={{ margin: 0 }}>
          {t('watch.bad', { defaultValue: 'That is not a YouTube or Twitch link we can embed.' })}
        </p>
      ) : null}
    </div>
  ) : null;

  if (!src || !embed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 8, overflowY: 'auto' }}>
        <p className="el-eyebrow" style={{ margin: 0 }}>
          {t('stream.empty', {
            defaultValue: 'Paste a YouTube or Twitch link. Nothing loads until you press play.',
          })}
        </p>
        {picker}
      </div>
    );
  }

  return (
    <div ref={wrap} className="el-streamframe">
      {armed ? (
        <iframe
          title={t('watch.frame', { defaultValue: 'Live stream: {{label}}', label: embed.label })}
          src={src}
          className="el-streamframe__video"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        />
      ) : (
        <button type="button" className="el-btn el-btn--pink el-streamframe__video" onClick={() => setArmed(true)}>
          <Play size={18} aria-hidden /> {t('stream.play', { defaultValue: 'Play {{site}}', site: embed.label })}
        </button>
      )}
      <button
        type="button"
        className="el-btn el-btn--sm el-streamframe__menu"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={t('stream.change', { defaultValue: 'Change stream' })}
        title={t('stream.change', { defaultValue: 'Change stream' })}
        onClick={() => setOpen((v) => !v)}
      >
        <ListVideo size={14} aria-hidden />
        <ChevronDown size={12} aria-hidden />
      </button>
      {open ? (
        <div className="el-streamframe__panel el-box" role="group" aria-label={t('stream.change', { defaultValue: 'Change stream' })}>
          {picker}
          <a className="el-eyebrow" href={embed.watchUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={11} aria-hidden /> {t('watch.open', { defaultValue: 'Open on {{site}}', site: embed.label })}
          </a>
        </div>
      ) : null}
    </div>
  );
}

/* ── race + graph (share the follow logic) ────────────────────────────── */
function FollowControls({
  pane,
  ctx,
  followed,
}: {
  pane: RacePane;
  ctx: PaneContext;
  followed: ReturnType<typeof useFollow>;
}) {
  const { t } = useTranslation('c-elections');
  return (
    <div className="el-pick-row" style={{ margin: '0 0 8px' }}>
      {ctx.canEdit ? (
        <>
          <label className="el-sr" htmlFor={`fm-${pane.id}`}>
            {t('follow.mode', { defaultValue: 'Follow mode' })}
          </label>
          <select
            id={`fm-${pane.id}`}
            className="el-input"
            style={{ minHeight: 36, padding: '2px 8px' }}
            value={pane.follow}
            onChange={(e) => ctx.onChange({ ...pane, follow: e.target.value as FollowMode })}
          >
            {FOLLOW_MODES.map((m) => (
              <option key={m} value={m}>
                {t(FOLLOW_LABEL[m][0], { defaultValue: FOLLOW_LABEL[m][1] })}
              </option>
            ))}
          </select>
          <label className="el-sr" htmlFor={`fo-${pane.id}`}>
            {t('follow.office', { defaultValue: 'Office' })}
          </label>
          <select
            id={`fo-${pane.id}`}
            className="el-input"
            style={{ minHeight: 36, padding: '2px 8px' }}
            value={pane.office}
            onChange={(e) => ctx.onChange({ ...pane, office: e.target.value as Office })}
          >
            {OFFICES.map((o) => (
              <option key={o} value={o}>
                {OFFICE_NAME[o]}
              </option>
            ))}
          </select>
          <label className="el-sr" htmlFor={`fs-${pane.id}`}>
            {t('follow.state', { defaultValue: 'State' })}
          </label>
          <select
            id={`fs-${pane.id}`}
            className="el-input"
            style={{ minHeight: 36, padding: '2px 8px' }}
            value={pane.state ?? ''}
            onChange={(e) => ctx.onChange({ ...pane, state: e.target.value || null })}
          >
            <option value="">{t('follow.anyState', { defaultValue: 'Map / best race' })}</option>
            {STATE_CODES.map((s) => (
              <option key={s} value={s}>
                {STATE_NAMES[s]}
              </option>
            ))}
          </select>
        </>
      ) : null}
      {pane.follow !== 'off' ? (
        <button
          type="button"
          className="el-btn el-btn--sm el-btn--ghost"
          aria-pressed={followed.paused}
          onClick={() => followed.setPaused(!followed.paused)}
        >
          {followed.paused ? <Play size={13} aria-hidden /> : <Pause size={13} aria-hidden />}
          {followed.paused
            ? t('follow.resume', { defaultValue: 'Resume' })
            : t('follow.pause', { defaultValue: 'Pause' })}
        </button>
      ) : null}
    </div>
  );
}

export function RaceBody({
  pane,
  ctx,
  graph,
}: {
  pane: RacePane;
  ctx: PaneContext;
  graph: boolean;
}) {
  const { t } = useTranslation('c-elections');
  const races = ctx.snapshot?.races ?? [];
  const followed = useFollow(pane, races, ctx.events, ctx.selectedState);
  const { race } = followed;
  const arrival = useArrival(!!ctx.snapshot);

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <FollowControls pane={pane} ctx={ctx} followed={followed} />
      {followed.following && followed.reason ? (
        <p className="el-eyebrow" style={{ margin: '0 0 8px' }} aria-live="polite">
          <span className="el-chip el-chip--yellow">
            <Pin size={10} aria-hidden style={{ verticalAlign: -1 }} />{' '}
            {t('follow.following', { defaultValue: 'Following' })}
          </span>{' '}
          {followed.reason}
        </p>
      ) : null}
      {!ctx.snapshot ? (
        <div className="el-box el-skel" aria-busy />
      ) : !race ? (
        <p className={cn('el-eyebrow', arrival)}>
          {t('race.none', { defaultValue: 'No race to show here yet.' })}
        </p>
      ) : graph ? (
        <div className={arrival}>
          <h3 className="el-race__label" style={{ marginBottom: 8 }}>
            {race.label}
          </h3>
          <VoteChart race={race} cycle={ctx.cycle} live={ctx.live} />
        </div>
      ) : (
        <div className={arrival}>
          <RaceCard race={race} />
        </div>
      )}
    </div>
  );
}

/* ── map ──────────────────────────────────────────────────────────────── */
export function MapBody({ pane, ctx }: { pane: Extract<Pane, { kind: 'map' }>; ctx: PaneContext }) {
  const { t } = useTranslation('c-elections');
  const snapshot = ctx.snapshot;
  const cells = useMemo(() => {
    const views = buildStateViews(snapshot?.races ?? [], pane.office);
    const out = new Map<string, TileCell>();
    for (const code of STATE_CODES) {
      const v = views.get(code) ?? emptyView(code);
      out.set(code, {
        tone: v.tone,
        caption: v.caption,
        flipped: v.flipped,
        label: `${v.name}: ${v.caption || v.phase}`,
      });
    }
    return out;
  }, [snapshot, pane.office]);
  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      {ctx.canEdit ? (
        <div
          className="el-pick-row"
          role="group"
          aria-label={t('map.office', { defaultValue: 'Office' })}
          style={{ margin: '0 0 8px' }}
        >
          {OFFICES.map((o) => (
            <button
              key={o}
              type="button"
              className="el-btn el-btn--sm"
              aria-pressed={pane.office === o}
              onClick={() => ctx.onChange({ ...pane, office: o })}
            >
              {OFFICE_NAME[o]}
            </button>
          ))}
        </div>
      ) : null}
      <TileGrid
        cells={cells}
        selected={ctx.selectedState}
        onSelect={(p) => ctx.setSelectedState(ctx.selectedState === p ? null : p)}
        ariaLabel={t('map.aria', { defaultValue: 'Map of states. Select a state for its races.' })}
      />
    </div>
  );
}

/* ── wire ─────────────────────────────────────────────────────────────── */
export function WireBody({
  pane,
  ctx,
}: {
  pane: Extract<Pane, { kind: 'wire' }>;
  ctx: PaneContext;
}) {
  const { t } = useTranslation('c-elections');
  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      {ctx.canEdit ? (
        <div className="el-pick-row" style={{ margin: '0 0 8px' }}>
          <label className="el-sr" htmlFor={`ws-${pane.id}`}>
            {t('follow.state', { defaultValue: 'State' })}
          </label>
          <select
            id={`ws-${pane.id}`}
            className="el-input"
            style={{ minHeight: 36, padding: '2px 8px' }}
            value={pane.state ?? ''}
            onChange={(e) => ctx.onChange({ ...pane, state: e.target.value || null })}
          >
            <option value="">
              {t('wire.followMap', { defaultValue: 'Map selection / everywhere' })}
            </option>
            {STATE_CODES.map((s) => (
              <option key={s} value={s}>
                {STATE_NAMES[s]}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <NewsWire state={pane.state ?? ctx.selectedState} live={ctx.live} />
    </div>
  );
}

/* ── events ───────────────────────────────────────────────────────────── */
export function EventsBody({ ctx }: { ctx: PaneContext }) {
  const { t } = useTranslation('c-elections');
  const list = [...ctx.events].reverse().slice(0, 40);
  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      {list.length === 0 ? (
        <p className="el-eyebrow">
          {t('events.empty', {
            defaultValue: 'Calls, flips and polls closing show up here as they happen.',
          })}
        </p>
      ) : (
        <ul
          className="el-desk__list"
          style={{ margin: 0 }}
          aria-live="polite"
          aria-label={t('events.label', { defaultValue: 'Live events' })}
        >
          {list.map((e) => (
            <li key={e.id}>
              <span className="el-eyebrow" style={{ display: 'block' }}>
                <span
                  className={`el-chip ${e.importance >= 3 ? 'el-chip--gop' : e.importance === 2 ? 'el-chip--yellow' : ''}`}
                >
                  {e.kind}
                </span>{' '}
                {new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </span>
              {e.url ? (
                <a href={e.url} target="_blank" rel="noopener noreferrer nofollow">
                  {e.text}
                </a>
              ) : e.state ? (
                <button
                  type="button"
                  className="el-btn el-btn--sm el-btn--ghost"
                  style={{
                    textAlign: 'left',
                    textTransform: 'none',
                    fontStretch: '100%',
                    fontWeight: 700,
                  }}
                  onClick={() => ctx.setSelectedState(e.state ?? null)}
                >
                  {e.text}
                </button>
              ) : (
                e.text
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── chat ─────────────────────────────────────────────────────────────── */
export function ChatBody({ ctx }: { ctx: PaneContext }) {
  return (
    <ElectionChat
      cycle={ctx.cycle}
      room={ctx.room}
      canModerate={ctx.canModerate}
      stream={ctx.chat}
      height="fill"
    />
  );
}
