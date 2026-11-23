/**
 * Signal Forge's between-fight screens: rewards (and the boss relic choice), the shop, the Cooling Bay, events,
 * card picks (remove / temper / transform / duplicate) and the cache. Each is a forged panel on the act backdrop.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cardDef } from '@features/signal-forge/engine/data/cards';
import { eventDef } from '@features/signal-forge/engine/data/events';
import { relicDef } from '@features/signal-forge/engine/data/relics';
import { ascensionMods } from '@features/signal-forge/engine/balance';
import { effectiveCard, relicPassive } from '@features/signal-forge/engine/combat';
import { canChoose, pickCandidates, type Action } from '@features/signal-forge/engine/run';
import type { RunState } from '@features/signal-forge/engine/types';
import { CardView } from './CardView';
import { Icon } from './art/glyphs';
import { RelicBadge } from './RunHud';

function Panel({ title, kicker, children }: { title: string; kicker?: string; children: ReactNode }) {
  return (
    <section className="sf-panel" aria-label={title}>
      {kicker && <span className="sf-label">{kicker}</span>}
      <h2 className="sf-title">{title}</h2>
      {children}
    </section>
  );
}

function RelicRow({ id, onTake, price, disabled }: { id: string; onTake?: () => void; price?: number; disabled?: boolean }) {
  const { t } = useTranslation('c-signal-forge');
  const d = relicDef(id);
  return (
    <div className="sf-relic-row">
      <RelicBadge id={id} size={44} />
      <div className="sf-relic-row-text">
        <b>{t(`relic.${id}.name`, { defaultValue: d.name })}</b>
        <span>{t(`relic.${id}.text`, { defaultValue: d.text })}</span>
      </div>
      {onTake && (
        <button type="button" className="sf-btn" onClick={onTake} disabled={disabled}>
          {price !== undefined ? (
            <>
              <Icon name="gold" size={14} color="#FFD27A" /> {price}
            </>
          ) : (
            t('reward.take', { defaultValue: 'Take' })
          )}
        </button>
      )}
    </div>
  );
}

export function RewardScreen({ run, act }: { run: RunState; act: (a: Action) => void }) {
  const { t } = useTranslation('c-signal-forge');
  const rw = run.reward!;
  const boss = run.phase === 'boss-reward';
  return (
    <Panel title={boss ? t('reward.boss-title', { defaultValue: 'The boss is slag' }) : t('reward.title', { defaultValue: 'Spoils' })} kicker={t('reward.kicker', { defaultValue: 'Victory' })}>
      <div className="sf-reward-list">
        {!rw.goldTaken && (
          <button type="button" className="sf-btn sf-reward-gold" onClick={() => act({ t: 'reward-gold' })}>
            <Icon name="gold" size={16} color="#FFD27A" /> {t('reward.gold', { defaultValue: 'Take {{n}} gold', n: rw.gold })}
          </button>
        )}
        {rw.relic && !rw.relicTaken && <RelicRow id={rw.relic} onTake={() => act({ t: 'reward-relic' })} />}
      </div>
      {boss && rw.relics && !rw.relicTaken && (
        <>
          <h3 className="sf-subtitle">{t('reward.boss-relic', { defaultValue: 'Choose a boss relic' })}</h3>
          <div className="sf-reward-list">
            {rw.relics.map((id) => (
              <RelicRow key={id} id={id} onTake={() => act({ t: 'boss-relic', id })} />
            ))}
          </div>
        </>
      )}
      {!rw.cardTaken && (
        <>
          <h3 className="sf-subtitle">{t('reward.card', { defaultValue: 'Add a card to your deck' })}</h3>
          <div className="sf-card-grid">
            {rw.cards.map((id) => (
              <CardView key={id} def={cardDef(id)} size="grid" onPlay={() => act({ t: 'reward-card', id })} />
            ))}
          </div>
          <button type="button" className="sf-btn sf-btn-ghost" onClick={() => act({ t: 'reward-card', id: null })}>
            {t('reward.skip-card', { defaultValue: 'Skip the card' })}
          </button>
        </>
      )}
      <div className="sf-panel-foot">
        <button type="button" className="sf-btn sf-btn-hot" onClick={() => act({ t: 'leave' })} disabled={boss && !!rw.relics?.length && !rw.relicTaken}>
          {boss ? t('reward.next-act', { defaultValue: 'Descend to Act {{n}}', n: run.act + 1 }) : t('reward.continue', { defaultValue: 'Continue' })}
        </button>
      </div>
    </Panel>
  );
}

export function ShopScreen({ run, act }: { run: RunState; act: (a: Action) => void }) {
  const { t } = useTranslation('c-signal-forge');
  const s = run.shop!;
  return (
    <Panel title={t('shop.title', { defaultValue: 'The Scrap Market' })} kicker={t('node.shop', { defaultValue: 'Shop' })}>
      <div className="sf-card-grid">
        {s.cards.map((c, i) => (
          <div key={i} className={`sf-shop-item${c.sold ? ' is-sold' : ''}`}>
            <CardView def={cardDef(c.id)} size="grid" disabled={c.sold || run.gold < c.price} onPlay={() => act({ t: 'buy-card', i })} hint={c.sold ? t('shop.sold', { defaultValue: 'Sold' }) : `${c.price}`} />
          </div>
        ))}
      </div>
      <div className="sf-reward-list">
        {s.relics.map((r, i) => (
          <RelicRow key={r.id} id={r.id} price={r.price} disabled={r.sold || run.gold < r.price} onTake={r.sold ? undefined : () => act({ t: 'buy-relic', i })} />
        ))}
        <div className="sf-relic-row">
          <span className="sf-remove-icon" aria-hidden>
            <Icon name="anvil" size={28} color="#FF8A2A" />
          </span>
          <div className="sf-relic-row-text">
            <b>{t('shop.remove', { defaultValue: 'Melt down a card' })}</b>
            <span>{t('shop.remove-text', { defaultValue: 'Remove one card from your deck.' })}</span>
          </div>
          <button type="button" className="sf-btn" disabled={s.removed || run.gold < s.removePrice} onClick={() => act({ t: 'buy-remove' })}>
            <Icon name="gold" size={14} color="#FFD27A" /> {s.removePrice}
          </button>
        </div>
      </div>
      <div className="sf-panel-foot">
        <button type="button" className="sf-btn sf-btn-hot" onClick={() => act({ t: 'leave' })}>
          {t('shop.leave', { defaultValue: 'Leave the market' })}
        </button>
      </div>
    </Panel>
  );
}

export function RestScreen({ run, act }: { run: RunState; act: (a: Action) => void }) {
  const { t } = useTranslation('c-signal-forge');
  const share = Math.max(0, ascensionMods(run.ascension).restHeal + Math.min(0, relicPassive(run.relics).restHeal));
  const heal = Math.min(run.maxHp - run.hp, Math.round(run.maxHp * share));
  return (
    <Panel title={t('rest.title', { defaultValue: 'The Cooling Bay' })} kicker={t('node.rest', { defaultValue: 'Cooling Bay' })}>
      <p className="sf-muted">{t('rest.body', { defaultValue: 'Quench water hisses on hot steel. Rest, or temper one card.' })}</p>
      <div className="sf-choice-row">
        <button type="button" className="sf-choice" onClick={() => act({ t: 'rest', choice: 'heal' })}>
          <Icon name="coolant" size={36} color="#46D8F2" />
          <b>{t('rest.heal', { defaultValue: 'Rest' })}</b>
          <span>{t('rest.heal-text', { defaultValue: 'Heal {{n}} HP.', n: heal })}</span>
        </button>
        <button type="button" className="sf-choice" onClick={() => act({ t: 'rest', choice: 'temper' })}>
          <Icon name="anvil" size={36} color="#FF8A2A" />
          <b>{t('rest.temper', { defaultValue: 'Temper' })}</b>
          <span>{t('rest.temper-text', { defaultValue: 'Upgrade a card.' })}</span>
        </button>
      </div>
    </Panel>
  );
}

export function TreasureScreen({ act }: { act: (a: Action) => void }) {
  const { t } = useTranslation('c-signal-forge');
  return (
    <Panel title={t('treasure.title', { defaultValue: 'A sealed cache' })} kicker={t('node.treasure', { defaultValue: 'Cache' })}>
      <p className="sf-muted">{t('treasure.body', { defaultValue: 'A strongbox bolted to the floor, still warm.' })}</p>
      <div className="sf-panel-foot">
        <button type="button" className="sf-btn sf-btn-hot" onClick={() => act({ t: 'treasure' })}>
          <Icon name="chest" size={16} /> {t('treasure.open', { defaultValue: 'Open it' })}
        </button>
      </div>
    </Panel>
  );
}

export function EventScreen({ run, act }: { run: RunState; act: (a: Action) => void }) {
  const { t } = useTranslation('c-signal-forge');
  const ev = eventDef(run.event!.id);
  const resolved = run.event!.resolved;
  return (
    <Panel title={t(`event.${ev.id}.title`, { defaultValue: ev.title })} kicker={t('node.event', { defaultValue: 'Event' })}>
      <p className="sf-event-body">{t(`event.${ev.id}.body`, { defaultValue: ev.body })}</p>
      {!resolved ? (
        <div className="sf-event-choices">
          {ev.choices.map((ch) => (
            <button key={ch.id} type="button" className="sf-btn sf-event-choice" disabled={!canChoose(run, ev.id, ch.id)} onClick={() => act({ t: 'event', choice: ch.id })}>
              {t(`event.${ev.id}.${ch.id}`, { defaultValue: ch.label })}
            </button>
          ))}
        </div>
      ) : (
        <>
          <p className="sf-muted" role="status">
            {resolved.endsWith(':alt') ? t('event.went-wrong', { defaultValue: 'It did not go to plan.' }) : t('event.done', { defaultValue: 'Done.' })}
          </p>
          <div className="sf-panel-foot">
            <button type="button" className="sf-btn sf-btn-hot" onClick={() => act({ t: 'leave' })}>
              {t('reward.continue', { defaultValue: 'Continue' })}
            </button>
          </div>
        </>
      )}
    </Panel>
  );
}

export function PickScreen({ run, act }: { run: RunState; act: (a: Action) => void }) {
  const { t } = useTranslation('c-signal-forge');
  const p = run.pick!;
  const title = {
    remove: t('pick.remove', { defaultValue: 'Melt down a card' }),
    temper: t('pick.temper', { defaultValue: 'Temper a card' }),
    transform: t('pick.transform', { defaultValue: 'Transform a card' }),
    duplicate: t('pick.duplicate', { defaultValue: 'Duplicate a card' }),
  }[p.kind];
  return (
    <Panel title={title}>
      <div className="sf-card-grid sf-card-grid-dense">
        {pickCandidates(run, p.kind).map((inst) => (
          <CardView key={inst.uid} def={p.kind === 'temper' ? effectiveCard({ ...inst, up: true }) : effectiveCard(inst)} upgraded={p.kind === 'temper' || inst.up} size="grid" onPlay={() => act({ t: 'pick', uid: inst.uid })} />
        ))}
      </div>
      <div className="sf-panel-foot">
        <button type="button" className="sf-btn sf-btn-ghost" onClick={() => act({ t: 'pick', uid: null })}>
          {t('pick.cancel', { defaultValue: 'Cancel' })}
        </button>
      </div>
    </Panel>
  );
}
