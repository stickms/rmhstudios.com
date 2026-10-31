/**
 * The CS:GO HUD — an original layout over the shared game canvas, drawn from `HudState.cs`
 * (lib/csgo-game/client/hud.ts) and the shared state (health, scores, kill feed, scoreboard):
 *
 *   - bottom left: health and armour (a helmet mark), the defuse kit or the bomb when carried;
 *   - bottom right: the weapon out, its magazine and reserve, and the inventory's slots;
 *   - top left: money, and "Buy" while buying is open (B opens CS:GO's radial buy wheel, which frees
 *     the cursor while it is up, as CS:GO's does; closing it with B or its × captures the pointer again);
 *   - top centre: the score (T – CT), the round clock or the bomb's countdown, the phase;
 *   - top right: the kill feed;
 *   - centre: the round's result, planting / defusing progress, deathmatch respawn;
 *   - a crosshair at the centre;
 *   - a white-out while flashed; the scoreboard while Tab is held.
 *
 * Weapon names are the published short names (`ak47`); no game artwork is drawn here.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HudCs, HudState } from '@/lib/tf2-game/client/hud-state';
import type { HudStore } from '@/lib/tf2-game/client/hud-store';
import type { InputState } from '@/lib/tf2-game/client/input/input-state';
import { BUY_GROUPS, buyCatalog, type BuyEntry, type BuyGroupId } from '@/lib/csgo-game/client/buy-catalog';
import { csWeapon, hasCsWeaponData } from '@/lib/csgo-game/data/weapon-data';
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

export default function CsHud({
  state,
  store,
  input,
  onCapture,
}: {
  state: HudState;
  store: HudStore;
  input?: InputState;
  onCapture?: () => void;
}) {
  const { t } = useTranslation('c-tf2-game');
  const cs = state.cs;
  const local = state.local;
  const [buyOpen, setBuyOpen] = useState(false);
  const [scores, setScores] = useState(false);
  const canBuy = !!cs?.canBuy;
  const shown = buyOpen && canBuy && !!local;
  const live = useRef({ shown, canBuy, onCapture });

  // The menu is clicked: the input layer gives the pointer back while it is up (tf2-client), and
  // a click on the game does not capture it again.
  useEffect(() => {
    live.current = { shown, canBuy, onCapture };
    if (input) input.cursor = shown;
  }, [input, shown, canBuy, onCapture]);
  useEffect(
    () => () => {
      if (input) input.cursor = false;
    },
    [input],
  );

  /** Closed by the player (B, the ×): back to aiming, as the key or click is a gesture that may capture. */
  const closeBuy = useCallback(() => {
    setBuyOpen(false);
    if (input) input.cursor = false;
    live.current.onCapture?.();
  }, [input]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (e.code === 'KeyB' && !e.repeat) {
        // Only opens while buying is open (else it would pop up on its own on entering a buy zone).
        if (live.current.shown) closeBuy();
        else if (live.current.canBuy) setBuyOpen(true);
      } else if (e.code === 'Escape') setBuyOpen(false);
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
  }, [closeBuy]);

  // The menu closes itself when buying closes (buy time over, left the zone, died).
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
      {alive && !scores && !shown ? <span className="csg-crosshair" aria-hidden /> : null}
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
            <span className="csg-feed-weapon">{killWeapon(k.icon)}</span>
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

      {shown && local ? (
        <BuyMenu team={local.team} cs={cs} input={input} onBuy={(cmd) => store.send({ kind: 'extra', command: 'buy', args: [cmd] })} onClose={closeBuy} />
      ) : null}
      {scores ? <Scoreboard state={state} /> : null}
    </div>
  );
}

/** The kill feed's weapon: the event's CS weapon name (`weapon_ak47` → `ak47`), not TF2's item names. */
function killWeapon(name: string): string {
  const info = hasCsWeaponData() ? (csWeapon(name) ?? csWeapon(`weapon_${name}`)) : null;
  return info?.short ?? name.replace(/^weapon_/, '');
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

/**
 * The buy wheel's geometry, in its own viewBox units: a 240-unit square, a ring of wedges between
 * `inner` and `outer`, a constant `gap` between neighbours, and labels on the ring's middle.
 */
const WHEEL = { size: 240, c: 120, outer: 116, inner: 50, gap: 3, label: 84 } as const;
/**
 * CS:GO's category wheel, clockwise from the left. Its number keys follow BUY_GROUPS instead
 * (pistols 1, heavy 2, SMGs 3, rifles 4, gear 5, grenades 6), as CS:GO numbers them.
 */
const WHEEL_ORDER: readonly BuyGroupId[] = ['gear', 'pistols', 'heavy', 'smgs', 'rifles', 'grenades'];

/** A point on the wheel `r` from the centre, `deg` clockwise from the top. */
function polar(deg: number, r: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [WHEEL.c + r * Math.sin(a), WHEEL.c - r * Math.cos(a)];
}
const num = (n: number): string => n.toFixed(2);

/** The ring between `a0` and `a1` (degrees clockwise from the top), inset by half the gap on each side. */
function wedge(a0: number, a1: number): string {
  const { outer: R, inner: r, gap, c } = WHEEL;
  if (a1 - a0 >= 359.9) {
    // One slice: the whole ring (two half arcs each way; the inner one, drawn backwards, is the hole).
    return `M${c} ${c - R}A${R} ${R} 0 1 1 ${c} ${c + R}A${R} ${R} 0 1 1 ${c} ${c - R}ZM${c} ${c - r}A${r} ${r} 0 1 0 ${c} ${c + r}A${r} ${r} 0 1 0 ${c} ${c - r}Z`;
  }
  const padOuter = (gap / 2 / R) * (180 / Math.PI);
  const padInner = (gap / 2 / r) * (180 / Math.PI);
  const [x0, y0] = polar(a0 + padOuter, R);
  const [x1, y1] = polar(a1 - padOuter, R);
  const [x2, y2] = polar(a1 - padInner, r);
  const [x3, y3] = polar(a0 + padInner, r);
  const largeOuter = a1 - a0 - 2 * padOuter > 180 ? 1 : 0;
  const largeInner = a1 - a0 - 2 * padInner > 180 ? 1 : 0;
  return `M${num(x0)} ${num(y0)}A${R} ${R} 0 ${largeOuter} 1 ${num(x1)} ${num(y1)}L${num(x2)} ${num(y2)}A${r} ${r} 0 ${largeInner} 0 ${num(x3)} ${num(y3)}Z`;
}

/** A label's size: as large as the slice's width at the label ring allows, up to `max`. */
function labelSize(text: string, sweep: number, max: number): number {
  const chord = sweep >= 180 ? Infinity : 2 * WHEEL.label * Math.sin(((sweep / 2) * Math.PI) / 180);
  const room = Math.min(chord * 0.8, (WHEEL.outer - WHEEL.inner) * 0.95);
  return Math.min(max, room / (Math.max(text.length, 1) * 0.62));
}

interface WheelSlice {
  id: string;
  /** Its number key (1-based); above 9 a slice is clicked only. */
  key: number;
  name: string;
  /** Items only. */
  price?: number;
  disabled?: boolean;
}

/**
 * CS:GO's radial buy menu: a wheel of the six categories (number keys 1–6 or a click), then a wheel
 * of that category's items (1..n or a click buys; what we cannot afford is dimmed). Buying keeps the
 * item wheel up; right click, Backspace or the centre's Back returns to the categories. The centre
 * shows the hovered item's name and price, otherwise our money and the buy time left.
 */
function BuyMenu({ team, cs, input, onBuy, onClose }: { team: number; cs: HudCs; input?: InputState; onBuy: (cmd: string) => void; onClose: () => void }) {
  const { t } = useTranslation('c-tf2-game');
  const catalog = useMemo(() => buyCatalog(team, cs.money), [team, cs.money]);
  const [group, setGroup] = useState<BuyGroupId | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const wheelRef = useRef<SVGSVGElement>(null);
  /** The last wheel change came from the keyboard on a focused slice: focus the new wheel's first. */
  const refocus = useRef(false);

  const names: Record<BuyGroupId, string> = {
    pistols: t('cs_buy_pistols', { defaultValue: 'Pistols' }),
    heavy: t('cs_buy_heavy', { defaultValue: 'Heavy' }),
    smgs: t('cs_buy_smgs', { defaultValue: 'SMGs' }),
    rifles: t('cs_buy_rifles', { defaultValue: 'Rifles' }),
    gear: t('cs_buy_gear', { defaultValue: 'Gear' }),
    grenades: t('cs_buy_grenades', { defaultValue: 'Grenades' }),
  };
  const gear: Record<string, string> = {
    vest: t('cs_armor', { defaultValue: 'Armor' }),
    vesthelm: t('cs_armor_helmet', { defaultValue: 'Armor + helmet' }),
    defuser: t('cs_defuse_kit', { defaultValue: 'Defuse kit' }),
  };
  const itemName = (e: BuyEntry): string => gear[e.command] ?? e.label.toUpperCase();

  const slices: WheelSlice[] = group
    ? catalog[group].map((e, i) => ({ id: e.command, key: i + 1, name: itemName(e), price: e.price, disabled: !e.affordable }))
    : WHEEL_ORDER.map((g) => ({ id: g, key: BUY_GROUPS.indexOf(g) + 1, name: names[g] }));
  const sweep = slices.length ? 360 / slices.length : 360;
  // The categories start with gear on the left; an item wheel puts its first item top left.
  const start = group ? -sweep : 270 - sweep / 2;

  const pick = useCallback(
    (s: WheelSlice) => {
      if (s.disabled) return;
      if (group) onBuy(s.id);
      else {
        setGroup(s.id as BuyGroupId);
        setHover(null);
      }
    },
    [group, onBuy],
  );
  const back = useCallback(() => {
    setGroup(null);
    setHover(null);
  }, []);

  // Slot keys are menu choices while the wheel is up, not weapon switches (pushImpulse).
  useEffect(() => {
    if (!input) return;
    input.menuOpen = true;
    return () => {
      input.menuOpen = false;
    };
  }, [input]);

  // Number keys pick a slice, Backspace goes back — on the window, where the game's keys arrive too.
  const live = useRef({ slices, group, pick, back });
  useEffect(() => {
    live.current = { slices, group, pick, back };
  });
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const now = live.current;
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (digit) {
        const s = now.slices.find((x) => x.key === Number(digit[1]));
        if (s) {
          e.preventDefault();
          now.pick(s);
        }
      } else if (e.code === 'Backspace' && now.group) {
        e.preventDefault();
        refocus.current = !!wheelRef.current?.contains(document.activeElement);
        now.back();
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    wheelRef.current?.querySelector<SVGGElement>('.csg-wheel-slice')?.focus();
  }, [group]);

  const shown = hover !== null ? slices[hover] : undefined;
  const heading = group ? names[group] : (shown?.name ?? t('cs_buy_title', { defaultValue: 'Buy menu' }));

  return (
    <section
      className="csg-buy"
      aria-label={t('cs_buy_title', { defaultValue: 'Buy menu' })}
      onContextMenu={(e) => {
        e.preventDefault();
        if (group) back();
      }}
    >
      <div className="csg-wheel">
        <svg ref={wheelRef} viewBox={`0 0 ${WHEEL.size} ${WHEEL.size}`} role="group" aria-label={group ? names[group] : t('cs_buy_groups', { defaultValue: 'Categories' })}>
          <circle className="csg-wheel-hub" cx={WHEEL.c} cy={WHEEL.c} r={WHEEL.inner - WHEEL.gap} aria-hidden />
          {slices.length === 0 ? <path className="csg-wheel-wedge" d={wedge(0, 360)} aria-hidden /> : null}
          {slices.map((s, i) => {
            const a0 = start + i * sweep;
            const [x, y] = polar(a0 + sweep / 2, WHEEL.label);
            const item = s.price !== undefined;
            const label = item ? t('cs_buy_item', { defaultValue: '{{name}}, ${{price}}', name: s.name, price: (s.price ?? 0).toLocaleString() }) : s.name;
            return (
              <g
                key={s.id}
                className="csg-wheel-slice"
                role="button"
                tabIndex={0}
                aria-label={label}
                aria-keyshortcuts={s.key <= 9 ? String(s.key) : undefined}
                aria-disabled={s.disabled || undefined}
                data-hover={hover === i || undefined}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                onFocus={() => setHover(i)}
                onBlur={() => setHover((h) => (h === i ? null : h))}
                onClick={() => pick(s)}
                onKeyDown={(e) => {
                  // Tab is the scoreboard in game: the arrows walk round the wheel instead.
                  const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
                  if (step) {
                    e.preventDefault();
                    e.stopPropagation();
                    const all = wheelRef.current?.querySelectorAll<SVGGElement>('.csg-wheel-slice');
                    if (all?.length) all[(i + step + all.length) % all.length]?.focus();
                    return;
                  }
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  // Ours, not the game's (Space would also jump).
                  e.preventDefault();
                  e.stopPropagation();
                  refocus.current = !group;
                  pick(s);
                }}
              >
                <path className="csg-wheel-wedge" d={wedge(a0, a0 + sweep)} aria-hidden />
                <g className="csg-wheel-text" aria-hidden>
                  {s.key <= 9 ? (
                    <text className="csg-wheel-key" x={num(x)} y={num(y - (item ? 15 : 11))}>
                      {s.key}
                    </text>
                  ) : null}
                  <text className="csg-wheel-name" x={num(x)} y={num(item ? y : y + 4)} fontSize={num(labelSize(s.name, sweep, item ? 10 : 11))}>
                    {s.name}
                  </text>
                  {item ? (
                    <text className="csg-wheel-price" x={num(x)} y={num(y + 13)}>
                      ${(s.price ?? 0).toLocaleString()}
                    </text>
                  ) : null}
                </g>
              </g>
            );
          })}
        </svg>

        <div className="csg-wheel-centre">
          <span className="csg-wheel-heading">{heading}</span>
          {group && slices.length === 0 ? (
            <span className="csg-wheel-time">{t('cs_buy_empty', { defaultValue: 'Nothing to buy here' })}</span>
          ) : group && shown?.price !== undefined ? (
            <>
              <span className="csg-wheel-item">{shown.name}</span>
              <span className="csg-wheel-money" data-short={shown.disabled || undefined}>
                ${shown.price.toLocaleString()}
              </span>
            </>
          ) : (
            <>
              <span className="csg-wheel-money">${cs.money.toLocaleString()}</span>
              <span className="csg-wheel-time">{t('cs_buy_time', { defaultValue: '{{s}} s left', s: Math.ceil(cs.buyTimeLeft) })}</span>
            </>
          )}
          {group ? (
            <button
              type="button"
              className="csg-wheel-back"
              onClick={(e) => {
                // From the keyboard (no click count): the button goes, so focus the first category.
                refocus.current = e.detail === 0;
                back();
              }}
            >
              {t('cs_buy_back', { defaultValue: 'Back' })}
            </button>
          ) : null}
        </div>

        <button type="button" className="csg-wheel-close" onClick={onClose} aria-label={t('cs_buy_close', { defaultValue: 'Close the buy menu' })}>
          ×
        </button>
      </div>
      <p className="csg-wheel-hint">
        {group
          ? t('cs_buy_hint_items', { defaultValue: 'Number key or click to buy · right click or Backspace to go back' })
          : t('cs_buy_hint_groups', { defaultValue: 'Number key or click to choose · B to close' })}
      </p>
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
