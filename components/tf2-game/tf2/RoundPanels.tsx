/**
 * Round and life panels: the respawn countdown ("Respawn in: 5 seconds"), the
 * freeze cam's killer card ("You were killed by …", with the killer's health
 * and domination notes), the spectated player's name, the Spy's disguise
 * status, centre messages (game_text, HUD alerts) and the win panel.
 */
'use client';

import { useTranslation } from 'react-i18next';
import type {
  HudCenterMessage,
  HudFreezeCam,
  HudLocalPlayer,
  HudWinPanel,
} from '@/lib/tf2-game/client/hud-state';
import { classPortraitPath, useHudTexture } from '../hud-textures';
import { useClassNames, useTeamNames, useWinReason } from '../strings';
import { usePanelStyle } from '../use-hud';
import { HealthCross } from './HealthPanel';

export function RespawnPanel({
  local,
  freeze,
  srOnly = false,
}: {
  local: HudLocalPlayer;
  freeze: boolean;
  /** A custom HUD's spectator GUI shows these: keep them for screen readers only. */
  srOnly?: boolean;
}) {
  const { t } = useTranslation('c-tf2-game');
  const teams = useTeamNames();
  const classNames = useClassNames();
  if (local.alive || local.team < 2) return null;
  const s = local.respawnIn === null ? null : Math.ceil(local.respawnIn);
  return (
    <>
      <div className={srOnly ? 'sr-only' : 'tf2g-respawn tf2g-shadow'} role="status" aria-live="polite">
        {s === null
          ? t('respawn_wait', { defaultValue: 'Waiting to respawn' })
          : s <= 0
            ? t('respawn_now', { defaultValue: 'Prepare to respawn' })
            : t('respawn_in', {
                count: s,
                defaultValue_one: 'Respawn in: {{count}} second',
                defaultValue: 'Respawn in: {{count}} seconds',
              })}
      </div>
      {local.spectating && !freeze ? (
        <div className={srOnly ? 'sr-only' : `tf2g-spectating tf2g-team-${local.spectating.team} tf2g-shadow`}>
          {t('spectating', {
            defaultValue: 'Spectating {{name}} ({{cls}}, {{team}})',
            name: local.spectating.name,
            cls: classNames[local.spectating.cls] ?? '',
            team: teams[local.spectating.team] ?? '',
          })}
        </div>
      ) : null}
    </>
  );
}

export function FreezeCam({ freeze }: { freeze: HudFreezeCam }) {
  const { t } = useTranslation('c-tf2-game');
  const style = usePanelStyle('FreezePanel');
  const portrait = useHudTexture(freeze.kind === 'player' ? classPortraitPath(freeze.killerCls, freeze.killerTeam) : null);
  if (!style) return null;
  const label =
    freeze.kind === 'suicide'
      ? t('freeze_suicide', { defaultValue: 'You killed yourself' })
      : freeze.kind === 'world'
        ? t('freeze_world', { defaultValue: 'You died' })
        : freeze.kind === 'object'
          ? t('freeze_object', { defaultValue: 'You were killed by the sentry of' })
          : t('freeze_player', { defaultValue: 'You were killed by' });
  return (
    <div className="tf2g-panel" style={style}>
      <div className={`tf2g-freeze tf2g-team-${freeze.killerTeam}`} role="status" aria-live="assertive">
        {portrait ? <img className="tf2g-freeze-img" src={portrait} alt="" draggable={false} /> : null}
        <div className="tf2g-freeze-text">
          <span className="tf2g-freeze-label">{label}</span>
          {freeze.killerName ? <span className="tf2g-freeze-name tf2g-shadow">{freeze.killerName}</span> : null}
          {freeze.dominated ? (
            <span className="tf2g-freeze-note">{t('freeze_dominated', { defaultValue: 'You are being dominated' })}</span>
          ) : null}
          {freeze.revenge ? (
            <span className="tf2g-freeze-note">{t('freeze_revenge', { defaultValue: 'They got revenge' })}</span>
          ) : null}
        </div>
        {freeze.kind === 'player' && freeze.killerMaxHealth > 0 ? (
          <div className="tf2g-freeze-health" aria-label={t('freeze_health', { defaultValue: 'Killer health {{hp}}', hp: freeze.killerHealth })}>
            <HealthCross fraction={freeze.killerHealth / freeze.killerMaxHealth} />
            <span className="tf2g-shadow">{freeze.killerHealth}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function DisguiseStatus({ local }: { local: HudLocalPlayer }) {
  const { t } = useTranslation('c-tf2-game');
  const classNames = useClassNames();
  const teams = useTeamNames();
  const style = usePanelStyle('DisguiseStatus');
  const c = local.conditions;
  if (!style || !local.alive || (!c.disguised && !c.disguising)) return null;
  return (
    <div className="tf2g-panel" style={style}>
      <div className={`tf2g-disguise-status tf2g-team-${c.disguiseTeam || local.team} tf2g-shadow`} role="status">
        {c.disguising && !c.disguised
          ? t('disguising', { defaultValue: 'Disguising…' })
          : t('disguised_as', {
              defaultValue: 'Disguised as: {{team}} {{cls}}',
              team: teams[c.disguiseTeam] ?? '',
              cls: classNames[c.disguiseClass] ?? '',
            })}
      </div>
    </div>
  );
}

export function CenterMessages({ messages }: { messages: HudCenterMessage[] }) {
  const style = usePanelStyle('HudTeamGoal');
  if (!style || messages.length === 0) return null;
  return (
    <div className="tf2g-panel" style={style}>
      <div className="tf2g-center" role="status" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className="tf2g-center-msg tf2g-shadow" data-kind={m.kind}>
            {m.text}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WinPanel({ win }: { win: HudWinPanel }) {
  const { t } = useTranslation('c-tf2-game');
  const teams = useTeamNames();
  const reason = useWinReason();
  const style = usePanelStyle('WinPanel');
  if (!style) return null;
  const title =
    win.team === 2
      ? t('win_red', { defaultValue: 'RED Team Wins!' })
      : win.team === 3
        ? t('win_blu', { defaultValue: 'BLU Team Wins!' })
        : t('win_stalemate', { defaultValue: 'Stalemate!' });
  return (
    <div className="tf2g-panel" style={style}>
      <section className="tf2g-win" role="status" aria-live="polite">
        <div className={`tf2g-win-head tf2g-team-${win.team}`}>
          <div className="tf2g-win-title tf2g-shadow">{title}</div>
          {win.team ? <div className="tf2g-win-reason">{reason(win.reason, teams[win.team] ?? '')}</div> : null}
        </div>
        <div className="tf2g-win-scores">
          <div className="tf2g-win-score tf2g-team-3">
            <span>{teams[3]}</span>
            <b>{win.blueScore}</b>
          </div>
          <div className="tf2g-win-score tf2g-team-2">
            <span>{teams[2]}</span>
            <b>{win.redScore}</b>
          </div>
        </div>
        {win.top.length ? (
          <ol className="tf2g-win-top">
            {win.top.map((p, i) => (
              <li key={i} className={`tf2g-team-${p.team}`}>
                <span className="tf2g-team-text">{p.name}</span>
                <span>{t('win_points', { defaultValue: '{{n}} points', n: p.score })}</span>
              </li>
            ))}
          </ol>
        ) : null}
        {win.nextRoundIn !== null ? (
          <div className="tf2g-win-next tf2g-shadow">
            {t('win_next', { defaultValue: 'Next round in {{s}}', s: Math.ceil(win.nextRoundIn) })}
          </div>
        ) : null}
      </section>
    </div>
  );
}
