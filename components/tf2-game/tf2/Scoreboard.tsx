/**
 * The scoreboard (held on Tab / Select / the touch scores button): BLU on the
 * left and RED on the right as in the game, each with its round score and a
 * row per player — name, score, class, ping — the local player highlighted,
 * the dead dimmed, and "Dominated" / "Nemesis" tags. Below: the map, and the
 * local player's kills, deaths and assists.
 */
'use client';

import { useTranslation } from 'react-i18next';
import type { HudMatch, HudScoreRow } from '@/lib/tf2-game/client/hud-state';
import { leaderboardClassPath, useHudTexture } from '../hud-textures';
import { useClassNames, useTeamNames } from '../strings';

function ClassIcon({ cls }: { cls: number }) {
  const classNames = useClassNames();
  const src = useHudTexture(leaderboardClassPath(cls));
  if (!cls) return null;
  return src ? (
    <img className="tf2g-score-class" src={src} alt={classNames[cls]} draggable={false} />
  ) : (
    <span>{(classNames[cls] ?? '').slice(0, 3)}</span>
  );
}

function TeamTable({ team, score, rows, showClass }: { team: number; score: number; rows: HudScoreRow[]; showClass: boolean }) {
  const { t } = useTranslation('c-tf2-game');
  const teams = useTeamNames();
  return (
    <section className={`tf2g-team-${team}`} aria-label={teams[team]}>
      <div className="tf2g-scores-team-head">
        <span className="tf2g-shadow">
          {teams[team]}{' '}
          <small>{t('scores_players', { defaultValue: '{{n}} players', n: rows.length })}</small>
        </span>
        <b className="tf2g-shadow">{score}</b>
      </div>
      <table>
        <thead>
          <tr>
            <th scope="col">{t('scores_name', { defaultValue: 'Name' })}</th>
            <th scope="col">{t('scores_score', { defaultValue: 'Score' })}</th>
            <th scope="col">{t('scores_class', { defaultValue: 'Class' })}</th>
            <th scope="col">{t('scores_ping', { defaultValue: 'Ping' })}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-local={r.isLocal} data-dead={r.dead}>
              <td className="name">
                {r.name}
                {r.dominated ? <span className="tf2g-score-tag">{t('scores_dominated', { defaultValue: 'Dominated' })}</span> : null}
                {r.nemesis ? <span className="tf2g-score-tag">{t('scores_nemesis', { defaultValue: 'Nemesis' })}</span> : null}
                {r.dead ? <span className="tf2g-sr">{t('scores_dead', { defaultValue: 'dead' })}</span> : null}
              </td>
              <td>{r.score}</td>
              <td>{showClass || r.isLocal ? <ClassIcon cls={r.cls} /> : null}</td>
              <td>{r.bot ? t('scores_bot', { defaultValue: 'BOT' }) : r.ping}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function Scoreboard({ rows, match, localTeam }: { rows: HudScoreRow[]; match: HudMatch; localTeam: number }) {
  const { t } = useTranslation('c-tf2-game');
  const blu = rows.filter((r) => r.team === 3);
  const red = rows.filter((r) => r.team === 2);
  const me = rows.find((r) => r.isLocal);
  const spectators = rows.filter((r) => r.team < 2);
  return (
    <>
      <div className="tf2g-dim" aria-hidden="true" />
      <div className="tf2g-scores" role="region" aria-label={t('scores_title', { defaultValue: 'Scoreboard' })}>
        <div className="tf2g-scores-head">
          <span className="tf2g-scores-map">{match.map}</span>
        </div>
        <div className="tf2g-scores-teams">
          <TeamTable team={3} score={match.blueScore} rows={blu} showClass={localTeam === 3 || localTeam < 2} />
          <TeamTable team={2} score={match.redScore} rows={red} showClass={localTeam === 2 || localTeam < 2} />
        </div>
        <div className="tf2g-scores-foot">
          {me ? (
            <>
              <span>{t('scores_kills', { defaultValue: 'Kills: {{n}}', n: me.kills })}</span>
              <span>{t('scores_deaths', { defaultValue: 'Deaths: {{n}}', n: me.deaths })}</span>
              <span>{t('scores_assists', { defaultValue: 'Assists: {{n}}', n: me.assists })}</span>
            </>
          ) : null}
          {spectators.length ? (
            <span>
              {t('scores_spectators', { defaultValue: 'Spectators: {{names}}', names: spectators.map((s) => s.name).join(', ') })}
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}
