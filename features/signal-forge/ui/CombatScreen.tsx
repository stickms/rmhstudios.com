/**
 * Signal Forge combat screen: the enemy line with intents, the phrase on its oscilloscope strip (with the beat
 * sweep in Timed mode), the crucible Heat gauge with Vent, the Static pips, Energy and End Turn, and the hand.
 *
 * Timing: in Timed mode a beat runs from the moment the combat screen mounts (`t0`). A card played within the
 * Perfect window of a beat is Perfect, within the Good window Good, otherwise Late. The sweep is a CSS animation
 * started at the same instant (a negative delay keeps it in phase), so nothing runs a frame loop.
 *
 * Feedback (signal-forge.css): damage numbers rise, a hit enemy jolts, a destroyed one sinks and cools, a Forge
 * Burst sends one amber shock ring across the line. Every effect ends within 450 ms and none flashes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { label } from '@features/signal-forge/engine/labels';
import { RHYTHM } from '@features/signal-forge/engine/balance';
import { burstDamage, effectiveCard, enemyPassives, intentDamage, intentMove, isOnPhrase, living, relicPassive, staticThreshold } from '@features/signal-forge/engine/combat';
import { enemyDef } from '@features/signal-forge/engine/data/enemies';
import type { Action } from '@features/signal-forge/engine/run';
import type { RunState, StatusKey, Timing } from '@features/signal-forge/engine/types';
import type { TutorialEvent } from '@features/signal-forge/engine/tutorial';
import { EnemyArt } from './art/EnemyArt';
import { Icon, INTENT_COLOR, intentIcon, WAVE_COLOR, WaveGlyph, type IconName } from './art/glyphs';
import { CardView } from './CardView';
import { sfx } from './audio';

interface Props {
  run: RunState;
  act: (a: Action) => void;
  /** Tutorial gate: may this event happen now? */
  allow: (ev: TutorialEvent) => boolean;
  onTutorialEvent: (ev: TutorialEvent) => void;
  coach: string | null;
}

interface Fx {
  id: number;
  kind: 'dmg' | 'judge' | 'burst' | 'block';
  uid?: number;
  text: string;
}

const STATUS_ICON: Record<StatusKey, IconName> = { weak: 'weak', vuln: 'vuln', bleed: 'bleed', strength: 'strength', frail: 'frail', jam: 'jam' };

export function CombatScreen({ run, act, allow, onTutorialEvent, coach }: Props) {
  const { t } = useTranslation('c-signal-forge');
  const c = run.combat!;
  const timed = run.mode === 'timed';
  const period = 60000 / RHYTHM.bpm[run.act];
  const t0 = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  const [target, setTarget] = useState<number | null>(null);
  const [fx, setFx] = useState<Fx[]>([]);
  const [shake, setShake] = useState(0);
  const fxId = useRef(0);
  const prev = useRef<RunState>(run);
  const alive = living(c);
  const targetUid = alive.find((e) => e.uid === target)?.uid ?? alive[0]?.uid;
  const windowScale = relicPassive(run.relics).windowScale;

  const pushFx = useCallback((f: Omit<Fx, 'id'>) => {
    const id = ++fxId.current;
    setFx((xs) => [...xs.slice(-12), { ...f, id }]);
    window.setTimeout(() => setFx((xs) => xs.filter((x) => x.id !== id)), 520);
  }, []);

  // Diff the previous state for feedback: enemy HP lost, player hurt, bursts, glitches.
  useEffect(() => {
    const p = prev.current;
    prev.current = run;
    const pc = p.combat;
    if (!pc || pc === c) return;
    for (const e of c.enemies) {
      const before = pc.enemies.find((x) => x.uid === e.uid);
      if (before && before.hp > e.hp) pushFx({ kind: 'dmg', uid: e.uid, text: `-${before.hp - e.hp}` });
    }
    if (run.hp < p.hp) setShake((n) => n + 1);
    if (run.stats.bursts > p.stats.bursts) {
      pushFx({ kind: 'burst', text: t('fx.burst', { defaultValue: 'Forge Burst' }) });
      sfx.burst();
    }
    if (c.discard.filter((x) => x.id === 'glitch').length > pc.discard.filter((x) => x.id === 'glitch').length) sfx.glitch();
    if (c.block > pc.block && c.turn === pc.turn) pushFx({ kind: 'block', text: `+${c.block - pc.block}` });
  }, [run, c, pushFx, t]);

  // The metronome tick (Timed mode): a timer, not a frame loop, aligned to t0 and cleared on unmount.
  useEffect(() => {
    if (!timed) return;
    let n = 0;
    let handle = 0;
    const schedule = () => {
      const now = performance.now();
      const nextBeat = t0.current + Math.ceil((now - t0.current) / period) * period;
      handle = window.setTimeout(() => {
        sfx.tick(n++ % 4 === 0);
        schedule();
      }, Math.max(0, nextBeat - now));
    };
    schedule();
    return () => window.clearTimeout(handle);
  }, [timed, period]);

  const judge = useCallback((): Timing => {
    if (!timed) return 'steady';
    const phase = (performance.now() - t0.current) % period;
    const off = Math.min(phase, period - phase);
    if (off <= RHYTHM.perfectMs * windowScale) return 'perfect';
    if (off <= RHYTHM.goodMs * windowScale) return 'good';
    return 'late';
  }, [timed, period, windowScale]);

  const play = useCallback(
    (i: number) => {
      const inst = c.hand[i];
      if (!inst) return;
      const d = effectiveCard(inst);
      if (d.unplayable || d.cost > c.energy) return;
      const on = isOnPhrase(run, d);
      const ev: TutorialEvent = { t: 'play', onPhrase: on };
      if (!allow(ev)) return;
      const timing = judge();
      act({ t: 'play', i, timing, ...(targetUid !== undefined ? { target: targetUid } : {}) });
      sfx.play(d.wave, on ? timing : 'off');
      pushFx({
        kind: 'judge',
        text: on
          ? timing === 'perfect'
            ? t('judge.perfect', { defaultValue: 'Perfect' })
            : timing === 'late'
              ? t('judge.late', { defaultValue: 'Late' })
              : t('judge.good', { defaultValue: 'Good' })
          : t('judge.off', { defaultValue: 'Off phrase' }),
      });
      onTutorialEvent(ev);
    },
    [c, run, allow, judge, act, targetUid, pushFx, t, onTutorialEvent],
  );

  const doVent = useCallback(() => {
    if (!allow({ t: 'vent' }) || c.ventedThisTurn || c.heat <= 0) return;
    act({ t: 'vent' });
    sfx.vent();
    onTutorialEvent({ t: 'vent' });
  }, [allow, act, c, onTutorialEvent]);

  const doEnd = useCallback(() => {
    if (!allow({ t: 'end' })) return;
    act({ t: 'end' });
    onTutorialEvent({ t: 'end' });
  }, [allow, act, onTutorialEvent]);

  // Keyboard: 1-9 play, V vent, E end turn, Q cycle target.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('.sf-modal')) return;
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        play(Number(e.key) - 1);
      } else if (e.key === 'v' || e.key === 'V') doVent();
      else if (e.key === 'e' || e.key === 'E') doEnd();
      else if (e.key === 'q' || e.key === 'Q') {
        const idx = alive.findIndex((x) => x.uid === targetUid);
        const nextE = alive[(idx + 1) % Math.max(1, alive.length)];
        if (nextE) setTarget(nextE.uid);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [play, doVent, doEnd, alive, targetUid]);

  const cap = RHYTHM.heatCap + relicPassive(run.relics).heatCap;
  const th = staticThreshold(run);
  const burst = burstDamage(run);
  const sweepDelay = useMemo(() => -((performance.now() - t0.current + period / 2) % period), [period]);
  const nextSlot = c.phrase[c.phraseAt];
  const coached = (a: string) => (coach === a ? ' is-coached' : '');

  return (
    <div className={`sf-combat${shake ? ` is-hurt-${shake % 2}` : ''}`}>
      {/* Enemy line */}
      <section className="sf-enemies" aria-label={t('combat.enemies', { defaultValue: 'Enemies' })}>
        {c.enemies.map((e) => {
          const d = enemyDef(e.id);
          const dead = e.hp <= 0;
          const mv = intentMove(e);
          const dmg = intentDamage(run, e);
          const passives = enemyPassives(e);
          const name = t(`enemy.${e.id}.name`, { defaultValue: d.name });
          const moveName = t(`enemy.${e.id}.move.${mv.id}`, { defaultValue: mv.name });
          const intentText = dmg ? (dmg.hits > 1 ? `${dmg.dmg}x${dmg.hits}` : `${dmg.dmg}`) : '';
          const selected = e.uid === targetUid && !dead;
          return (
            <button
              type="button"
              key={e.uid}
              className={`sf-enemy sf-tier-${d.tier}${dead ? ' is-dead' : ''}${selected ? ' is-target' : ''}`}
              onClick={() => !dead && setTarget(e.uid)}
              disabled={dead}
              aria-pressed={selected}
              aria-label={t('combat.enemy-aria', {
                defaultValue: '{{name}}, {{hp}} of {{max}} HP, {{block}} block. Intends {{move}} {{dmg}}.',
                name,
                hp: e.hp,
                max: e.maxHp,
                block: e.block,
                move: moveName,
                dmg: intentText,
              })}
            >
              {!dead && (
                <span className={`sf-intent${coached('intent')}`} data-tut="intent" style={{ ['--sf-intent' as string]: INTENT_COLOR[mv.kind] }}>
                  <Icon name={intentIcon(mv.kind)} size={16} color={INTENT_COLOR[mv.kind]} />
                  {intentText && <b className="sf-mono">{intentText}</b>}
                  <span className="sf-intent-name">{moveName}</span>
                </span>
              )}
              <span className="sf-enemy-body">
                <EnemyArt def={d} size={d.tier === 'boss' ? 168 : 120} />
                {fx
                  .filter((f) => f.kind === 'dmg' && f.uid === e.uid)
                  .map((f) => (
                    <span key={f.id} className="sf-fx-dmg sf-mono">
                      {f.text}
                    </span>
                  ))}
              </span>
              <span className="sf-enemy-name">{name}</span>
              <span className="sf-ehp">
                <span className="sf-ehp-fill" style={{ width: `${(e.hp / e.maxHp) * 100}%` }} />
                <span className="sf-ehp-text sf-mono">
                  {e.hp}/{e.maxHp}
                </span>
                {e.block > 0 && (
                  <span className="sf-ehp-block sf-mono">
                    <Icon name="block" size={12} color="#46D8F2" />
                    {e.block}
                  </span>
                )}
              </span>
              <span className="sf-statuses">
                {(Object.entries(e.statuses) as Array<[StatusKey, number]>).map(([k, v]) => (
                  <span key={k} className={`sf-status sf-status-${k}`} title={t(`status.${k}`, { defaultValue: label(`status.${k}`) })}>
                    <Icon name={STATUS_ICON[k]} size={12} />
                    {v}
                  </span>
                ))}
                {passives.armor ? <span className="sf-status sf-status-armor" title={t('status.armor', { defaultValue: 'Armor' })}><Icon name="block" size={12} />{passives.armor}</span> : null}
                {passives.thorns ? <span className="sf-status sf-status-thorns" title={t('status.thorns', { defaultValue: 'Thorns' })}><Icon name="vuln" size={12} />{passives.thorns}</span> : null}
                {passives.phased ? <span className="sf-status sf-status-phased" title={t('status.phased', { defaultValue: 'Phased: half damage from off-phrase cards' })}><Icon name="jam" size={12} /></span> : null}
              </span>
            </button>
          );
        })}
        {fx
          .filter((f) => f.kind === 'burst')
          .map((f) => (
            <span key={f.id} className="sf-fx-burst" aria-hidden>
              <span className="sf-fx-burst-label">{f.text}</span>
            </span>
          ))}
      </section>

      {/* The phrase */}
      <section className={`sf-signal${coached('phrase')}`} data-tut="phrase" aria-label={t('combat.phrase-aria', { defaultValue: 'Phrase: slot {{at}} of {{len}}', at: c.phraseAt + 1, len: c.phrase.length })}>
        <div className="sf-scope">
          <svg className="sf-scope-grid" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden>
            {Array.from({ length: 11 }, (_, i) => (
              <path key={i} d={`M${i * 40} 0V60`} stroke="#3FD6F0" strokeOpacity={0.12} />
            ))}
            <path d="M0 30H400" stroke="#3FD6F0" strokeOpacity={0.18} />
          </svg>
          {timed && (
            <>
              <span className="sf-beat-target" aria-hidden />
              <span className="sf-beat-sweep" aria-hidden style={{ animationDuration: `${period}ms`, animationDelay: `${sweepDelay}ms` }} />
            </>
          )}
          <ol className="sf-phrase">
            {c.phrase.map((w, i) => (
              <li key={`${c.turn}-${i}-${w}`} className={`sf-slot${i < c.phraseAt ? ' is-filled' : ''}${i === c.phraseAt ? ' is-next' : ''}`} style={{ ['--sf-wave' as string]: WAVE_COLOR[w] }}>
                <WaveGlyph wave={w} size={30} />
                <span className="sf-slot-name">{t(`wave.${w}`, { defaultValue: label(`wave.${w}`) })}</span>
              </li>
            ))}
          </ol>
          {fx
            .filter((f) => f.kind === 'judge')
            .slice(-1)
            .map((f) => (
              <span key={f.id} className="sf-fx-judge" role="status">
                {f.text}
              </span>
            ))}
        </div>
      </section>

      {/* Controls */}
      <section className="sf-controls">
        <div className={`sf-heat${coached('heat')}`} data-tut="heat">
          <span className="sf-label">{t('combat.heat', { defaultValue: 'Heat' })}</span>
          <span className="sf-crucible" role="meter" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={c.heat} aria-label={t('combat.heat', { defaultValue: 'Heat' })}>
            <span className="sf-crucible-fill" style={{ height: `${(c.heat / cap) * 100}%` }} />
            <b className="sf-mono">{c.heat}</b>
          </span>
          <span className="sf-burst-preview sf-mono">{t('combat.burst-preview', { defaultValue: 'Burst {{n}}', n: burst })}</span>
          <button type="button" className={`sf-btn sf-btn-cyan${coached('vent')}`} data-tut="vent" onClick={doVent} disabled={c.ventedThisTurn || c.heat <= 0}>
            <Icon name="coolant" size={14} />
            {t('combat.vent', { defaultValue: 'Vent +{{n}}', n: c.heat * (RHYTHM.ventPerHeat + relicPassive(run.relics).ventPerHeat) })}
          </button>
        </div>
        <div className={`sf-static${coached('static')}`} data-tut="static" aria-label={t('combat.static-aria', { defaultValue: 'Static {{n}} of {{max}}', n: c.static, max: th })}>
          <span className="sf-label">{t('combat.static', { defaultValue: 'Static' })}</span>
          <span className="sf-pips">
            {Array.from({ length: th }, (_, i) => (
              <span key={i} className={`sf-pip${i < c.static ? ' is-on' : ''}`} />
            ))}
          </span>
        </div>
        <div className="sf-player">
          <span className="sf-block" aria-label={t('combat.block-aria', { defaultValue: '{{n}} Block', n: c.block })}>
            <Icon name="block" size={20} color="#46D8F2" />
            <b className="sf-mono">{c.block}</b>
            {fx
              .filter((f) => f.kind === 'block')
              .slice(-1)
              .map((f) => (
                <span key={f.id} className="sf-fx-blockup sf-mono">
                  {f.text}
                </span>
              ))}
          </span>
          <span className="sf-statuses">
            {(Object.entries(c.statuses) as Array<[StatusKey, number]>).map(([k, v]) => (
              <span key={k} className={`sf-status sf-status-${k}`} title={t(`status.${k}`, { defaultValue: label(`status.${k}`) })}>
                <Icon name={STATUS_ICON[k]} size={12} />
                {v}
              </span>
            ))}
          </span>
        </div>
        <div className="sf-energy" aria-label={t('combat.energy-aria', { defaultValue: '{{n}} Energy', n: c.energy })}>
          <svg viewBox="0 0 48 48" width="52" height="52" aria-hidden>
            <polygon points="24,2 44,13 44,35 24,46 4,35 4,13" fill="#2A1A0E" stroke="#FF8A2A" strokeWidth={2.5} />
            <circle cx={24} cy={24} r={9} fill="none" stroke="#FF8A2A" strokeOpacity={0.4} strokeWidth={1.5} />
          </svg>
          <b className="sf-mono">{c.energy}</b>
        </div>
        <button type="button" className={`sf-btn sf-btn-hot sf-endturn${coached('end')}`} data-tut="end" onClick={doEnd}>
          {t('combat.end-turn', { defaultValue: 'End turn' })}
          <kbd>E</kbd>
        </button>
      </section>

      {/* Hand */}
      <section className={`sf-hand${coached('hand')}`} data-tut="hand" aria-label={t('combat.hand', { defaultValue: 'Hand' })}>
        {c.hand.map((inst, i) => {
          const d = effectiveCard(inst);
          const on = isOnPhrase(run, d);
          return (
            <CardView
              key={inst.uid}
              def={d}
              upgraded={inst.up}
              onPhrase={on}
              disabled={d.unplayable || d.cost > c.energy}
              onPlay={() => play(i)}
              hint={i < 9 ? String(i + 1) : undefined}
            />
          );
        })}
        {c.hand.length === 0 && <p className="sf-empty-hand">{t('combat.empty-hand', { defaultValue: 'No cards in hand. End your turn.' })}</p>}
      </section>
      <p className="sf-sr-only" role="status">
        {nextSlot ? t('combat.next-slot', { defaultValue: 'Next slot: {{w}}', w: t(`wave.${nextSlot}`, { defaultValue: label(`wave.${nextSlot}`) }) }) : ''}
      </p>
    </div>
  );
}
