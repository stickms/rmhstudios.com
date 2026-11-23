/**
 * Project Vega's play-screen controls: the top bar (wave, integrity, serum, score, speed, pause, manual, sound)
 * and the side panel (the formulary of instruments, the selected instrument's file, the next wave's manifest and
 * the start control). On a phone the side panel sits under the board.
 */
import { createContext, useContext } from 'react';
import { ArrowLeft, BookOpen, FastForward, Pause, Volume2, VolumeX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { TOWER_ORDER, TOWERS, WAVES, ECONOMY, type TargetMode } from '@features/vega/engine/data';
import { useGameStore } from '@features/vega/engine/GameState';
import type { VegaGame } from '@features/vega/engine/VegaGame';
import { InstrumentGlyph, SpecimenGlyph } from './Glyph';
import { useVegaNames } from './names';

export const GameCtx = createContext<{ current: VegaGame | null }>({ current: null });
const useGame = () => useContext(GameCtx);

export function TopBar({ muted, onToggleMute }: { muted: boolean; onToggleMute: () => void }) {
  const { t } = useTranslation('c-vega');
  const fmt = useLocaleFormat();
  const names = useVegaNames();
  const hud = useGameStore((s) => s.hud);
  const mapId = useGameStore((s) => s.mapId);
  const setPaused = useGameStore((s) => s.setPaused);
  const setManualOpen = useGameStore((s) => s.setManualOpen);
  const game = useGame();
  const low = hud.integrity <= 5;
  const waveLabel =
    hud.wave > WAVES.GOAL
      ? t('overtime-wave', { defaultValue: 'Overtime {{wave}}', wave: hud.wave })
      : `${hud.wave} / ${WAVES.GOAL}`;

  return (
    <header className="vg-hud">
      <a href="/games" className="vg-icon-btn" aria-label={t('back-to-games', { defaultValue: 'Back to games' })}>
        <ArrowLeft aria-hidden size={18} />
      </a>
      <div className="vg-hud-stat vg-hud-title" style={{ minWidth: 0 }}>
        <span>{names.map(mapId)}</span>
        <span className="vg-title" style={{ fontFamily: 'var(--vg-display)', fontSize: 18 }}>
          {t('project-vega', { defaultValue: 'Project Vega' })}
        </span>
      </div>
      <div className="vg-hud-stat">
        <span>{t('hud-wave', { defaultValue: 'Wave' })}</span>
        <span>{waveLabel}</span>
      </div>
      <div
        className="vg-hud-stat"
        aria-label={t('hud-integrity-aria', {
          defaultValue: 'Integrity {{n}} of {{max}}',
          n: hud.integrity,
          max: ECONOMY.START_INTEGRITY,
        })}
      >
        <span>{t('hud-integrity', { defaultValue: 'Integrity' })}</span>
        <span style={{ color: low ? 'var(--vg-blood)' : undefined }}>{hud.integrity}</span>
        <span className={low ? 'vg-integrity is-low' : 'vg-integrity'} aria-hidden>
          {Array.from({ length: ECONOMY.START_INTEGRITY }, (_, i) => (
            <i key={i} className={i < hud.integrity ? undefined : 'is-lost'} />
          ))}
        </span>
      </div>
      <div className="vg-hud-stat">
        <span>{t('hud-serum', { defaultValue: 'Serum' })}</span>
        <span style={{ color: 'var(--vg-mint)' }}>{hud.serum}</span>
      </div>
      <div className="vg-hud-stat">
        <span>{t('hud-score', { defaultValue: 'Score' })}</span>
        <span>{fmt.number(hud.score)}</span>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
        <button
          type="button"
          className="vg-icon-btn"
          aria-pressed={hud.speed === 2}
          aria-label={t('speed-toggle', { defaultValue: 'Double speed' })}
          title={t('speed-toggle-hint', { defaultValue: 'Double speed (F)' })}
          onClick={() => game.current?.toggleSpeed()}
        >
          <FastForward aria-hidden size={18} />
        </button>
        <button
          type="button"
          className="vg-icon-btn"
          aria-label={
            muted
              ? t('sound-on', { defaultValue: 'Turn sound on' })
              : t('sound-off', { defaultValue: 'Turn sound off' })
          }
          onClick={onToggleMute}
        >
          {muted ? <VolumeX aria-hidden size={18} /> : <Volume2 aria-hidden size={18} />}
        </button>
        <button
          type="button"
          className="vg-icon-btn"
          aria-label={t('open-manual', { defaultValue: 'Open the manual' })}
          onClick={() => setManualOpen(true)}
        >
          <BookOpen aria-hidden size={18} />
        </button>
        <button
          type="button"
          className="vg-icon-btn"
          aria-label={t('pause', { defaultValue: 'Pause' })}
          onClick={() => setPaused(true)}
        >
          <Pause aria-hidden size={18} />
        </button>
      </div>
    </header>
  );
}

export function SidePanel() {
  const { t } = useTranslation('c-vega');
  return (
    <aside className="vg-side" aria-label={t('controls-aria', { defaultValue: 'Instruments and waves' })}>
      <WaveControl />
      <SelectedFile />
      <Formulary />
      <NextWave />
    </aside>
  );
}

function WaveControl() {
  const { t } = useTranslation('c-vega');
  const hud = useGameStore((s) => s.hud);
  const game = useGame();
  const hint = useGameStore((st) => st.tutorial.step === 'start');
  const inWave = hud.phase === 'wave';
  const label = inWave
    ? hud.canStart
      ? t('call-early', { defaultValue: 'Call wave {{wave}} early', wave: hud.wave + 1 })
      : t('wave-in-progress', { defaultValue: 'Wave {{wave}} in progress', wave: hud.wave })
    : t('start-wave', { defaultValue: 'Start wave {{wave}}', wave: hud.wave + 1 });
  return (
    <div className="vg-side-section">
      <button
        type="button"
        data-vega-start
        data-hint={hint || undefined}
        className="vg-btn vg-btn-primary"
        style={{ width: '100%' }}
        disabled={!hud.canStart || hud.phase === 'over'}
        onClick={() => game.current?.startWave()}
      >
        {label}
      </button>
      <p className="vg-mono" style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--vg-faint)' }}>
        {inWave
          ? t('early-hint', { defaultValue: 'Calling early pays serum and scores x1.25.' })
          : t('build-hint', { defaultValue: 'Build phase: the board waits for you. Space starts.' })}
      </p>
    </div>
  );
}

function Formulary() {
  const { t } = useTranslation('c-vega');
  const names = useVegaNames();
  const build = useGameStore((s) => s.build);
  const serum = useGameStore((s) => s.hud.serum);
  const hint = useGameStore((s) => s.tutorial.step === 'select');
  const game = useGame();
  return (
    <div className="vg-side-section" data-vega-formulary>
      <h2 className="vg-tag">{t('formulary', { defaultValue: 'Formulary' })}</h2>
      <div className="vg-roster">
        {TOWER_ORDER.map((type, i) => {
          const cost = TOWERS[type].tiers[0].cost;
          return (
            <button
              key={type}
              type="button"
              data-vega-tower={type}
              data-hint={(hint && type === 'SYNAPSE') || undefined}
              className={serum < cost ? 'vg-rx is-poor' : 'vg-rx'}
              aria-pressed={build === type}
              title={names.towerBlurb(type)}
              onClick={() => game.current?.chooseBuild(build === type ? null : type)}
            >
              <InstrumentGlyph type={type} size={34} />
              <span style={{ minWidth: 0 }}>
                <span className="vg-rx-name">{names.tower(type)}</span>
                <span className="vg-rx-cost">{cost}</span>
              </span>
              <span className="vg-key" aria-hidden>
                {i + 1}
              </span>
            </button>
          );
        })}
      </div>
      {build && (
        <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.45, color: 'var(--vg-muted)' }}>
          {names.towerBlurb(build)}
        </p>
      )}
    </div>
  );
}

function SelectedFile() {
  const { t } = useTranslation('c-vega');
  const fmt = useLocaleFormat();
  const names = useVegaNames();
  const sel = useGameStore((s) => s.selected);
  const serum = useGameStore((s) => s.hud.serum);
  const hint = useGameStore((s) => s.tutorial.step === 'upgrade');
  const game = useGame();
  if (!sel) return null;
  const def = TOWERS[sel.type];
  const tiers = ['I', 'II', 'III'];
  const cur = def.tiers[sel.tier as 0 | 1 | 2];
  const next = sel.tier < 2 ? def.tiers[(sel.tier + 1) as 1 | 2] : null;
  const targets = def.kind !== null && def.attack !== 'aura';
  return (
    <div className="vg-side-section" data-vega-selected>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <InstrumentGlyph type={sel.type} size={44} tier={sel.tier} />
        <div>
          <h2 className="vg-title" style={{ margin: 0, fontSize: 22 }}>
            {names.tower(sel.type)}{' '}
            <span className="vg-mono" style={{ fontSize: 14, color: 'var(--vg-mint)' }}>
              {tiers[sel.tier]}
            </span>
          </h2>
          {sel.stunned && (
            <p style={{ margin: 0, color: 'var(--vg-blood)', fontSize: 13 }}>
              {t('severed', { defaultValue: 'Severed' })}
            </p>
          )}
        </div>
      </div>
      <dl className="vg-stat-grid">
        {def.attack !== 'income' && def.attack !== 'support' && (
          <>
            <dt>{t('stat-damage', { defaultValue: 'Damage' })}</dt>
            <dd>
              {cur.damage}
              {next ? <span style={{ color: 'var(--vg-mint)' }}> → {next.damage}</span> : null}
            </dd>
          </>
        )}
        {def.attack !== 'income' && (
          <>
            <dt>{t('stat-range', { defaultValue: 'Range' })}</dt>
            <dd>
              {cur.range}
              {next ? <span style={{ color: 'var(--vg-mint)' }}> → {next.range}</span> : null}
            </dd>
          </>
        )}
        {def.attack === 'income' && (
          <>
            <dt>{t('stat-income', { defaultValue: 'Per wave' })}</dt>
            <dd>
              {cur.income}
              {next ? <span style={{ color: 'var(--vg-mint)' }}> → {next.income}</span> : null}
            </dd>
          </>
        )}
        <dt>{t('stat-kills', { defaultValue: 'Kills' })}</dt>
        <dd>{sel.kills}</dd>
        <dt>{t('stat-dealt', { defaultValue: 'Dealt' })}</dt>
        <dd>{fmt.number(sel.damage)}</dd>
      </dl>
      {targets && (
        <div className="vg-segment" role="group" aria-label={t('targeting', { defaultValue: 'Targeting' })}>
          {(['first', 'strong', 'last'] as TargetMode[]).map((m) => (
            <button key={m} type="button" aria-pressed={sel.mode === m} onClick={() => game.current?.setTargetMode(m)}>
              {names.mode(m)}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button
          type="button"
          data-vega-upgrade
          data-hint={hint || undefined}
          className="vg-btn vg-btn-sm"
          style={{ flex: 1 }}
          disabled={sel.upgradeCost === null || serum < sel.upgradeCost}
          onClick={() => game.current?.upgradeSelected()}
        >
          {sel.upgradeCost === null
            ? t('max-tier', { defaultValue: 'Tier III' })
            : t('upgrade-to', { defaultValue: 'Upgrade {{cost}}', cost: sel.upgradeCost })}
        </button>
        <button type="button" className="vg-btn vg-btn-sm vg-btn-danger" onClick={() => game.current?.sellSelected()}>
          {t('sell-for', { defaultValue: 'Sell {{value}}', value: sel.sell })}
        </button>
      </div>
    </div>
  );
}

function NextWave() {
  const { t } = useTranslation('c-vega');
  const names = useVegaNames();
  const hud = useGameStore((s) => s.hud);
  if (hud.phase === 'over') return null;
  return (
    <div className="vg-side-section">
      <h2 className={hud.nextBoss ? 'vg-tag is-danger' : 'vg-tag'}>
        {hud.nextBoss
          ? t('next-boss', { defaultValue: 'Wave {{wave}}: boss', wave: hud.wave + 1 })
          : t('next-wave', { defaultValue: 'Wave {{wave}} manifest', wave: hud.wave + 1 })}
      </h2>
      <div className="vg-chips">
        {hud.next.map(({ type, count }) => (
          <span
            key={type}
            className={type === hud.nextBoss ? 'vg-chip is-boss' : 'vg-chip'}
            title={names.enemyBlurb(type)}
          >
            <SpecimenGlyph type={type} size={22} />
            {names.enemy(type)} ×{count}
          </span>
        ))}
      </div>
    </div>
  );
}
