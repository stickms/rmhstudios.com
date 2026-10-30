/**
 * The CS:GO HUD — an original layout over the shared game canvas, drawn from `HudState.cs`
 * (lib/csgo-game/client/hud.ts) and the shared state (health, scores, kill feed, scoreboard):
 *
 *   - bottom left: health and armour (a helmet mark), the defuse kit or the bomb when carried;
 *   - bottom right: the weapon out, its magazine and reserve, and the inventory's slots;
 *   - top left: money, and "Buy" while buying is open (B opens the buy menu);
 *   - top centre: the score (T – CT), the round clock or the bomb's countdown, the phase;
 *   - top right: the kill feed;
 *   - centre: the round's result, planting / defusing progress, deathmatch respawn;
 *   - a white-out while flashed; the scoreboard while Tab is held.
 *
 * Weapon names are the published short names (`ak47`); no game artwork is drawn here.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HudCs, HudState } from '@/lib/tf2-game/client/hud-state';
import type { HudStore } from '@/lib/tf2-game/client/hud-store';
import { BUY_GROUPS, buyCatalog, type BuyGroupId } from '@/lib/csgo-game/client/buy-catalog';
import { CS_TEAM_CT, CS_TEAM_T, CS_WIN_BOMB_DEFUSED, CS_WIN_TARGET_BOMBED, CS_WIN_TARGET_SAVED } from '@/lib/csgo-game/constants';
import './cs-hud.css';

const clock = (s: number | null): string => {
  if (s === null || !Number.isFinite(s)) return '';
  const t = Math.ceil(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/** Typing in a field (chat, the console) never opens the buy menu. */
const typing = (e: KeyboardEvent): boolean => {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};

export default function CsHud({ state, store }: { state: HudState; store: HudStore }) {
  const { t } = useTranslation('c-tf2-game');
  const cs = state.cs;
  const local = state.local;
  const [buyOpen, setBuyOpen] = useState(false);
  const [scores, setScores] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (e.code === 'KeyB' && !e.repeat) setBuyOpen((o) => !o);
      else if (e.code === 'Escape') setBuyOpen(false);
      else if (e.code === 'Tab') {
        e.preventDefault();
        setScores(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Tab') setScores(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // The menu closes itself when buying closes (buy time over, left the zone, died).
  const canBuy = !!cs?.canBuy;
  useEffect(() => {
    if (!canBuy) setBuyOpen(false);
  }, [canBuy]);

  if (!cs) return null;
  const active = cs.weapons.find((w) => w.active) ?? null;
  const alive = !!local?.alive;
  const tScore = state.match.redScore;
  const ctScore = state.match.blueScore;

  return (
    <div className="csg-hud" data-team={local?.team ?? 0}>
      {cs.flash > 0 ? <div className="csg-flash" style={{ opacity: cs.flash }} aria-hidden /> : null}

      <div className="csg-top">
        <span className="csg-score" data-team="t">{tScore}</span>
        <div className="csg-clock" role="timer" aria-label={t('cs_round_clock', { defaultValue: 'Round time' })}>
          {cs.bomb ? (
            <span className="csg-bomb-clock">{t('cs_bomb_planted', { defaultValue: 'Bomb planted' })}</span>
          ) : (
            <span>{clock(cs.timeLeft)}</span>
          )}
          {cs.phase === 'freeze' ? <small>{t('cs_freeze', { defaultValue: 'Buy period' })}</small> : null}
        </div>
        <span className="csg-score" data-team="ct">{ctScore}</span>
      </div>

      <div className="csg-money">
        <span>${cs.money.toLocaleString()}</span>
        {cs.canBuy ? (
          <button type="button" className="csg-buy-cue" onClick={() => setBuyOpen(true)}>
            {t('cs_buy_open', { defaultValue: 'Buy (B)' })}
          </button>
        ) : null}
      </div>

      <ol className="csg-feed" aria-label={t('cs_killfeed', { defaultValue: 'Kills' })}>
        {state.killfeed.slice(-5).map((k) => (
          <li key={k.id} data-local={k.involvesLocal || undefined}>
            {k.attacker ? <span data-team={teamKey(k.attacker.team)}>{k.attacker.name}</span> : null}
            <span className="csg-feed-weapon">{k.weaponName || k.icon}</span>
            {k.customKill === 1 ? <span className="csg-feed-weapon">{t('cs_headshot', { defaultValue: 'headshot' })}</span> : null}
            <span data-team={teamKey(k.victim.team)}>{k.victim.name}</span>
          </li>
        ))}
      </ol>

      <Center cs={cs} alive={alive} />

      {alive ? (
        <>
          <div className="csg-vitals">
            <span className="csg-health" data-low={(local?.health ?? 0) <= 20 || undefined}>
              <b>{local?.health ?? 0}</b> {t('cs_health', { defaultValue: 'HP' })}
            </span>
            <span className="csg-armor">
              <b>{cs.armor}</b> {cs.helmet ? t('cs_armor_helmet', { defaultValue: 'Armor + helmet' }) : t('cs_armor', { defaultValue: 'Armor' })}
            </span>
            {cs.defuser ? <span className="csg-kit">{t('cs_defuse_kit', { defaultValue: 'Defuse kit' })}</span> : null}
            {cs.hasC4 ? <span className="csg-kit">{t('cs_carrying_bomb', { defaultValue: 'Bomb' })}</span> : null}
          </div>
          <div className="csg-ammo">
            {active ? (
              <>
                <span className="csg-weapon-name">{active.short.toUpperCase()}</span>
                {active.clip >= 0 && active.reserve >= 0 && (active.clip > 0 || active.reserve > 0) ? (
                  <span>
                    <b>{active.clip}</b> / {active.reserve}
                  </span>
                ) : null}
              </>
            ) : null}
            <ol className="csg-slots">
              {cs.weapons.map((w) => (
                <li key={w.slot} data-active={w.active || undefined}>
                  {w.slot + 1} {w.short.toUpperCase()}
                </li>
              ))}
            </ol>
          </div>
        </>
      ) : null}

      {buyOpen && cs.canBuy && local ? (
        <BuyMenu team={local.team} cs={cs} onBuy={(cmd) => store.send({ kind: 'extra', command: 'buy', args: [cmd] })} onClose={() => setBuyOpen(false)} />
      ) : null}
      {scores ? <Scoreboard state={state} /> : null}
    </div>
  );
}

const teamKey = (team: number): string => (team === CS_TEAM_T ? 't' : team === CS_TEAM_CT ? 'ct' : 'none');

function Center({ cs, alive }: { cs: HudCs; alive: boolean }) {
  const { t } = useTranslation('c-tf2-game');
  let line: string | null = null;
  if (cs.phase === 'over' || cs.phase === 'gameover') {
    const side = cs.roundWinner === CS_TEAM_T ? t('cs_side_t', { defaultValue: 'Terrorists' }) : cs.roundWinner === CS_TEAM_CT ? t('cs_side_ct', { defaultValue: 'Counter-Terrorists' }) : '';
    const why =
      cs.winReason === CS_WIN_TARGET_BOMBED
        ? t('cs_why_bombed', { defaultValue: 'The bomb exploded' })
        : cs.winReason === CS_WIN_BOMB_DEFUSED
          ? t('cs_why_defused', { defaultValue: 'The bomb was defused' })
          : cs.winReason === CS_WIN_TARGET_SAVED
            ? t('cs_why_saved', { defaultValue: 'Time ran out' })
            : '';
    line = cs.phase === 'gameover' ? t('cs_match_over', { defaultValue: '{{side}} win the match', side }) : side ? t('cs_round_win', { defaultValue: '{{side}} win', side }) : null;
    if (line && why) line = `${line} · ${why}`;
  } else if (cs.planting) line = t('cs_planting', { defaultValue: 'Planting the bomb…' });
  else if (cs.defusing && cs.bomb?.defuseLeft != null) line = t('cs_defusing', { defaultValue: 'Defusing… {{s}}', s: cs.bomb.defuseLeft.toFixed(1) });
  else if (!alive && cs.respawnIn !== null) line = t('cs_respawn', { defaultValue: 'Respawning in {{s}}', s: Math.ceil(cs.respawnIn) });
  else if (cs.protected) line = t('cs_protected', { defaultValue: 'Spawn protection' });
  return line ? (
    <p className="csg-center" role="status">
      {line}
    </p>
  ) : null;
}

function BuyMenu({ team, cs, onBuy, onClose }: { team: number; cs: HudCs; onBuy: (cmd: string) => void; onClose: () => void }) {
  const { t } = useTranslation('c-tf2-game');
  const catalog = useMemo(() => buyCatalog(team, cs.money), [team, cs.money]);
  const [group, setGroup] = useState<BuyGroupId>('pistols');
  const names: Record<BuyGroupId, string> = {
    pistols: t('cs_buy_pistols', { defaultValue: 'Pistols' }),
    heavy: t('cs_buy_heavy', { defaultValue: 'Heavy' }),
    smgs: t('cs_buy_smgs', { defaultValue: 'SMGs' }),
    rifles: t('cs_buy_rifles', { defaultValue: 'Rifles' }),
    gear: t('cs_buy_gear', { defaultValue: 'Gear' }),
    grenades: t('cs_buy_grenades', { defaultValue: 'Grenades' }),
  };
  return (
    <section className="csg-buy" aria-label={t('cs_buy_title', { defaultValue: 'Buy menu' })}>
      <header>
        <h2>{t('cs_buy_title', { defaultValue: 'Buy menu' })}</h2>
        <span>
          ${cs.money.toLocaleString()} · {t('cs_buy_time', { defaultValue: '{{s}} s left', s: Math.ceil(cs.buyTimeLeft) })}
        </span>
        <button type="button" onClick={onClose} aria-label={t('cs_buy_close', { defaultValue: 'Close the buy menu' })}>
          ×
        </button>
      </header>
      <nav className="csg-buy-groups" aria-label={t('cs_buy_groups', { defaultValue: 'Categories' })}>
        {BUY_GROUPS.map((g) => (
          <button key={g} type="button" aria-pressed={g === group} onClick={() => setGroup(g)}>
            {names[g]}
          </button>
        ))}
      </nav>
      <ul className="csg-buy-items">
        {catalog[group].map((item) => (
          <li key={item.command}>
            <button type="button" disabled={!item.affordable} onClick={() => onBuy(item.command)}>
              <span>{item.label.toUpperCase()}</span>
              <span>${item.price.toLocaleString()}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Scoreboard({ state }: { state: HudState }) {
  const { t } = useTranslation('c-tf2-game');
  const sides = [
    { team: CS_TEAM_CT, name: t('cs_side_ct', { defaultValue: 'Counter-Terrorists' }), score: state.match.blueScore },
    { team: CS_TEAM_T, name: t('cs_side_t', { defaultValue: 'Terrorists' }), score: state.match.redScore },
  ];
  return (
    <section className="csg-scores" aria-label={t('cs_scoreboard', { defaultValue: 'Scoreboard' })}>
      {sides.map((side) => (
        <section key={side.team} data-team={teamKey(side.team)}>
          <h2>
            {side.name} <b>{side.score}</b>
          </h2>
          <table>
            <thead>
              <tr>
                <th scope="col">{t('cs_col_player', { defaultValue: 'Player' })}</th>
                <th scope="col">{t('cs_col_kills', { defaultValue: 'K' })}</th>
                <th scope="col">{t('cs_col_assists', { defaultValue: 'A' })}</th>
                <th scope="col">{t('cs_col_deaths', { defaultValue: 'D' })}</th>
                <th scope="col">{t('cs_col_score', { defaultValue: 'Score' })}</th>
                <th scope="col">{t('cs_col_ping', { defaultValue: 'Ping' })}</th>
              </tr>
            </thead>
            <tbody>
              {state.scoreboard
                .filter((r) => r.team === side.team)
                .sort((a, b) => b.score - a.score)
                .map((r) => (
                  <tr key={r.id} data-local={r.isLocal || undefined} data-dead={r.dead || undefined}>
                    <td>{r.bot ? t('cs_bot_name', { defaultValue: 'BOT {{name}}', name: r.name }) : r.name}</td>
                    <td>{r.kills}</td>
                    <td>{r.assists}</td>
                    <td>{r.deaths}</td>
                    <td>{r.score}</td>
                    <td>{r.bot ? '' : r.ping}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}
    </section>
  );
}
