'use client';

import { useState } from 'react';
import { m as motion } from 'framer-motion';
import type { World } from '@/lib/breakpoint/engine/world';
import { BUY_GROUPS, ARMOR_OPTIONS, getWeapon } from '@/lib/breakpoint/weapons';
import { getAgent } from '@/lib/breakpoint/agents';

/** Valorant-style buy menu — weapons, shields, abilities. Re-renders on each
 *  purchase via a local counter (the engine holds the source of truth). */
export function BuyMenu({ world, onClose }: { world: World; onClose: () => void }) {
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const local = world.local;
  if (!local) return null;
  const agent = getAgent(local.agentId);

  const buy = (fn: () => boolean) => { if (fn()) rerender(); };

  return (
    <motion.div
      className="bp-buymenu"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
    >
      <div className="bp-buy-head">
        <div className="bp-buy-title">ARMORY</div>
        <div className="bp-buy-credits">⬡ {local.credits}</div>
        <button className="bp-buy-close" onClick={onClose}>CLOSE ✕</button>
      </div>

      <div className="bp-buy-cols">
        {/* Shields */}
        <div className="bp-buy-col">
          <div className="bp-buy-coltitle">SHIELDS</div>
          {ARMOR_OPTIONS.map((a) => {
            const owned = local.loadout.armor >= a.value;
            const afford = local.credits >= a.cost;
            return (
              <button
                key={a.value}
                className={`bp-buy-item ${owned ? 'owned' : ''} ${!afford && !owned ? 'broke' : ''}`}
                onClick={() => buy(() => world.buyArmor(local, a.value, a.cost))}
                disabled={owned || !afford}
              >
                <span className="bp-bi-name">{a.label}</span>
                <span className="bp-bi-cost">{owned ? 'OWNED' : `⬡ ${a.cost}`}</span>
              </button>
            );
          })}
        </div>

        {/* Weapons */}
        {BUY_GROUPS.map((g) => (
          <div className="bp-buy-col" key={g.label}>
            <div className="bp-buy-coltitle">{g.label}</div>
            {g.ids.map((id) => {
              const w = getWeapon(id);
              const equipped = local.currentWeapon === id || local.loadout.primary === id;
              const afford = local.credits >= w.cost;
              return (
                <button
                  key={id}
                  className={`bp-buy-item ${equipped ? 'owned' : ''} ${!afford ? 'broke' : ''}`}
                  onClick={() => buy(() => world.buyWeapon(local, id))}
                  disabled={!afford}
                >
                  <span className="bp-bi-name">{w.name}</span>
                  <span className="bp-bi-cost">⬡ {w.cost}</span>
                </button>
              );
            })}
          </div>
        ))}

        {/* Abilities */}
        <div className="bp-buy-col">
          <div className="bp-buy-coltitle" style={{ color: agent.color }}>{agent.name.toUpperCase()} ABILITIES</div>
          {agent.abilities.filter((ab) => ab.slot !== 'X').map((ab) => {
            const have = local.loadout.abilities[ab.id] ?? 0;
            const maxed = have >= ab.charges;
            const free = ab.cost === 0;
            const afford = local.credits >= ab.cost;
            return (
              <button
                key={ab.id}
                className={`bp-buy-item ${maxed ? 'owned' : ''} ${!afford && !free && !maxed ? 'broke' : ''}`}
                onClick={() => buy(() => world.buyAbility(local, ab.id, ab.cost, ab.charges))}
                disabled={maxed || free || (!afford)}
                title={ab.desc}
                style={{ borderLeft: `3px solid ${ab.color}` }}
              >
                <span className="bp-bi-name">{ab.slot} · {ab.name} <i className="bp-bi-have">{have}/{ab.charges}</i></span>
                <span className="bp-bi-cost">{free ? 'SIG' : maxed ? 'MAX' : `⬡ ${ab.cost}`}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bp-buy-foot">Tip: shields absorb damage · headshots hurt · press <b>B</b> to toggle this menu</div>
    </motion.div>
  );
}
