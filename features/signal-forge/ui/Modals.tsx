/**
 * Signal Forge overlays: a small modal shell (Escape closes, focus moves in and returns), How to play (the
 * re-openable help), the deck viewer, the Codex (every card, relic and enemy) and the leaderboard.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { label } from '@features/signal-forge/engine/labels';
import { ASCENSION, RHYTHM } from '@features/signal-forge/engine/balance';
import { CARDS } from '@features/signal-forge/engine/data/cards';
import { ENEMIES } from '@features/signal-forge/engine/data/enemies';
import { RELICS } from '@features/signal-forge/engine/data/relics';
import { effectiveCard } from '@features/signal-forge/engine/combat';
import { fetchLeaderboard } from '@features/signal-forge/engine/persistence';
import type { SignalForgeLeaderboardRow } from '@features/signal-forge/engine/signal-forge.contract';
import type { CardInst, Waveform } from '@features/signal-forge/engine/types';
import { useArrival } from '@/components/ui/arrive';
import { EnemyArt } from './art/EnemyArt';
import { Icon, WaveGlyph } from './art/glyphs';
import { CardView } from './CardView';
import { RelicBadge } from './RunHud';

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const { t } = useTranslation('c-signal-forge');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, [tabindex="0"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="sf-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`sf-modal-box${wide ? ' is-wide' : ''}`} ref={ref}>
        <div className="sf-modal-head">
          <h2 className="sf-title">{title}</h2>
          <button type="button" className="sf-iconbtn" onClick={onClose} aria-label={t('close', { defaultValue: 'Close' })}>
            <Icon name="close" />
          </button>
        </div>
        <div className="sf-modal-body">{children}</div>
      </div>
    </div>
  );
}

export function HelpModal({ onClose, onTutorial }: { onClose: () => void; onTutorial?: () => void }) {
  const { t } = useTranslation('c-signal-forge');
  const waves: Waveform[] = ['pulse', 'sine', 'saw', 'noise'];
  return (
    <Modal title={t('help.title', { defaultValue: 'How to play' })} onClose={onClose}>
      <div className="sf-help">
        <section>
          <h3 className="sf-subtitle">{t('help.goal-h', { defaultValue: 'The climb' })}</h3>
          <p>{t('help.goal', { defaultValue: 'Three acts, each a board of chips: fights, elites, events, shops, the Cooling Bay and caches. Beat the act boss to go deeper. Win a run to open the next Ascension.' })}</p>
        </section>
        <section>
          <h3 className="sf-subtitle">{t('help.phrase-h', { defaultValue: 'The phrase' })}</h3>
          <p>{t('help.phrase', { defaultValue: 'Each turn the signal shows a phrase of waveforms. A card whose waveform matches the next slot lands on the phrase: it is multiplied and builds Heat. Finish the phrase to fire a Forge Burst at every enemy.' })}</p>
          <ul className="sf-wave-legend">
            {waves.map((w) => (
              <li key={w}>
                <WaveGlyph wave={w} size={28} />
                <span>{t(`wave.${w}`, { defaultValue: label(`wave.${w}`) })}</span>
              </li>
            ))}
            <li>
              <WaveGlyph wave="any" size={28} />
              <span>{t('wave.any', { defaultValue: 'Any waveform' })}</span>
            </li>
          </ul>
        </section>
        <section>
          <h3 className="sf-subtitle">{t('help.timing-h', { defaultValue: 'Timed and Steady' })}</h3>
          <p>
            {t('help.timing', {
              defaultValue: 'Timed: play on the beat. Perfect x{{p}} and 2 Heat, Good x{{g}}, Late x1. Steady: no clock, every on-phrase card counts as Good (x{{g}}). Pick either when you start a run.',
              p: RHYTHM.mult.perfect,
              g: RHYTHM.mult.good,
            })}
          </p>
        </section>
        <section>
          <h3 className="sf-subtitle">{t('help.heat-h', { defaultValue: 'Heat, Burst and Vent' })}</h3>
          <p>
            {t('help.heat', {
              defaultValue: 'A Forge Burst deals {{base}} plus {{per}} per Heat to every enemy and spends the Heat. Or Vent once a turn: {{vent}} Block per Heat.',
              base: RHYTHM.burstBase,
              per: RHYTHM.burstPerHeat,
              vent: RHYTHM.ventPerHeat,
            })}
          </p>
        </section>
        <section>
          <h3 className="sf-subtitle">{t('help.static-h', { defaultValue: 'Static and Glitch' })}</h3>
          <p>{t('help.static', { defaultValue: 'Each card played off the phrase adds 1 Static. When Static fills up it overloads: a Glitch card enters your discard for the rest of the fight.' })}</p>
        </section>
        <section>
          <h3 className="sf-subtitle">{t('help.intents-h', { defaultValue: 'Intents and statuses' })}</h3>
          <p>{t('help.intents', { defaultValue: 'Enemies show what they will do. Weak hits for less, Vulnerable takes more, Bleed loses HP each turn, Frail gains less Block, a Jammed enemy skips its move. Armor reduces every hit. Phased enemies take half from off-phrase cards.' })}</p>
        </section>
        <section>
          <h3 className="sf-subtitle">{t('help.keys-h', { defaultValue: 'Keys' })}</h3>
          <p>{t('help.keys', { defaultValue: '1 to 9 play a card. V vents. E ends the turn. Q changes target. Tab and Enter work everywhere.' })}</p>
        </section>
        {onTutorial && (
          <button type="button" className="sf-btn sf-btn-cyan" onClick={onTutorial}>
            {t('help.replay-tutorial', { defaultValue: 'Play the tutorial' })}
          </button>
        )}
      </div>
    </Modal>
  );
}

export function DeckModal({ deck, onClose }: { deck: CardInst[]; onClose: () => void }) {
  const { t } = useTranslation('c-signal-forge');
  const sorted = deck.slice().sort((a, b) => a.id.localeCompare(b.id));
  return (
    <Modal title={t('deck.title', { defaultValue: 'Your deck ({{n}})', n: deck.length })} onClose={onClose} wide>
      <div className="sf-card-grid sf-card-grid-dense">
        {sorted.map((inst) => (
          <CardView key={inst.uid} def={effectiveCard(inst)} upgraded={inst.up} size="grid" />
        ))}
      </div>
    </Modal>
  );
}

type CodexTab = 'cards' | 'relics' | 'enemies' | 'ascension';

export function CodexModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('c-signal-forge');
  const [tab, setTab] = useState<CodexTab>('cards');
  const tabs: Array<[CodexTab, string]> = [
    ['cards', t('codex.cards', { defaultValue: 'Cards ({{n}})', n: CARDS.length })],
    ['relics', t('codex.relics', { defaultValue: 'Relics ({{n}})', n: RELICS.length })],
    ['enemies', t('codex.enemies', { defaultValue: 'Enemies ({{n}})', n: ENEMIES.length })],
    ['ascension', t('codex.ascension', { defaultValue: 'Ascension' })],
  ];
  return (
    <Modal title={t('codex.title', { defaultValue: 'Codex' })} onClose={onClose} wide>
      <div className="sf-seg" role="group" aria-label={t('codex.title', { defaultValue: 'Codex' })}>
        {tabs.map(([id, label]) => (
          <button key={id} type="button" className="sf-seg-btn" aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'cards' && (
        <div className="sf-card-grid sf-card-grid-dense">
          {CARDS.map((d) => (
            <CardView key={d.id} def={d} size="grid" />
          ))}
        </div>
      )}
      {tab === 'relics' && (
        <div className="sf-reward-list">
          {RELICS.map((r) => (
            <div key={r.id} className="sf-relic-row">
              <RelicBadge id={r.id} size={40} />
              <div className="sf-relic-row-text">
                <b>{t(`relic.${r.id}.name`, { defaultValue: r.name })}</b>
                <span>{t(`relic.${r.id}.text`, { defaultValue: r.text })}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === 'enemies' && (
        <div className="sf-enemy-grid">
          {ENEMIES.filter((e) => e.id !== 'calibration_drone').map((e) => (
            <div key={e.id} className={`sf-enemy-card sf-tier-${e.tier}`}>
              <EnemyArt def={e} size={84} />
              <b>{t(`enemy.${e.id}.name`, { defaultValue: e.name })}</b>
              <span className="sf-label">
                {t('codex.enemy-meta', { defaultValue: 'Act {{act}}, {{tier}}', act: e.act, tier: t(`tier.${e.tier}`, { defaultValue: label(`tier.${e.tier}`) }) })}
              </span>
              <span className="sf-muted">{t(`enemy.${e.id}.lore`, { defaultValue: e.lore })}</span>
            </div>
          ))}
        </div>
      )}
      {tab === 'ascension' && (
        <ol className="sf-asc-list">
          {ASCENSION.map((a) => (
            <li key={a.level}>
              <b className="sf-mono">A{a.level}</b> {t(`asc.${a.level}`, { defaultValue: a.text })}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

export function LeaderboardPanel({ compact }: { compact?: boolean }) {
  const { t } = useTranslation('c-signal-forge');
  const [rows, setRows] = useState<SignalForgeLeaderboardRow[] | null>(null);
  const arrival = useArrival(rows !== null);
  useEffect(() => {
    let live = true;
    void fetchLeaderboard().then((r) => live && setRows(r));
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="sf-board-panel" aria-label={t('lb.title', { defaultValue: 'Leaderboard' })}>
      <h3 className="sf-subtitle">
        <Icon name="trophy" size={16} color="#FFD27A" /> {t('lb.title', { defaultValue: 'Leaderboard' })}
      </h3>
      {rows === null ? (
        <p className="sf-muted">{t('lb.loading', { defaultValue: 'Reading the ledger.' })}</p>
      ) : rows.length === 0 ? (
        <p className="sf-muted">{t('lb.empty', { defaultValue: 'No scores yet.' })}</p>
      ) : (
        <ol className={`sf-lb ${arrival ?? ''}`}>
          {rows.slice(0, compact ? 8 : 25).map((r, i) => (
            <li key={`${r.username}-${i}`}>
              <span className="sf-mono sf-lb-rank">{i + 1}</span>
              <span className="sf-lb-name">{r.username}</span>
              <span className="sf-mono">{r.highScore.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
