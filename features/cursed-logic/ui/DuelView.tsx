/**
 * The duel screen: the Protocol's containment window (portrait, core cells, its tell), the clash strip where the
 * two actions flip, your process window (Integrity cells, Charge pips, conditions), the three stance cards and the
 * four commands. Every hit, block, probe and kill plays a one-shot effect keyed to the clash (<= 360 ms).
 */
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { PROTOCOLS, REINFORCE_COST, SECTORS, TOTAL_DUELS } from '@features/cursed-logic/engine/data';
import { actionCost, canReinforce, duelNumber, type RunState } from '@features/cursed-logic/engine/run';
import { PLAYER_ACTIONS, type PlayerAction, type Stance } from '@features/cursed-logic/engine/types';
import type { CursedLogicStore } from '@features/cursed-logic/engine/gameState';
import type { TutorialStep } from '@features/cursed-logic/engine/tutorial';
import { ActionGlyph, ModifierGlyph, StanceSigil } from './glyphs';
import { Portrait } from './portraits';
import type { Copy } from './copy';

const SHARDS = ['#', '/', '%', '§', '¥', '∆', '0', '1', '&', '?'];
export const ACTION_KEYS: Record<PlayerAction, string> = { Strike: 'A', Block: 'S', Prepare: 'D', Probe: 'F' };

function Cells({ value, max, foe, lost }: { value: number; max: number; foe?: boolean; lost: number }) {
  return (
    <div className="cl-cells" aria-hidden>
      {Array.from({ length: max }, (_, i) => {
        const filled = i < value;
        const justLost = !filled && i < value + lost;
        return (
          <span
            key={i}
            className={`cl-cell ${filled ? (foe ? 'cl-cell-foe' : '') : justLost ? 'cl-cell-lost' : 'cl-cell-empty'}`}
          />
        );
      })}
    </div>
  );
}

function Shrapnel({ seed, color }: { seed: number; color: string }) {
  const bits = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2 + seed;
        const r = 46 + ((i * 37 + seed * 13) % 30);
        return { ch: SHARDS[(i + seed) % SHARDS.length], dx: `${Math.cos(a) * r}px`, dy: `${Math.sin(a) * r}px` };
      }),
    [seed],
  );
  return (
    <>
      {bits.map((b, i) => (
        <span key={i} className="cl-shard" style={{ color, ['--dx' as string]: b.dx, ['--dy' as string]: b.dy }} aria-hidden>
          {b.ch}
        </span>
      ))}
    </>
  );
}

interface Props {
  run: RunState;
  store: CursedLogicStore;
  copy: Copy;
  /** In the training duel: the step the coach waits for. */
  coach: TutorialStep | null;
}

export function DuelView({ run, store, copy, coach }: Props) {
  const { t } = useTranslation('c-cursed-logic');
  const duel = run.duel!;
  const def = PROTOCOLS[duel.protocolId];
  const { phase, revealStep, pending, clashId, reinforce } = store;
  const last = duel.log[0] ?? null;
  const showResult = phase === 'result' && last;
  const hitFoe = showResult && last.protocolDamage > 0;
  const hitYou = showResult && last.playerDamage > 0;
  const killed = showResult && duel.result === 'win';
  const choosingStance = phase === 'idle' && !duel.stance && !duel.result;
  const choosingAction = phase === 'idle' && !!duel.stance && !duel.result;
  const sector = SECTORS[run.sector - 1];
  const tutorial = run.mode === 'tutorial';

  const spotStance = coach?.expect.kind === 'stance' ? coach.expect.stance : null;
  const spotAction = coach?.expect.kind === 'action' ? coach.expect.action : null;

  const stanceClass = (s: Stance) => (!coach || duel.stance === s ? '' : spotStance === s ? 'cl-spot' : 'cl-inert');
  const actionClass = (a: PlayerAction) => (!coach ? '' : spotAction === a ? 'cl-spot' : 'cl-inert');

  const foeAction = phase === 'reveal' || phase === 'minigame' ? pending?.clash.protocolAction : showResult ? last.protocolAction : null;
  const yourAction =
    (phase === 'reveal' && revealStep >= 1) || phase === 'minigame' ? pending?.clash.playerAction : showResult ? last.playerAction : null;

  return (
    <div className="flex flex-col gap-3 w-full max-w-[760px] mx-auto px-4 pb-4">
      {/* Position on the ladder */}
      <div className="flex flex-wrap items-center gap-2 text-[0.7rem] cl-muted">
        {tutorial ? (
          <span className="cl-chip cl-chip-violet">{t('training-duel', { defaultValue: 'Training duel' })}</span>
        ) : (
          <>
            <span className="cl-chip cl-chip-acid">
              {t('sector-n', { defaultValue: 'Sector {{n}}', n: sector?.index ?? run.sector })}
            </span>
            <span>{t('duel-of', { defaultValue: 'Duel {{n}} of {{total}}', n: duelNumber(run), total: TOTAL_DUELS })}</span>
            <span aria-hidden>·</span>
            <span>{t('fragments-short', { defaultValue: '{{n}} fragments', n: run.fragments })}</span>
          </>
        )}
        <span aria-hidden>·</span>
        <span>{t('round-n', { defaultValue: 'Round {{n}}', n: duel.round })}</span>
        {duel.modifier && (
          <span className="cl-chip cl-chip-violet" title={copy.modifierRule(duel.modifier)}>
            <ModifierGlyph modifier={duel.modifier} size={14} />
            {copy.modifierName(duel.modifier)}
            <span className="sr-only">: {copy.modifierRule(duel.modifier)}</span>
          </span>
        )}
      </div>
      {duel.modifier && <p className="text-[0.72rem] cl-violet -mt-2">{copy.modifierRule(duel.modifier)}</p>}

      {/* The Protocol */}
      <section className="cl-window" aria-label={copy.protocolName(duel.protocolId)}>
        <div className="cl-window-title">
          {t('containment', { defaultValue: 'CONTAINMENT' })} :: {copy.protocolName(duel.protocolId)}
        </div>
        <div className="flex gap-3 p-3 items-center">
          <div className="relative shrink-0" key={`foe-${clashId}`}>
            <Portrait
              id={duel.protocolId}
              size={112}
              className={killed ? 'cl-terminate' : duel.result === 'win' ? 'opacity-20' : hitFoe ? 'cl-tear' : undefined}
            />
            {hitFoe && <Shrapnel seed={clashId} color="#b6ff3c" />}
            {showResult && last.protocolAction === 'Block' && (
              <span className="absolute inset-0 flex items-center justify-center cl-slam cl-display text-[3.2rem] cl-violet" aria-hidden>
                [&nbsp;&nbsp;]
              </span>
            )}
            {showResult && last.playerAction === 'Probe' && <span className="cl-sweep" aria-hidden />}
          </div>
          <div className="min-w-0 flex-1 flex flex-col gap-2">
            <div className="cl-display text-base cl-chroma">{copy.protocolName(duel.protocolId)}</div>
            <p className="text-[0.72rem] cl-muted leading-snug">{copy.protocolBio(duel.protocolId)}</p>
            <div className="flex items-center gap-2">
              <span className="text-[0.65rem] cl-muted w-10">{t('core', { defaultValue: 'CORE' })}</span>
              <Cells value={duel.protocolHealth} max={duel.protocolMax} foe lost={hitFoe ? last.protocolDamage : 0} />
              <span className="text-[0.7rem] tabular-nums">
                {duel.protocolHealth}/{duel.protocolMax}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {duel.protocolPrimed && <span className="cl-chip cl-chip-danger">{t('foe-primed', { defaultValue: 'Primed: next Strike +2' })}</span>}
              {duel.protocolCondition && <span className="cl-chip cl-chip-acid">{copy.conditionName(duel.protocolCondition)}</span>}
            </div>
          </div>
        </div>
        {/* Its tell */}
        <div className="flex items-center gap-3 px-3 pb-3">
          <span className="text-[0.65rem] cl-muted">{t('intent', { defaultValue: 'INTENT' })}</span>
          {duel.tell ? (
            <span className={`cl-chip ${duel.tellTrue || duel.decoderVerdict === true ? 'cl-chip-acid' : 'cl-chip-violet'}`}>
              <ActionGlyph action={duel.tell} size={16} />
              <span className="cl-display text-[0.75rem]">{copy.actionName(duel.tell)}</span>
              <span>
                {duel.tellTrue
                  ? t('tell-locked', { defaultValue: 'locked' })
                  : duel.decoderVerdict === true
                    ? t('tell-true', { defaultValue: 'decoded: true' })
                    : duel.decoderVerdict === false
                      ? t('tell-false', { defaultValue: 'decoded: a lie' })
                      : t('tell-maybe', { defaultValue: 'maybe a lie' })}
              </span>
            </span>
          ) : (
            <span className="cl-chip">{t('tell-hidden', { defaultValue: 'no signal' })}</span>
          )}
          {!tutorial && duel.decoderLeft > 0 && duel.tell && !duel.tellTrue && duel.decoderVerdict === null && phase === 'idle' && (
            <button type="button" className="cl-link text-[0.72rem]" onClick={store.decode}>
              {t('use-decoder', { defaultValue: 'Decode ({{n}})', n: duel.decoderLeft })}
            </button>
          )}
          <span className="ml-auto text-[0.65rem] cl-muted hidden sm:inline">
            {t('honesty', { defaultValue: 'tells honest ~{{n}}%', n: Math.round(def.honesty * 100) })}
          </span>
        </div>
      </section>

      {/* The clash strip */}
      <section className="cl-window min-h-[76px] flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-3 py-2" aria-live="polite">
        {foeAction || yourAction ? (
          <>
            <div className="flex flex-col items-center cl-arrive" key={`f-${foeAction}-${clashId}`}>
              <span className="text-[0.6rem] cl-muted">{t('it', { defaultValue: 'IT' })}</span>
              {foeAction ? (
                <span className="flex items-center gap-1.5 cl-violet">
                  <ActionGlyph action={foeAction} size={22} />
                  <span className="cl-display text-[0.85rem]">{copy.actionName(foeAction)}</span>
                </span>
              ) : (
                <span className="cl-display">···</span>
              )}
            </div>
            <span className="cl-display cl-muted text-[0.8rem]">×</span>
            <div className="flex flex-col items-center cl-arrive" key={`y-${yourAction}-${clashId}`}>
              <span className="text-[0.6rem] cl-muted">{t('you', { defaultValue: 'YOU' })}</span>
              {yourAction ? (
                <span className="flex items-center gap-1.5 cl-acid">
                  <ActionGlyph action={yourAction} size={22} />
                  <span className="cl-display text-[0.85rem]">{copy.actionName(yourAction)}</span>
                </span>
              ) : (
                <span className="cl-display">···</span>
              )}
            </div>
            {showResult && (
              <div className="flex flex-col text-[0.75rem] cl-arrive" key={`r-${clashId}`}>
                {last.protocolDamage > 0 && (
                  <span className="cl-acid">{t('dealt', { defaultValue: 'it -{{n}}', n: last.protocolDamage })}</span>
                )}
                {last.playerDamage > 0 && (
                  <span className="cl-danger">{t('taken', { defaultValue: 'you -{{n}}', n: last.playerDamage })}</span>
                )}
                {last.playerHeal > 0 && <span className="cl-acid">{t('healed', { defaultValue: 'you +{{n}}', n: last.playerHeal })}</span>}
                {last.protocolDamage === 0 && last.playerDamage === 0 && <span className="cl-muted">{t('no-damage', { defaultValue: 'No damage' })}</span>}
                {last.overdraw && <span className="cl-danger">{t('overdraw', { defaultValue: 'overdraw' })}</span>}
                {pending?.chaosHit && <span className="cl-violet">{t('chaos-hit', { defaultValue: 'Chaos swapped an action' })}</span>}
              </div>
            )}
          </>
        ) : (
          <p className="text-[0.75rem] cl-muted cl-prompt">
            {duel.result === 'win'
              ? t('terminated', { defaultValue: 'PROCESS TERMINATED' })
              : choosingStance
                ? t('prompt-stance', { defaultValue: 'Choose a stance.' })
                : t('prompt-action', { defaultValue: 'Choose a command.' })}
          </p>
        )}
        {killed && (
          <span className="cl-display cl-acid cl-chroma text-[0.9rem] cl-arrive">
            {t('terminated', { defaultValue: 'PROCESS TERMINATED' })}
          </span>
        )}
      </section>

      {/* You */}
      <section className={`cl-window ${hitYou ? 'cl-tear' : ''}`} key={`you-${clashId}`} aria-label={t('your-process', { defaultValue: 'Your process' })}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
          <div className="flex items-center gap-2">
            <span className="text-[0.65rem] cl-muted">{t('integrity', { defaultValue: 'INTEGRITY' })}</span>
            <Cells value={run.integrity} max={run.maxIntegrity} lost={hitYou ? Math.max(0, last.playerDamage - last.playerHeal) : 0} />
            <span className="text-[0.7rem] tabular-nums">
              {run.integrity}/{run.maxIntegrity}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[0.65rem] cl-muted">{t('charge', { defaultValue: 'CHARGE' })}</span>
            <span className="flex gap-1.5" aria-hidden>
              {Array.from({ length: duel.chargeCap }, (_, i) => (
                <span key={i} className={`cl-pip ${i < duel.charge ? 'cl-pip-on' : ''}`} />
              ))}
            </span>
            <span className="sr-only">
              {duel.charge}/{duel.chargeCap}
            </span>
          </div>
          {duel.playerPrimed && <span className="cl-chip cl-chip-acid">{t('you-primed', { defaultValue: 'Primed: next Strike +2' })}</span>}
          {duel.playerCondition && <span className="cl-chip cl-chip-danger">{copy.conditionName(duel.playerCondition)}</span>}
          {duel.lockedRounds > 0 && !tutorial && (
            <span className="cl-chip cl-chip-acid">{t('locked-rounds', { defaultValue: 'Probe lock: {{n}}', n: duel.lockedRounds })}</span>
          )}
        </div>
        {hitYou && (
          <div className="relative h-0" aria-hidden>
            <Shrapnel seed={clashId + 3} color="#ff4f6e" />
          </div>
        )}
      </section>

      {/* Stances */}
      {(choosingStance || duel.stance) && (
        <section aria-label={t('stances', { defaultValue: 'Stances' })}>
          <div className="grid grid-cols-3 gap-2">
            {duel.stanceOffer.map((s, i) => (
              <button
                key={s}
                type="button"
                className={`cl-card ${stanceClass(s)}`}
                aria-pressed={duel.stance === s}
                disabled={!choosingStance && duel.stance !== s}
                onClick={() => store.chooseStance(s)}
              >
                <StanceSigil stance={s} size={34} />
                <span className="cl-card-name">{copy.stanceName(s)}</span>
                <span className="cl-card-rule">{copy.stanceRule(s)}</span>
                <span className="cl-key absolute top-1 left-1.5 hidden sm:inline" aria-hidden>
                  {i + 1}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Commands */}
      <section aria-label={t('commands', { defaultValue: 'Commands' })} className="flex flex-col gap-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PLAYER_ACTIONS.map((a) => {
            const cost = actionCost(duel, run, a) + (reinforce && canReinforce(run, a) ? REINFORCE_COST : 0);
            const over = duel.charge < cost;
            return (
              <button
                key={a}
                type="button"
                className={`cl-action ${actionClass(a)}`}
                disabled={!choosingAction}
                onClick={() => store.commit(a)}
              >
                <ActionGlyph action={a} size={26} className="cl-acid shrink-0" />
                <span className="flex flex-col min-w-0">
                  <span className="cl-action-name">{copy.actionName(a)}</span>
                  <span className="cl-action-cost">
                    {over
                      ? t('cost-overdraw', { defaultValue: 'cost {{n}} · overdraw', n: cost })
                      : t('cost', { defaultValue: 'cost {{n}}', n: cost })}
                  </span>
                  <span className="cl-action-cost hidden md:block">{copy.actionRule(a)}</span>
                </span>
                <span className="cl-key ml-auto hidden sm:inline" aria-hidden>
                  {ACTION_KEYS[a]}
                </span>
              </button>
            );
          })}
        </div>
        {!tutorial && (
          <label className="flex items-center gap-2 text-[0.75rem] cl-muted min-h-11 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={reinforce}
              onChange={(e) => store.setReinforce(e.target.checked)}
              className="w-4 h-4" style={{ accentColor: '#b6ff3c' }}
            />
            {t('reinforce', {
              defaultValue: 'Reinforce (+{{n}} Charge): Strike +1, or Block takes no chip and reflects 1',
              n: REINFORCE_COST,
            })}
            <span className="cl-key hidden sm:inline" aria-hidden>
              R
            </span>
          </label>
        )}
      </section>

      {/* Terminal log */}
      {duel.log.length > 0 && (
        <section className="cl-window">
          <div className="cl-window-title">{t('log', { defaultValue: 'LOG' })}</div>
          <ol className="cl-log px-3 py-2 flex flex-col">
            {duel.log.slice(0, 4).map((r, i) => (
              <li key={duel.round - i} className="cl-prompt">
                {t('log-line', {
                  defaultValue: 'r{{round}} {{you}} × {{it}} → it -{{dealt}} / you -{{taken}}',
                  round: duel.round - i - (duel.result ? 0 : 1),
                  you: copy.actionName(r.playerAction),
                  it: copy.actionName(r.protocolAction),
                  dealt: r.protocolDamage,
                  taken: r.playerDamage,
                })}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
