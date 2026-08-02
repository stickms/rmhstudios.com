/**
 * Sources — the shop, and the Manna ledger.
 *
 * Two modes on the same list. In *buy* mode a row shows a price and how long
 * until you can afford it, which is the single most navigational number in an
 * idle game. In *raise* mode the same row shows its Manna level and what the
 * next one costs, which is the slow game.
 *
 * The row with the shortest payback is marked. Experienced players compute
 * that in their heads; there is no reason to make them.
 */
'use client';

import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import { fmt, fmtCount, formatTimeTo } from '@/lib/temple-of-joy/numbers';
import type { BuyQty, SourceId } from '@/lib/temple-of-joy/types';
import { SOURCES } from '@/lib/temple-of-joy/data/sources';
import { nextGlobe } from '@/lib/temple-of-joy/data/globes';
import {
  computeBestPurchase,
  computeGlobeAffordable,
  computeGlobeCost,
  computeGlobeMultiplier,
  computeGlobeVisible,
  computeGlobes,
  computeJps,
  computeMaxAffordable,
  computeSourceCostN,
  computeSourceJps,
  computeSourceVisible,
} from '@/lib/temple-of-joy/engine';
import { levelCost } from '@/lib/temple-of-joy/minigames/manna';
import { useFlash, useTempleSnapshot, useTempleValue } from '../hooks';
import { TempleRow, TempleSegments, TempleEmpty, Glyph } from '../ui';

const QUANTITIES: { value: BuyQty; label: string }[] = [
  { value: 1, label: '×1' },
  { value: 10, label: '×10' },
  { value: 100, label: '×100' },
  { value: 'max', label: 'Max' },
];

export function SourcesPanel() {
  const { t } = useTranslation('c-temple-of-joy');
  const qty = useTempleValue((s) => s.buyQty);
  const levelMode = useTempleValue((s) => s.levelMode);
  const [flashed, flash] = useFlash();

  const rows = useTempleSnapshot((s) => {
    const jps = computeJps(s);
    const best = computeBestPurchase(s);
    const bestId = best?.kind === 'source' ? best.id : null;

    return SOURCES.filter((source) => computeSourceVisible(s, source.id)).map((source) => {
      const owned = s.sources[source.id] ?? 0;
      const count = s.buyQty === 'max' ? computeMaxAffordable(source.id, owned, s.joy) : s.buyQty;
      const cost = computeSourceCostN(source.id, owned, Math.max(1, count));
      const level = s.sourceLevels[source.id] ?? 0;
      const raiseCost = levelCost(level);

      return {
        id: source.id,
        owned,
        count,
        level,
        raiseCost,
        canRaise: s.manna.held >= raiseCost,
        cost: fmt(cost, s.numberFormat),
        affordable: s.joy >= cost && count > 0,
        wait: formatTimeTo(cost, s.joy, jps),
        // What this source is contributing right now, which is the honest
        // answer to "is it still worth buying these".
        output: fmt(computeSourceJps(s, source.id), s.numberFormat),
        recommended: source.id === bestId,
      };
    });
  }, 300);

  if (rows.length === 0) {
    return (
      <TempleEmpty>
        {t('sources-empty', { defaultValue: 'Tap the altar. Joy comes before comfort.' })}
      </TempleEmpty>
    );
  }

  return (
    <>
      <div className="toj-toolbar">
        {/* The quantity switch is meaningless while raising — a Manna level is
            always exactly one — so it steps aside rather than sitting there
            inert. */}
        {levelMode ? (
          <span className="toj-panel-sub">
            <Glyph>🍞</Glyph> {t('mode-raise', { defaultValue: 'Spending Manna' })}
          </span>
        ) : (
          <TempleSegments
            options={QUANTITIES}
            value={qty}
            onChange={(value) => useTempleStore.getState().setBuyQty(value as BuyQty)}
            label={t('buy-quantity', { defaultValue: 'Buy quantity' })}
          />
        )}
        <button
          type="button"
          className="toj-segment"
          aria-pressed={levelMode}
          onClick={() => {
            templeAudio.play('tab');
            useTempleStore.getState().setLevelMode(!levelMode);
          }}
        >
          <Glyph>🍞</Glyph> {t('raise-mode', { defaultValue: 'Raise' })}
        </button>
      </div>

      {levelMode && (
        <p className="toj-panel-note">
          {t('raise-note', {
            defaultValue:
              'Manna raises a source permanently: +1% output per level, and it survives every ascension. Levelling the Grove, Almshouse, Sanctuary and Scriptorium opens what is behind them.',
          })}
        </p>
      )}

      {!levelMode && <GlobeRow />}

      {rows.map((row) => {
        const def = SOURCES.find((s) => s.id === row.id)!;

        if (levelMode) {
          return (
            <TempleRow
              key={row.id}
              icon={<Glyph>{def.icon}</Glyph>}
              name={def.name}
              note={
                <>
                  {row.level > 0 && (
                    <span className="toj-pips" aria-hidden>
                      {Array.from({ length: Math.min(row.level, 12) }, (_, i) => (
                        <span key={i} className="toj-pip" />
                      ))}
                    </span>
                  )}{' '}
                  {def.minigame && row.level === 0
                    ? t('raise-opens', { defaultValue: 'Raising this opens something.' })
                    : t('raise-level', {
                        level: row.level,
                        percent: row.level,
                        defaultValue: 'Level {{level}} · +{{percent}}% output',
                      })}
                </>
              }
              price={`${row.raiseCost} 🍞`}
              meta={t('owned-count', {
                owned: fmtCount(row.owned),
                defaultValue: '{{owned}} owned',
              })}
              affordable={row.canRaise}
              flash={flashed === `raise-${row.id}`}
              disabled={!row.canRaise}
              ariaLabel={t('raise-source', {
                name: def.name,
                cost: row.raiseCost,
                defaultValue: 'Raise {{name}} for {{cost}} manna',
              })}
              onClick={() => {
                templeAudio.play('level');
                flash(`raise-${row.id}`);
                useTempleStore.getState().levelSource(row.id as SourceId);
              }}
            />
          );
        }

        return (
          <TempleRow
            key={row.id}
            icon={<Glyph>{def.icon}</Glyph>}
            name={def.name}
            note={
              row.owned > 0
                ? t('source-output', {
                    rate: row.output,
                    defaultValue: 'making {{rate}} joy per second',
                  })
                : def.tagline
            }
            price={row.cost}
            meta={
              row.affordable
                ? t('owned-count', { owned: fmtCount(row.owned), defaultValue: '{{owned}} owned' })
                : row.wait
                  ? t('in-time', { time: row.wait, defaultValue: 'in {{time}}' })
                  : t('owned-count', {
                      owned: fmtCount(row.owned),
                      defaultValue: '{{owned}} owned',
                    })
            }
            affordable={row.affordable}
            recommended={row.recommended}
            flash={flashed === row.id}
            disabled={!row.affordable}
            ariaLabel={t('buy-source', {
              count: Math.max(1, row.count),
              name: def.name,
              cost: row.cost,
              defaultValue: 'Buy {{count}} {{name}} for {{cost}} joy',
            })}
            onClick={() => {
              templeAudio.play(row.owned >= 25 ? 'purchaseBig' : 'purchase');
              flash(row.id);
              useTempleStore.getState().buySource(row.id as SourceId);
            }}
          />
        );
      })}
    </>
  );
}

/**
 * The globes, at the top of the shop.
 *
 * Deliberately *in* the source list rather than in a panel of its own: a globe
 * is the same kind of decision as a source — spend joy, get rate — and putting
 * it anywhere else would hide the run's biggest purchase behind a tab.
 *
 * Only one is ever on offer, and it only appears once it is within reach, so
 * this is one row that comes and goes rather than a locked ladder of eight.
 */
function GlobeRow() {
  const { t } = useTranslation('c-temple-of-joy');
  const [flashed, flash] = useFlash();

  const state = useTempleSnapshot((s) => {
    const held = computeGlobes(s);
    const next = nextGlobe(held);
    const cost = computeGlobeCost(s);
    return {
      held,
      name: next?.name ?? '',
      tagline: next?.tagline ?? '',
      visible: computeGlobeVisible(s),
      affordable: computeGlobeAffordable(s),
      cost: fmt(cost, s.numberFormat),
      wait: formatTimeTo(cost, s.joy, computeJps(s)),
      multiplier: computeGlobeMultiplier(s),
    };
  }, 400);

  if (!state.visible) return null;

  return (
    <>
      <p className="toj-section">{t('globes-heading', { defaultValue: 'The globes' })}</p>
      <TempleRow
        className="toj-row-globe"
        icon={<Glyph>🔮</Glyph>}
        name={state.name}
        note={state.tagline}
        price={state.cost}
        meta={
          state.affordable
            ? t('globes-held', {
                held: state.held,
                defaultValue: '{{held}} of 8 turning',
              })
            : state.wait
              ? t('in-time', { time: state.wait, defaultValue: 'in {{time}}' })
              : t('globes-held', { held: state.held, defaultValue: '{{held}} of 8 turning' })
        }
        affordable={state.affordable}
        flash={flashed === 'globe'}
        disabled={!state.affordable}
        ariaLabel={t('globes-buy', {
          name: state.name,
          cost: state.cost,
          defaultValue: 'Buy {{name}} for {{cost}} joy — every globe is ×1.5 joy per second',
        })}
        onClick={() => {
          templeAudio.play('purchaseBig');
          flash('globe');
          useTempleStore.getState().buyGlobe();
        }}
      />
      <p className="toj-panel-note">
        {t('globes-note', {
          current: state.multiplier.toFixed(2),
          defaultValue:
            'Every globe past the first is ×1.5 joy per second and ×1.25 by hand, and takes a share of your sources onto its own surface. Yours are worth ×{{current}} right now.',
        })}
      </p>
    </>
  );
}
