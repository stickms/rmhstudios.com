/**
 * The objective HUD by mode (HudObjectiveStatus and friends): the round timer
 * top centre (team-coloured box, progress ring, SETUP / OVERTIME tags), the
 * two King of the Hill clocks, control point icons with capture progress and
 * capper counts, the CTF flag panel with each intelligence's status and the
 * capture score, and the payload track with checkpoints and the cart.
 *
 * Colour is never the only signal: every point carries its number and an
 * accessible description (owner, capping team, progress, locked), flags say
 * their status in words, and the timer's state is a text tag.
 */
'use client';

import { useTranslation } from 'react-i18next';
import {
  formatClock,
  type HudControlPoint,
  type HudFlag,
  type HudMatch,
  type HudPayload,
} from '@/lib/tf2-game/client/hud-state';
import { useHudTexture } from '../hud-textures';
import { useTeamNames } from '../strings';
import { usePanelStyle } from '../use-hud';

export function RoundTimer({ match, team }: { match: HudMatch; team: number }) {
  const { t } = useTranslation('c-tf2-game');
  const timer = match.timer;
  if (!timer || match.mode === 'koth') return null;
  const frac = timer.length > 0 ? Math.max(0, Math.min(1, timer.remaining / timer.length)) : 1;
  const C = 2 * Math.PI * 8;
  return (
    <div className={`tf2g-timer tf2g-team-${team || 0}`} data-urgent={!timer.setup && timer.remaining <= 30} role="timer">
      <div className="tf2g-timer-box">
        <span className="tf2g-timer-value tf2g-shadow">
          {timer.overtime ? t('overtime_short', { defaultValue: 'OT' }) : formatClock(timer.remaining)}
        </span>
        <svg className="tf2g-timer-ring" viewBox="0 0 20 20" aria-hidden="true">
          <circle className="bg" cx="10" cy="10" r="8" />
          <circle
            className="fg"
            cx="10"
            cy="10"
            r="8"
            strokeDasharray={`${C * frac} ${C}`}
            transform="rotate(-90 10 10)"
          />
        </svg>
      </div>
      {timer.setup ? (
        <span className="tf2g-timer-tag" data-kind="setup">
          {t('setup', { defaultValue: 'Setup' })}
        </span>
      ) : timer.overtime ? (
        <span className="tf2g-timer-tag" data-kind="overtime">
          {t('overtime', { defaultValue: 'Overtime' })}
        </span>
      ) : null}
    </div>
  );
}

export function KothClocks({ match }: { match: HudMatch }) {
  const { t } = useTranslation('c-tf2-game');
  const style = usePanelStyle('HudKothTimeStatus');
  const k = match.koth;
  if (!k || !style) return null;
  return (
    <div className="tf2g-panel" style={style} role="timer">
      <div className="tf2g-koth">
        <div
          className="tf2g-koth-clock tf2g-team-3 tf2g-shadow"
          data-active={k.active === 3}
          aria-label={t('koth_blu', { defaultValue: 'BLU clock {{time}}', time: formatClock(k.blue) })}
        >
          {formatClock(k.blue)}
        </div>
        <div
          className="tf2g-koth-clock tf2g-team-2 tf2g-shadow"
          data-active={k.active === 2}
          aria-label={t('koth_red', { defaultValue: 'RED clock {{time}}', time: formatClock(k.red) })}
        >
          {formatClock(k.red)}
        </div>
      </div>
    </div>
  );
}

const TEAM_FILL: Record<number, string> = {
  0: 'rgb(124 124 124)',
  2: 'rgb(184 56 59)',
  3: 'rgb(88 133 162)',
};
const fill = (team: number) => TEAM_FILL[team] ?? TEAM_FILL[0];

function ControlPointIcon({ cp }: { cp: HudControlPoint }) {
  const { t } = useTranslation('c-tf2-game');
  const teams = useTeamNames();
  const owner = cp.owner ? teams[cp.owner] : t('cp_neutral', { defaultValue: 'nobody' });
  let desc = t('cp_aria', { defaultValue: 'Point {{n}}, owned by {{owner}}', n: cp.index + 1, owner });
  if (cp.cappingTeam) {
    desc +=
      '. ' +
      t('cp_aria_capping', {
        defaultValue: '{{team}} capturing, {{pct}}%',
        team: teams[cp.cappingTeam],
        pct: Math.round(cp.progress * 100),
      });
  }
  if (cp.locked) desc += '. ' + t('cp_aria_locked', { defaultValue: 'Locked' });
  if (cp.blocked) desc += '. ' + t('cp_aria_blocked', { defaultValue: 'Blocked' });
  const h = 24 * cp.progress;
  return (
    <li className={`tf2g-cp tf2g-team-${cp.cappingTeam || cp.owner}`} aria-label={desc}>
      <svg viewBox="0 0 28 28" aria-hidden="true">
        <rect x="1" y="1" width="26" height="26" rx="3" fill={fill(cp.owner)} stroke="rgb(0 0 0 / 0.6)" strokeWidth="1.5" />
        {cp.cappingTeam ? <rect x="2" y={26 - h} width="24" height={h} fill={fill(cp.cappingTeam)} opacity="0.95" /> : null}
        {cp.locked ? (
          <g fill="rgb(235 226 202)" opacity="0.9">
            <rect x="9" y="13" width="10" height="8" rx="1" />
            <path d="M11 13v-3a3 3 0 0 1 6 0v3" fill="none" stroke="rgb(235 226 202)" strokeWidth="1.6" />
          </g>
        ) : null}
        {cp.blocked ? <path d="M5 5L23 23M23 5L5 23" stroke="rgb(255 230 120)" strokeWidth="2" /> : null}
      </svg>
      {!cp.locked ? <span className="tf2g-cp-label tf2g-shadow">{cp.index + 1}</span> : null}
      {cp.cappingTeam && cp.cappers > 0 ? (
        <span className="tf2g-cp-cappers">×{cp.cappers}</span>
      ) : null}
      {cp.unlocksIn !== null ? <span className="tf2g-cp-timer tf2g-shadow">{Math.ceil(cp.unlocksIn)}</span> : null}
    </li>
  );
}

export function ControlPoints({ points }: { points: HudControlPoint[] }) {
  const { t } = useTranslation('c-tf2-game');
  if (points.length === 0) return null;
  return (
    <ul className="tf2g-cps" aria-label={t('cps_aria', { defaultValue: 'Control points' })}>
      {points.map((cp) => (
        <ControlPointIcon key={cp.index} cp={cp} />
      ))}
    </ul>
  );
}

function FlagGlyph({ status }: { status: HudFlag['status'] }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 3v19" stroke="rgb(235 226 202)" strokeWidth="2" />
      <path d="M6 4h12l-3 4 3 4H6z" fill="rgb(235 226 202)" opacity={status === 'home' ? 1 : 0.55} />
      {status === 'stolen' ? <path d="M14 15l5 3-5 3z" fill="rgb(255 230 120)" /> : null}
      {status === 'dropped' ? <path d="M13 21h9" stroke="rgb(255 230 120)" strokeWidth="2.4" /> : null}
    </svg>
  );
}

export function FlagPanel({ match, localTeam }: { match: HudMatch; localTeam: number }) {
  const { t } = useTranslation('c-tf2-game');
  if (match.mode !== 'ctf' || match.flags.length === 0) return null;
  const statusText = (f: HudFlag) =>
    f.status === 'home'
      ? t('flag_home', { defaultValue: 'At base' })
      : f.status === 'stolen'
        ? t('flag_taken', { defaultValue: 'Taken by {{name}}', name: f.carrierName })
        : f.returnsIn !== null
          ? t('flag_dropped_returns', { defaultValue: 'Dropped, returns in {{s}}', s: Math.ceil(f.returnsIn) })
          : t('flag_dropped', { defaultValue: 'Dropped' });
  // BLU's panel on the left, RED's on the right, as the game draws them.
  const blu = match.flags.find((f) => f.team === 3);
  const red = match.flags.find((f) => f.team === 2);
  const carried = match.flags.find((f) => f.carriedByLocal);
  const panel = (f: HudFlag | undefined, team: number, score: number) => (
    <div className={`tf2g-flag tf2g-team-${team}`}>
      <span className="tf2g-flag-score tf2g-shadow">{score}</span>
      {f ? (
        <>
          <FlagGlyph status={f.status} />
          <span className="tf2g-flag-status">{statusText(f)}</span>
        </>
      ) : null}
    </div>
  );
  return (
    <>
      {carried ? (
        <div className="tf2g-flag-carried tf2g-shadow" role="status">
          {t('flag_you_have', { defaultValue: 'You have the enemy intelligence!' })}
        </div>
      ) : null}
      <div className="tf2g-flags" role="status" data-local-team={localTeam}>
        {panel(blu, 3, match.blueFlagCaps)}
        <div className="tf2g-flag-to">
          {t('flag_playing_to', { defaultValue: 'Playing to {{n}}', n: match.flagCapLimit })}
        </div>
        {panel(red, 2, match.redFlagCaps)}
      </div>
    </>
  );
}

function PayloadTrack({ p }: { p: HudPayload }) {
  const { t } = useTranslation('c-tf2-game');
  const cart = useHudTexture(p.team === 2 ? 'materials/hud/cart_red' : 'materials/hud/cart_blue');
  const pct = Math.round(p.progress * 100);
  return (
    <div
      className={`tf2g-payload tf2g-team-${p.team}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={t('payload_aria', {
        defaultValue: 'Payload {{pct}}% of the way, {{n}} pushing',
        pct,
        n: p.pushers,
      })}
    >
      <div className="tf2g-payload-track">
        <div className="tf2g-payload-done" style={{ width: `${pct}%` }} />
      </div>
      {p.checkpoints.map((c, i) => (
        <span
          key={i}
          className="tf2g-payload-point"
          data-captured={c.captured}
          style={{ left: `${c.at * 100}%` }}
          aria-hidden="true"
        />
      ))}
      <div className="tf2g-payload-cart" style={{ left: `${pct}%` }} aria-hidden="true">
        {cart ? (
          <img src={cart} alt="" draggable={false} />
        ) : (
          <svg viewBox="0 0 26 26">
            <rect x="3" y="7" width="20" height="12" rx="2" fill="rgb(235 226 202)" stroke="rgb(0 0 0 / 0.6)" />
            <circle cx="8" cy="21" r="3" fill="rgb(46 43 42)" />
            <circle cx="18" cy="21" r="3" fill="rgb(46 43 42)" />
          </svg>
        )}
        {p.pushers > 0 ? <span className="tf2g-payload-pushers tf2g-shadow">×{p.pushers}</span> : null}
        {p.receding ? <span className="tf2g-payload-pushers">{t('payload_receding', { defaultValue: 'Rolling back' })}</span> : null}
        {p.blocked ? <span className="tf2g-payload-pushers">{t('payload_blocked', { defaultValue: 'Blocked' })}</span> : null}
      </div>
    </div>
  );
}

export function PayloadPanel({ match }: { match: HudMatch }) {
  if (match.payloads.length === 0) return null;
  return (
    <>
      {match.payloads.map((p, i) => (
        <PayloadTrack key={i} p={p} />
      ))}
    </>
  );
}

/** Everything objective-related, composed per mode. */
export default function ObjectiveStatus({ match, team, koth = true }: { match: HudMatch; team: number; koth?: boolean }) {
  const style = usePanelStyle('HudObjectiveStatus');
  if (!style) return null;
  return (
    <>
      <div className="tf2g-panel" style={style}>
        <RoundTimer match={match} team={team} />
        {match.mode === 'pl' ? <PayloadPanel match={match} /> : null}
        {match.mode === 'ctf' ? <FlagPanel match={match} localTeam={team} /> : null}
        {match.mode !== 'pl' && match.mode !== 'ctf' ? <ControlPoints points={match.controlPoints} /> : null}
      </div>
      {koth ? <KothClocks match={match} /> : null}
    </>
  );
}
