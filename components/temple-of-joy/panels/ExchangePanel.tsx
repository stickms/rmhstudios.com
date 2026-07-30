/**
 * The Indulgence Exchange.
 *
 * Ten lines, prices that wander on a one-minute beat, and a warehouse that
 * caps how much you can hold. The sparkline is the whole interface: a chart
 * that has been falling for six days is the best thing you can find in the
 * morning, and no amount of clicking will produce one.
 *
 * The chart is a plain `<path>` rather than a charting library — thirty-two
 * points is not a dependency's worth of problem, and this way it inherits the
 * theme's gold without any configuration.
 */
'use client';

import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import { fmt } from '@/lib/temple-of-joy/numbers';
import type { GoodId } from '@/lib/temple-of-joy/types';
import { GOODS, GOOD_MAP, trendOf, unitValue } from '@/lib/temple-of-joy/minigames/exchange';
import { computeGrossJps } from '@/lib/temple-of-joy/engine';
import { goodCapacity } from '@/lib/temple-of-joy/actions';
import { useTempleSnapshot, useTempleValue } from '../hooks';
import { TempleButton, TempleRow, TempleSection } from '../ui';

export function ExchangePanel() {
  const { t } = useTranslation('c-temple-of-joy');
  const focus = useTempleValue((s) => s.exchange.focus);

  const market = useTempleSnapshot((s) => {
    const jps = computeGrossJps(s);
    const unit = unitValue(jps);

    return {
      format: s.numberFormat,
      joy: s.joy,
      unit,
      profit: s.exchange.lifetimeProfit,
      lines: GOODS.map((good) => {
        const line = s.exchange.goods[good.id];
        return {
          id: good.id,
          price: line.price,
          held: line.held,
          capacity: goodCapacity(s, good.id),
          trend: trendOf(line),
          history: line.history.join(','),
          canBuy: s.joy >= line.price * unit && line.held < goodCapacity(s, good.id),
        };
      }),
    };
  }, 500);

  const focused = market.lines.find((line) => line.id === focus) ?? market.lines[0]!;
  const focusDef = GOOD_MAP[focused.id];

  return (
    <>
      <p className="toj-panel-note">
        {t('exchange-note', {
          defaultValue:
            'Prices move once a minute, awake or not. A unit is worth ten seconds of your rate, so the market scales with the temple rather than falling behind it.',
        })}
      </p>

      <TempleSection>
        {focusDef.name} · {focusDef.symbol}
      </TempleSection>

      <div className="toj-chart">
        <Sparkline points={focused.history} />
      </div>

      <div className="toj-toolbar">
        <span className="toj-panel-sub">
          {t('exchange-price', {
            price: focused.price.toFixed(2),
            value: fmt(focused.price * market.unit, market.format),
            defaultValue: '{{price}} · {{value}} joy',
          })}{' '}
          <span className="toj-trend" data-up={focused.trend >= 0}>
            {focused.trend >= 0 ? '▲' : '▼'} {Math.abs(focused.trend).toFixed(1)}%
          </span>
        </span>
        <span className="toj-panel-sub">
          {t('exchange-held', {
            held: focused.held,
            capacity: focused.capacity,
            defaultValue: '{{held}} / {{capacity}} held',
          })}
        </span>
      </div>

      <div className="toj-desk">
        {[1, 10, 'max'].map((amount) => (
          <TempleButton
            key={`buy-${amount}`}
            size="sm"
            tone={null}
            disabled={!focused.canBuy}
            onClick={() => {
              templeAudio.play('trade');
              useTempleStore
                .getState()
                .buyGood(
                  focused.id as GoodId,
                  amount === 'max' ? focused.capacity : Number(amount),
                );
            }}
          >
            {t('buy-units', {
              amount: amount === 'max' ? t('max', { defaultValue: 'Max' }) : amount,
              defaultValue: 'Buy {{amount}}',
            })}
          </TempleButton>
        ))}
        {[1, 10, 'max'].map((amount) => (
          <TempleButton
            key={`sell-${amount}`}
            size="sm"
            variant={focused.held > 0 ? 'gold' : 'plain'}
            tone={null}
            disabled={focused.held === 0}
            onClick={() => {
              templeAudio.play('trade');
              useTempleStore
                .getState()
                .sellGood(focused.id as GoodId, amount === 'max' ? focused.held : Number(amount));
            }}
          >
            {t('sell-units', {
              amount: amount === 'max' ? t('all', { defaultValue: 'All' }) : amount,
              defaultValue: 'Sell {{amount}}',
            })}
          </TempleButton>
        ))}
      </div>

      <TempleSection>{t('exchange-floor', { defaultValue: 'The floor' })}</TempleSection>
      {market.lines.map((line) => {
        const def = GOOD_MAP[line.id];
        return (
          <TempleRow
            key={line.id}
            icon={<span className="toj-row-count">{def.symbol}</span>}
            name={def.name}
            note={
              <span className="toj-trend" data-up={line.trend >= 0}>
                {line.trend >= 0 ? '▲' : '▼'} {Math.abs(line.trend).toFixed(1)}%
              </span>
            }
            price={line.price.toFixed(2)}
            meta={
              line.held > 0
                ? t('exchange-holding', { held: line.held, defaultValue: '{{held}} held' })
                : undefined
            }
            affordable={line.id === focused.id}
            onClick={() => {
              templeAudio.play('tab');
              useTempleStore.getState().focusGood(line.id as GoodId);
            }}
          />
        );
      })}

      <div className="toj-setting">
        <span className="toj-setting-label">
          <span className="toj-setting-name">
            {t('exchange-profit', { defaultValue: 'Taken in all time' })}
          </span>
        </span>
        <span className="toj-setting-value">{fmt(market.profit, market.format)}</span>
      </div>
    </>
  );
}

/**
 * Thirty-two prices as one line and one fill.
 *
 * Scaled to its own min and max rather than to zero: the interesting question
 * is "which way has this been going", and a chart anchored at zero flattens
 * exactly the movement the player is here to read.
 */
function Sparkline({ points }: { points: string }) {
  const values = points.split(',').map(Number).filter(Number.isFinite);
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 100;
  const height = 40;

  const coords = values.map((value, i) => {
    const x = (i / (values.length - 1)) * width;
    // 4px of padding top and bottom so the stroke is never clipped.
    const y = height - 4 - ((value - min) / span) * (height - 8);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="presentation">
      <path
        className="toj-chart-fill"
        d={`M0,${height} L${coords.join(' L')} L${width},${height} Z`}
      />
      <path
        className="toj-chart-line"
        d={`M${coords.join(' L')}`}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
