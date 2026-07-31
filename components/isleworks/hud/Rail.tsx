'use client';

/**
 * Isleworks — the right rail.
 *
 * Four stacked panels, in the order a player needs them:
 *
 *  1. **Inspector** — only present when something is selected, and first when it
 *     is, because you clicked a building to read about *that building*.
 *  2. **Objectives** — the next three, nearest-to-done first. Completed ones
 *     surface a claim button; that is the loudest control in the HUD.
 *  3. **Events** — only present while something is happening.
 *  4. **City** — tax rate and the balance sheet, the two things you change
 *     rarely and check often.
 *
 * On a narrow screen the whole rail turns into a horizontal strip under the
 * status bar (see `isleworks.css`), so nothing is unreachable on a phone.
 */

import { CircleAlert, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { tryGetDefinition } from '@/lib/isleworks/catalog';
import { objectiveDefinition, activeObjectives } from '@/lib/isleworks/objectives';
import { CATEGORY_COLORS } from '@/lib/isleworks/palette';
import { useIsleworks } from '@/lib/isleworks/store';
import type { BuildingWarning, CityState } from '@/lib/isleworks/types';

import { CatalogIcon } from './icons';

const WARNING_TEXT: Record<BuildingWarning, { key: string; fallback: string }> = {
  'no-road': { key: 'warn-no-road', fallback: 'No road access' },
  'no-power': { key: 'warn-no-power', fallback: 'No power' },
  'no-water': { key: 'warn-no-water', fallback: 'No water' },
  congested: { key: 'warn-congested', fallback: 'Traffic jam' },
  'no-workers': { key: 'warn-no-workers', fallback: 'Not enough workers' },
  polluted: { key: 'warn-polluted', fallback: 'Badly polluted' },
  abandoned: { key: 'warn-abandoned', fallback: 'Abandoned' },
};

export function Rail() {
  const city = useIsleworks((s) => s.city);
  const selectedId = useIsleworks((s) => s.selectedId);

  return (
    <div className="isw-rail">
      {selectedId && <Inspector city={city} selectedId={selectedId} />}
      <Objectives />
      {city.events.length > 0 && <Events city={city} />}
      <CityPanel />
    </div>
  );
}

function Inspector({ city, selectedId }: { city: CityState; selectedId: string }) {
  const { t } = useTranslation('c-isleworks');
  const select = useIsleworks((s) => s.select);
  const instance = city.buildings.find((b) => b.instanceId === selectedId);
  const def = instance ? tryGetDefinition(instance.definitionId) : undefined;
  if (!instance || !def) return null;

  const tile = city.tiles[instance.gridY * city.width + instance.gridX];

  return (
    <section className="isw-panel isw-section">
      <div className="isw-section-title">
        {t('inspector', { defaultValue: 'Selected' })}
        <button
          type="button"
          className="isw-btn"
          style={{ height: 24, minWidth: 24, padding: '0 8px' }}
          onClick={() => select(null)}
        >
          {t('close', { defaultValue: 'Close' })}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginBottom: 8 }}>
        <span className="isw-card-swatch" style={{ background: CATEGORY_COLORS[def.category] }}>
          <CatalogIcon id={def.iconId} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="isw-card-name">
            {def.name}
            {instance.level > 1 ? ` · L${instance.level}` : ''}
          </div>
          <div className="isw-card-meta">
            {t('built-month', { defaultValue: 'Built month {{n}}', n: instance.builtAtMonth })}
          </div>
        </div>
      </div>

      {instance.warnings.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
          {instance.warnings.map((warning) => (
            <span key={warning} className="isw-chip isw-chip--bad">
              <CircleAlert size={11} aria-hidden />
              {t(WARNING_TEXT[warning].key, { defaultValue: WARNING_TEXT[warning].fallback })}
            </span>
          ))}
        </div>
      )}

      <Meter
        label={t('efficiency', { defaultValue: 'Efficiency' })}
        value={instance.efficiency}
        tone={instance.efficiency > 0.7 ? 'good' : instance.efficiency > 0.35 ? 'warn' : 'bad'}
      />
      <Meter
        label={t('condition', { defaultValue: 'Condition' })}
        value={instance.condition}
        tone={instance.condition > 0.6 ? 'good' : 'warn'}
      />

      <dl style={{ marginTop: 8 }}>
        {def.housing ? (
          <Row
            label={t('residents', { defaultValue: 'Residents' })}
            value={`${instance.occupiedResidents}`}
          />
        ) : null}
        {def.jobs ? (
          <Row
            label={t('workers', { defaultValue: 'Workers' })}
            value={`${instance.occupiedJobs}/${def.jobs}`}
          />
        ) : null}
        <Row label={t('upkeep', { defaultValue: 'Upkeep' })} value={`${def.upkeep}/mo`} />
        {tile ? (
          <>
            <Row
              label={t('land-value', { defaultValue: 'Land value' })}
              value={`${Math.round(tile.landValue)}`}
            />
            <Row
              label={t('pollution', { defaultValue: 'Pollution' })}
              value={`${Math.round(tile.pollution)}`}
            />
          </>
        ) : null}
      </dl>

      <p className="isw-objective-hint" style={{ marginTop: 8 }}>
        {def.description}
      </p>
    </section>
  );
}

function Objectives() {
  const { t } = useTranslation('c-isleworks');
  const city = useIsleworks((s) => s.city);
  const claim = useIsleworks((s) => s.claimObjective);
  const shown = activeObjectives(city, 3);

  if (!shown.length) {
    return (
      <section className="isw-panel isw-section">
        <div className="isw-section-title">{t('objectives', { defaultValue: 'Objectives' })}</div>
        <p className="isw-objective-hint">
          {t('objectives-done', {
            defaultValue: 'Every milestone claimed. The island is yours to shape.',
          })}
        </p>
      </section>
    );
  }

  return (
    <section className="isw-panel isw-section">
      <div className="isw-section-title">
        {t('objectives', { defaultValue: 'Objectives' })}
        <Trophy size={12} aria-hidden />
      </div>
      {shown.map((progress) => {
        const def = objectiveDefinition(progress.id);
        if (!def) return null;
        return (
          <div key={progress.id} className="isw-objective">
            <div className="isw-objective-head">
              <span className="isw-objective-title">{def.title}</span>
              {progress.complete ? (
                <button
                  type="button"
                  className="isw-btn isw-btn--primary"
                  onClick={() => claim(def.id)}
                >
                  {t('claim', { defaultValue: 'Claim {{n}}', n: def.reward })}
                </button>
              ) : (
                <span className="isw-chip">{Math.round(progress.progress * 100)}%</span>
              )}
            </div>
            <p className="isw-objective-hint">{def.hint}</p>
            <div className="isw-bar">
              <div
                className={`isw-bar-fill${progress.complete ? ' isw-bar-fill--good' : ''}`}
                style={{ width: `${Math.round(progress.progress * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Events({ city }: { city: CityState }) {
  const { t } = useTranslation('c-isleworks');
  return (
    <section className="isw-panel isw-section">
      <div className="isw-section-title">{t('events', { defaultValue: 'Happening now' })}</div>
      {city.events.map((event) => (
        <div key={event.id} className="isw-event">
          <span
            className="isw-card-swatch"
            style={{
              background:
                event.tone === 'good'
                  ? 'var(--isw-good)'
                  : event.tone === 'bad'
                    ? 'var(--isw-bad)'
                    : 'var(--isw-cool)',
            }}
            aria-hidden
          />
          <div style={{ minWidth: 0 }}>
            <div className="isw-event-title">{event.title}</div>
            <p className="isw-event-body">{event.body}</p>
            <span className="isw-chip" style={{ marginTop: 4 }}>
              {t('months-left', { defaultValue: '{{n}} months left', n: event.remaining })}
            </span>
          </div>
        </div>
      ))}
    </section>
  );
}

function CityPanel() {
  const { t } = useTranslation('c-isleworks');
  const city = useIsleworks((s) => s.city);
  const setTaxRate = useIsleworks((s) => s.setTaxRate);
  const stats = city.stats;

  return (
    <section className="isw-panel isw-section">
      <div className="isw-section-title">{t('city', { defaultValue: 'City' })}</div>

      <label className="isw-kv" htmlFor="isw-tax" style={{ marginBottom: 2 }}>
        <span style={{ color: 'var(--isw-ink-soft)' }}>
          {t('tax-rate', { defaultValue: 'Tax rate' })}
        </span>
        <span style={{ fontWeight: 650 }}>{city.taxRate}%</span>
      </label>
      <input
        id="isw-tax"
        type="range"
        min={4}
        max={20}
        step={1}
        value={city.taxRate}
        onChange={(event) => setTaxRate(Number(event.target.value))}
        style={{ width: '100%', accentColor: 'var(--isw-cool)' }}
      />
      <p className="isw-objective-hint" style={{ marginTop: 2, marginBottom: 8 }}>
        {t('tax-hint', {
          defaultValue: 'Citizens consider 9% fair. Anything higher earns more and pleases less.',
        })}
      </p>

      <dl>
        <Row
          label={t('taxes', { defaultValue: 'Taxes' })}
          value={`+${Math.round(stats.taxIncome)}`}
        />
        <Row
          label={t('trade', { defaultValue: 'Trade' })}
          value={`+${Math.round(stats.tradeIncome)}`}
        />
        <Row
          label={t('upkeep', { defaultValue: 'Upkeep' })}
          value={`−${Math.round(stats.upkeep)}`}
        />
        <Row
          label={t('net', { defaultValue: 'Per month' })}
          value={`${stats.netIncome >= 0 ? '+' : '−'}${Math.abs(Math.round(stats.netIncome))}`}
          tone={stats.netIncome >= 0 ? 'good' : 'bad'}
        />
      </dl>

      <div className="isw-section-title" style={{ marginTop: 10 }}>
        {t('services', { defaultValue: 'Service cover' })}
      </div>
      <Meter label={t('health', { defaultValue: 'Health' })} value={stats.coverage.health} />
      <Meter
        label={t('education', { defaultValue: 'Education' })}
        value={stats.coverage.education}
      />
      <Meter label={t('safety', { defaultValue: 'Safety' })} value={stats.coverage.safety} />
      <Meter label={t('fire', { defaultValue: 'Fire' })} value={stats.coverage.fire} />
      <Meter label={t('leisure', { defaultValue: 'Leisure' })} value={stats.coverage.leisure} />
    </section>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="isw-kv">
      <dt>{label}</dt>
      <dd
        style={tone ? { color: tone === 'good' ? 'var(--isw-good)' : 'var(--isw-bad)' } : undefined}
      >
        {value}
      </dd>
    </div>
  );
}

function Meter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'good' | 'warn' | 'bad';
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const resolved = tone ?? (pct >= 70 ? 'good' : pct >= 35 ? 'warn' : 'bad');
  return (
    <div style={{ marginBottom: 6 }}>
      <div className="isw-kv" style={{ padding: '1px 0' }}>
        <span style={{ color: 'var(--isw-ink-soft)', fontSize: 11 }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 650 }}>{pct}%</span>
      </div>
      <div className="isw-bar">
        <div className={`isw-bar-fill isw-bar-fill--${resolved}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
