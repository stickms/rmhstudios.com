'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crosshair, Flame, Heart, RotateCcw } from 'lucide-react';
import { ITEMS, WEAPONS, WEAPON_IDS, isItemId, type WeaponId } from '@/lib/hearthworks/content';
import { createCombatControls } from '@/lib/hearthworks/combat-input';
import { runtime } from '@/lib/hearthworks/runtime-instance';
import { hearthworksStore, useHearthworks } from '@/lib/hearthworks/store';
import { HEAT_MAX, HUSTLE_MARKUP, MAX_HP, WANTED_HEAT } from '@/lib/hearthworks/world';

/**
 * Heat cooling and health regrowing happen on ticks that announce nothing, so the store never signals them; re-read
 * the world twice a second while a vitals view is on screen.
 */
function useVitalsRefresh(): void {
  const [, bump] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => bump((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, []);
}

/** A labelled bar (health, heat). `role="meter"` so a screen reader hears the value, not just sees the fill. */
function Meter({
  label,
  value,
  max,
  tone,
  hot,
}: {
  label: string;
  value: number;
  max: number;
  tone: 'hp' | 'heat';
  hot?: boolean;
}) {
  return (
    <div className={`hw-meter hw-meter--${tone}`} data-hot={hot ? 'true' : undefined}>
      <span className="hw-meter__label">{label}</span>
      <div
        className="hw-meter__track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div
          className="hw-meter__fill"
          style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }}
        />
      </div>
      <span className="hw-meter__value">{value}</span>
    </div>
  );
}

/** The always-visible vitals: health, heat and the gun in hand. Hidden until there is something to show. */
export function Vitals() {
  const { t } = useTranslation('c-hearthworks');
  useVitalsRefresh();
  const me = useHearthworks((s) => s.world.players[s.playerId]);
  const walking = useHearthworks((s) => s.view === 'third');
  const controls = useMemo(() => createCombatControls(hearthworksStore, runtime), []);
  useHearthworks((s) => s.rev);
  if (!me) return null;
  const gun = me.arms.equipped ? me.arms.guns[me.arms.equipped] : undefined;
  if (me.hp >= MAX_HP && me.heat === 0 && !me.arms.equipped) return null;
  const downed = me.arms.downedUntil > 0;
  return (
    <>
      <div className="hw-vitals" aria-live="off">
        <Meter
          label={t('vital-hp', { defaultValue: 'Health' })}
          value={me.hp}
          max={MAX_HP}
          tone="hp"
        />
        <Meter
          label={t('vital-heat', { defaultValue: 'Heat' })}
          value={me.heat}
          max={HEAT_MAX}
          tone="heat"
          hot={me.heat >= WANTED_HEAT}
        />
        {me.arms.equipped && gun && (
          <p className="hw-vitals__ammo">
            <Crosshair aria-hidden size={14} /> {WEAPONS[me.arms.equipped].name} ·{' '}
            <b>
              {gun.mag} / {gun.reserve}
            </b>
            {me.arms.reloadDoneAt > 0 && (
              <span> · {t('reloading', { defaultValue: 'Reloading…' })}</span>
            )}
          </p>
        )}
        {downed && (
          <p className="hw-vitals__ammo">
            {t('downed', { defaultValue: 'You are down. Waking at the meadow…' })}
          </p>
        )}
      </div>
      {walking && me.arms.equipped && (
        <button
          type="button"
          className="hw-fire"
          aria-label={t('fire-label', { defaultValue: 'Fire (F)' })}
          onClick={() => controls.fire()}
        >
          <Crosshair aria-hidden size={26} />
        </button>
      )}
    </>
  );
}

/** The back-alley and the armoury: street deals for a markup (and heat), and guns with their prices and stats. */
export function Armory() {
  const { t } = useTranslation('c-hearthworks');
  useVitalsRefresh();
  const me = useHearthworks((s) => s.world.players[s.playerId]);
  useHearthworks((s) => s.rev);
  const dispatch = hearthworksStore.getState().dispatch;
  if (!me) return null;
  const held = Object.entries(me.inventory).filter(([, n]) => (n ?? 0) > 0);
  const wantedNote = me.heat >= WANTED_HEAT;

  return (
    <section
      className="hw-panel hw-panel--tall"
      aria-label={t('armory-title', { defaultValue: 'Back alley' })}
    >
      <h2 className="hw-panel__title">{t('armory-title', { defaultValue: 'Back alley' })}</h2>
      <Meter
        label={t('vital-hp', { defaultValue: 'Health' })}
        value={me.hp}
        max={MAX_HP}
        tone="hp"
      />
      <Meter
        label={t('vital-heat', { defaultValue: 'Heat' })}
        value={me.heat}
        max={HEAT_MAX}
        tone="heat"
        hot={wantedNote}
      />
      <p className="hw-muted">
        {wantedNote
          ? t('heat-wanted', {
              defaultValue:
                'The police are looking for you. Armed, they shoot; unarmed, they arrest.',
            })
          : t('heat-calm', {
              defaultValue: 'Street deals pay well and draw attention. Heat fades slowly.',
            })}
      </p>

      <h3 className="hw-panel__sub">{t('street-title', { defaultValue: 'Street deals' })}</h3>
      {held.length === 0 ? (
        <p className="hw-muted">
          {t('street-empty', { defaultValue: 'Nothing to sell. Brew something in a kitchen.' })}
        </p>
      ) : (
        <ul className="hw-list">
          {held.map(([id, n]) =>
            isItemId(id) ? (
              <li key={id} className="hw-row">
                <span>
                  {ITEMS[id].name} <b>×{n}</b>
                </span>
                <button
                  type="button"
                  className="hw-small"
                  title={t('hustle-hint', {
                    defaultValue: 'Sold on the street at ×{{markup}}; you gain heat',
                    markup: HUSTLE_MARKUP,
                  })}
                  onClick={() => dispatch({ type: 'hustle', item: id, qty: n ?? 0 })}
                >
                  {t('hustle', { defaultValue: 'Hustle' })} ·{' '}
                  {Math.floor(ITEMS[id].price * (n ?? 0) * HUSTLE_MARKUP).toLocaleString()}
                </button>
              </li>
            ) : null,
          )}
        </ul>
      )}

      <h3 className="hw-panel__sub">{t('guns-title', { defaultValue: 'Guns' })}</h3>
      <ul className="hw-list">
        {WEAPON_IDS.map((id: WeaponId) => {
          const def = WEAPONS[id];
          const gun = me.arms.guns[id];
          const equipped = me.arms.equipped === id;
          const full = gun ? gun.reserve >= def.maxMags * def.magazine : false;
          const price = gun ? def.ammoPrice : def.price;
          return (
            <li key={id} className="hw-gun">
              <div className="hw-row">
                <span>
                  <b>{def.name}</b> <span className="hw-muted">{def.inspiredBy}</span>
                </span>
              </div>
              <p className="hw-muted hw-gun__stats">
                {t('gun-stats', {
                  defaultValue: '{{damage}} dmg × {{pellets}} · {{range}} tiles · {{mag}} rounds',
                  damage: def.damage,
                  pellets: def.pellets,
                  range: def.range,
                  mag: def.magazine,
                })}
                {gun && (
                  <>
                    {' · '}
                    <b>
                      {gun.mag} / {gun.reserve}
                    </b>
                  </>
                )}
              </p>
              <div className="hw-row hw-gun__actions">
                <button
                  type="button"
                  className="hw-small"
                  disabled={(gun ? full : false) || me.money < price}
                  onClick={() => dispatch({ type: 'buyWeapon', weapon: id })}
                >
                  {gun
                    ? t('gun-ammo', { defaultValue: 'Buy magazine' })
                    : t('gun-buy', { defaultValue: 'Buy' })}{' '}
                  · {price.toLocaleString()}
                </button>
                {gun && (
                  <button
                    type="button"
                    className="hw-small"
                    aria-pressed={equipped}
                    onClick={() => dispatch({ type: 'equip', weapon: equipped ? null : id })}
                  >
                    {equipped
                      ? t('gun-holster', { defaultValue: 'Holster' })
                      : t('gun-equip', { defaultValue: 'Equip' })}
                  </button>
                )}
                {gun && equipped && (
                  <button
                    type="button"
                    className="hw-small"
                    onClick={() => dispatch({ type: 'reload' })}
                  >
                    <RotateCcw aria-hidden size={14} />{' '}
                    {t('gun-reload', { defaultValue: 'Reload (R)' })}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="hw-muted">
        <Flame aria-hidden size={14} />{' '}
        {t('gun-keys', { defaultValue: 'F fire in the direction you face · R reload' })}
      </p>
      <p className="hw-muted">
        <Heart aria-hidden size={14} />{' '}
        {t('gun-law', {
          defaultValue: 'Armed or firing, you are shot at. Unarmed, you are arrested.',
        })}
      </p>
    </section>
  );
}
