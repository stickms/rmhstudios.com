/**
 * A Signal Forge card: a chamfered plate of charred steel with a copper circuit border in the card's waveform
 * colour, the cost stamped in a hex nut, an oscilloscope window showing the waveform, and rivets that count the
 * rarity (2 copper, 3 blued steel, 4 gold). Tempered cards get a molten edge and a "+".
 */
import { useTranslation } from 'react-i18next';
import { useContentText } from './useContentText';
import { label } from '@features/signal-forge/engine/labels';
import type { CardDef } from '@features/signal-forge/engine/types';
import { WAVE_COLOR, WaveGlyph } from './art/glyphs';
import { cardLines } from './text';

const RIVET: Record<CardDef['rarity'], { n: number; color: string }> = {
  starter: { n: 1, color: '#8A6A50' },
  common: { n: 2, color: '#B8743A' },
  uncommon: { n: 3, color: '#8FC6D4' },
  rare: { n: 4, color: '#FFD27A' },
  glitch: { n: 0, color: '#666' },
};

interface Props {
  def: CardDef;
  upgraded?: boolean;
  onPhrase?: boolean;
  disabled?: boolean;
  onPlay?: () => void;
  /** Extra line under the name (a shop price, a keyboard hint). */
  hint?: string;
  size?: 'hand' | 'grid';
  ariaLabel?: string;
}

export function CardView({ def, upgraded, onPhrase, disabled, onPlay, hint, size = 'hand', ariaLabel }: Props) {
  const { t } = useTranslation('c-signal-forge');
  const lbl = useContentText();
  const color = def.rarity === 'glitch' ? '#7D7D7D' : WAVE_COLOR[def.wave];
  const name = lbl(`card.${def.id}.name`, def.name) + (upgraded ? '+' : '');
  const lines = cardLines(def, t);
  const rivets = RIVET[def.rarity];
  const waveLabel =
    def.wave === 'any'
      ? t('wave.any', { defaultValue: 'Any waveform' })
      : lbl(`wave.${def.wave}`, label(`wave.${def.wave}`));
  const aria = ariaLabel ?? `${name}. ${t('card.cost-aria', { defaultValue: 'Cost {{n}}', n: def.cost })}. ${waveLabel}. ${lines.join(' ')}`;
  const body = (
    <>
      <svg className="sf-card-frame" viewBox="0 0 132 184" preserveAspectRatio="none" aria-hidden>
        <path d="M10 1 H122 L131 10 V174 L122 183 H10 L1 174 V10 Z" fill="#17110D" stroke={color} strokeWidth={2} />
        <path d="M14 6 H118 L126 14 V170 L118 178 H14 L6 170 V14 Z" fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={1} />
        {/* Circuit traces off the border into the plate. */}
        <path d="M1 60 H12 L18 66 V92 M131 110 H120 L114 116 V140" fill="none" stroke={color} strokeOpacity={0.5} strokeWidth={1.2} />
        <circle cx={18} cy={92} r={2.2} fill={color} fillOpacity={0.7} />
        <circle cx={114} cy={140} r={2.2} fill={color} fillOpacity={0.7} />
        {upgraded && <path d="M10 183 H122 L131 174" fill="none" stroke="#FFB23E" strokeWidth={3} />}
        {Array.from({ length: rivets.n }, (_, i) => (
          <circle key={i} cx={110 - i * 8} cy={174} r={2.2} fill={rivets.color} />
        ))}
      </svg>
      <span className="sf-card-cost" aria-hidden>
        <svg viewBox="0 0 24 24" width="100%" height="100%">
          <polygon points="12,1 22,6.5 22,17.5 12,23 2,17.5 2,6.5" fill="#2A1A0E" stroke="#FF8A2A" strokeWidth={1.6} />
        </svg>
        <b>{def.unplayable ? '-' : def.cost}</b>
      </span>
      <span className="sf-card-name">{name}</span>
      <span className="sf-card-scope" aria-hidden>
        <WaveGlyph wave={def.wave} size={size === 'hand' ? 46 : 52} strokeWidth={2.6} color={def.rarity === 'glitch' ? '#888' : undefined} />
      </span>
      <span className="sf-card-text">
        {lines.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </span>
      {hint && <span className="sf-card-hint">{hint}</span>}
      {onPhrase && <span className="sf-card-notch" aria-hidden />}
    </>
  );
  const cls = `sf-card sf-card--${size} sf-rarity-${def.rarity}${onPhrase ? ' is-on-phrase' : ''}${disabled ? ' is-disabled' : ''}${upgraded ? ' is-up' : ''}`;
  if (!onPlay) {
    return (
      <div className={cls} role="img" aria-label={aria} style={{ ['--sf-wave' as string]: color }}>
        {body}
      </div>
    );
  }
  return (
    <button type="button" className={cls} aria-label={aria} aria-disabled={disabled || undefined} onClick={disabled ? undefined : onPlay} style={{ ['--sf-wave' as string]: color }}>
      {body}
    </button>
  );
}
