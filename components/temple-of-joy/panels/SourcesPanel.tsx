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
import { fmt, fmtCount, formatTimeTo, sharePercent } from '@/lib/temple-of-joy/numbers';
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
  computeTotalLevels,
  computeTotalSources,
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
    // The denominator for every row's share. Summed over ALL sources rather
    // than taken from `computeJps`, because that figure carries the touch
    // bonuses and the Sinners' drain — dividing by it would make the shares add
    // up to something other than a hundred, which is the one thing a percentage
    // has to do.
    const fromSources = SOURCES.reduce((sum, source) => sum + computeSourceJps(s, source.id), 0);

    return SOURCES.filter((source) => computeSourceVisible(s, source.id)).map((source) => {
      const owned = s.sources[source.id] ?? 0;
      const count = s.buyQty === 'max' ? computeMaxAffordable(source.id, owned, s.joy) : s.buyQty;
      const cost = computeSourceCostN(source.id, owned, Math.max(1, count));
      const level = s.sourceLevels[source.id] ?? 0;
      const raiseCost = levelCost(level);
      const output = computeSourceJps(s, source.id);

      return {
        id: source.id,
        owned,
        ownedLabel: fmtCount(owned),
        count,
        level,
        raiseCost,
        canRaise: s.manna.held >= raiseCost,
        cost: fmt(cost, s.numberFormat),
        affordable: s.joy >= cost && count > 0,
        wait: formatTimeTo(cost, s.joy, jps),
        // What this source is contributing right now, which is the honest
        // answer to "is it still worth buying these".
        output: fmt(output, s.numberFormat),
        // And what it is contributing *relative to everything else*, which is
        // the answer to "where should the next purchase go".
        //
        // Suppressed below a tenth of a percent rather than shown as `<0.1`.
        // The ledger says `<0.1` on purpose — there, the question is "is this
        // still doing anything at all". Here the line is a reason to buy, and
        // twelve consecutive rows all reading "<0.1% of your rate" is a column
        // of noise that makes the three rows where the share MATTERS harder to
        // find, not easier.
        share: shareOrNull(output, fromSources),
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
      <Holdings />

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
              owned={row.owned > 0 ? row.ownedLabel : undefined}
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
            owned={row.owned > 0 ? row.ownedLabel : undefined}
            name={def.name}
            note={
              row.owned > 0
                ? row.share
                  ? t('source-output-share', {
                      rate: row.output,
                      percent: row.share,
                      defaultValue: '{{rate}}/s · {{percent}}% of your rate',
                    })
                  : t('source-output', {
                      rate: row.output,
                      defaultValue: 'making {{rate}} joy per second',
                    })
                : def.tagline
            }
            price={row.cost}
            // The count used to live here, and only while you could afford the
            // row — it is a badge on the glyph now, so this line is free to be
            // the one thing it was competing with: how long until you can.
            meta={row.wait ? t('in-time', { time: row.wait, defaultValue: 'in {{time}}' }) : null}
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
 * What the shop is a shop *for* — a standing summary of what you already hold.
 *
 * The shop is a list of things to buy, and a list of things to buy is a poor
 * answer to "what do I have". You could read a price and a countdown for every
 * source in the game and nowhere at all read the two figures that decide the
 * next purchase: how much of this temple there is, and how much of the rate is
 * actually coming from it rather than from the multiplier stack.
 *
 * Three figures, at the top, above the buy controls. `Manna levels` only joins
 * them once any exist, because a zero there teaches nothing about a mechanic
 * you have not met.
 */
function Holdings() {
  const { t } = useTranslation('c-temple-of-joy');

  const held = useTempleSnapshot((s) => {
    const fromSources = SOURCES.reduce((sum, source) => sum + computeSourceJps(s, source.id), 0);
    const jps = computeJps(s);
    return {
      total: computeTotalSources(s),
      kinds: SOURCES.filter((source) => (s.sources[source.id] ?? 0) > 0).length,
      levels: computeTotalLevels(s),
      rate: fmt(fromSources, s.numberFormat),
      // What share of the rate on the counter the sources themselves account
      // for. The rest is the multiplier stack, and knowing which of the two is
      // carrying the run is the whole reason to show it.
      share: jps > 0 ? sharePercent(fromSources, jps) : null,
    };
  }, 600);

  if (held.total === 0) return null;

  return (
    <div className="toj-holdings-strip">
      {/* Labels are terse on purpose. This strip sits above the list in a dock
          that is 230 pixels tall on a phone in landscape, and every word here is
          a word the shop underneath does not get to show. "from sources" is
          implied by the panel it is in. */}
      <Figure
        value={fmtCount(held.total)}
        label={t('holdings-total-kinds', {
          kinds: held.kinds,
          defaultValue: 'owned · {{kinds}} kinds',
        })}
      />
      <Figure
        value={`${held.rate}/s`}
        label={
          held.share
            ? t('holdings-rate-of', {
                percent: held.share,
                defaultValue: '{{percent}}% of your rate',
              })
            : t('holdings-rate', { defaultValue: 'from sources' })
        }
      />
      {held.levels > 0 && (
        <Figure
          value={String(held.levels)}
          label={t('holdings-levels', { defaultValue: 'Manna levels' })}
        />
      )}
    </div>
  );
}

/** A share worth printing on a shop row, or nothing. See the call site. */
function shareOrNull(part: number, total: number): string | null {
  const share = sharePercent(part, total);
  return share === null || share === '<0.1' ? null : share;
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="toj-figure">
      <b className="toj-figure-value">{value}</b>
      <span className="toj-figure-label">{label}</span>
    </div>
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
