/**
 * The run's top bar: HP as a heated gauge, gold, the act and floor, the deck, the relic rack and the controls
 * (help, sound, deck, leave). Shared by every screen of a run.
 */
import { useTranslation } from 'react-i18next';
import { relicDef } from '@features/signal-forge/engine/data/relics';
import { floorOf } from '@features/signal-forge/engine/run';
import type { RunState } from '@features/signal-forge/engine/types';
import { Icon } from './art/glyphs';

export function RelicBadge({ id, size = 34 }: { id: string; size?: number }) {
  const { t } = useTranslation('c-signal-forge');
  const d = relicDef(id);
  const name = t(`relic.${id}.name`, { defaultValue: d.name });
  const text = t(`relic.${id}.text`, { defaultValue: d.text });
  // A relic is a stamped brass token; the glyph is picked from the id so each looks its own.
  const hue = [...id].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const ring = d.rarity === 'boss' ? '#FF4D3D' : d.rarity === 'rare' ? '#FFD27A' : d.rarity === 'uncommon' ? '#8FC6D4' : '#B8743A';
  const glyphs = ['heat', 'block', 'energy', 'static', 'anvil', 'coolant', 'strength', 'gold', 'elite', 'bleed'] as const;
  const glyph = glyphs[hue % glyphs.length]!;
  return (
    <span className="sf-relic" tabIndex={0} aria-label={`${name}: ${text}`} data-tip={`${name}\n${text}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 34 34" width={size} height={size} aria-hidden>
        <polygon points="17,1 31,9 31,25 17,33 3,25 3,9" fill="#2A1C12" stroke={ring} strokeWidth={2} />
        <circle cx={17} cy={17} r={9.5} fill="#120C08" stroke={ring} strokeOpacity={0.5} />
      </svg>
      <span className="sf-relic-glyph">
        <Icon name={glyph} size={size * 0.46} color={ring} />
      </span>
    </span>
  );
}

interface Props {
  run: RunState;
  onHelp: () => void;
  onDeck: () => void;
  onMenu: () => void;
  onToggleSound: () => void;
  muted: boolean;
}

export function RunHud({ run, onHelp, onDeck, onMenu, onToggleSound, muted }: Props) {
  const { t } = useTranslation('c-signal-forge');
  const hpPct = Math.max(0, Math.min(1, run.hp / run.maxHp));
  return (
    <header className="sf-hud">
      <div className="sf-hud-hp" role="meter" aria-valuemin={0} aria-valuemax={run.maxHp} aria-valuenow={run.hp} aria-label={t('hud.hp', { defaultValue: 'HP' })}>
        <Icon name="hp" size={16} color="#FF6B5A" />
        <span className="sf-gauge">
          <span className="sf-gauge-fill" style={{ width: `${hpPct * 100}%` }} />
        </span>
        <span className="sf-mono">
          {run.hp}/{run.maxHp}
        </span>
      </div>
      <div className="sf-hud-stat" aria-label={t('hud.gold-aria', { defaultValue: '{{n}} gold', n: run.gold })}>
        <Icon name="gold" size={16} color="#FFD27A" />
        <span className="sf-mono">{run.gold}</span>
      </div>
      <div className="sf-hud-stat sf-hud-floor">
        <span className="sf-label">{t('hud.act', { defaultValue: 'Act {{n}}', n: run.act })}</span>
        <span className="sf-mono">{t('hud.floor', { defaultValue: 'Floor {{n}}', n: floorOf(run) })}</span>
        {run.ascension > 0 && <span className="sf-asc-chip">{t('hud.asc', { defaultValue: 'A{{n}}', n: run.ascension })}</span>}
        <span className="sf-mode-chip">{run.mode === 'timed' ? t('mode.timed', { defaultValue: 'Timed' }) : t('mode.steady', { defaultValue: 'Steady' })}</span>
      </div>
      <div className="sf-hud-relics" aria-label={t('hud.relics', { defaultValue: 'Relics' })}>
        {run.relics.map((id) => (
          <RelicBadge key={id} id={id} size={30} />
        ))}
      </div>
      <div className="sf-hud-actions">
        <button type="button" className="sf-iconbtn" onClick={onDeck} aria-label={t('hud.deck-aria', { defaultValue: 'View deck ({{n}} cards)', n: run.deck.length })}>
          <Icon name="deck" />
          <span className="sf-mono">{run.deck.length}</span>
        </button>
        <button type="button" className="sf-iconbtn" onClick={onToggleSound} aria-pressed={!muted} aria-label={muted ? t('hud.sound-on', { defaultValue: 'Turn sound on' }) : t('hud.sound-off', { defaultValue: 'Turn sound off' })}>
          <Icon name={muted ? 'mute' : 'sound'} />
        </button>
        <button type="button" className="sf-iconbtn" onClick={onHelp} aria-label={t('hud.help', { defaultValue: 'How to play' })}>
          <Icon name="help" />
        </button>
        <button type="button" className="sf-iconbtn" onClick={onMenu} aria-label={t('hud.menu', { defaultValue: 'Menu' })}>
          <Icon name="flag" />
        </button>
      </div>
    </header>
  );
}
