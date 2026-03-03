'use client';

import { useState } from 'react';
import { X, ScrollText, Sword, Shield, Skull, TrendingUp, TrendingDown, Sparkles, ShoppingBag, Zap, FlaskConical, Target } from 'lucide-react';

// ── Patch Notes Data ─────────────────────────────────────────

interface PatchEntry {
  text: string;
  detail?: string;
}

interface PatchCategory {
  label: string;
  icon: typeof Sword;
  color: string;
  entries: PatchEntry[];
}

interface PatchVersion {
  version: string;
  title: string;
  summary: string;
  categories: PatchCategory[];
}

const PATCH_NOTES: PatchVersion[] = [
  {
    version: 'v1.3',
    title: 'Meta Store & Evolution Rework',
    summary: 'Complete rework of the evolution system, passive item redesign, and expanded meta store.',
    categories: [
      {
        label: 'Evolution System',
        icon: Sparkles,
        color: 'var(--altair-rare)',
        entries: [
          { text: 'New Evolution Catalyst system replaces old passive stat-stick items', detail: 'Catalysts have unique gameplay effects — procs, conditionals, on-hit triggers — not just flat stats' },
          { text: 'Catalysts are consumed on evolution, freeing a passive slot', detail: 'Weapon at Lv8 + Catalyst at Lv3 = auto-evolution. Catalyst disappears, slot opens up' },
          { text: 'Catalysts have 3 levels (down from 5 for old passives)', detail: 'Cheaper to max but you pick them for the effect, not stat grinding' },
          { text: 'No duplicate evolved weapons allowed' },
          { text: 'Catalysts are useful even without the matching weapon' },
        ],
      },
      {
        label: 'New Catalysts',
        icon: Zap,
        color: 'var(--altair-warning)',
        entries: [
          { text: 'Warden\'s Crest — Damage shield on hit, +20% melee dmg while shielded', detail: 'Evolves Broad Sword → Radiant Claymore' },
          { text: 'Astral Focus — Homing spark proc every few attacks', detail: 'Evolves Arcane Bolt → Arcane Barrage' },
          { text: 'Hawk Talon — Focus stacks on same target (+6%/stack, max 8)', detail: 'Evolves Iron Shortbow → Storm Bow' },
          { text: 'Blighted Venom — Poison-killed enemies leave toxic corpses', detail: 'Evolves Toxic Flask → Plague Bomb' },
          { text: 'Berserker\'s Brand — Take damage, next attack hits +25% harder', detail: 'Evolves War Axe → Cataclysm Axe' },
          { text: 'Phylactery Shard — Nearby kills spawn healing soul wisps', detail: 'Evolves Soul Siphon → Death Ray' },
          { text: 'Paradox Gear — Temporal echo replays your recent attacks', detail: 'Evolves Temporal Shard → Eternity Loop' },
          { text: 'Sanguine Heart — Blood pulse AoE + heal when HP drops low', detail: 'Evolves Crimson Whip → Sanguine Scourge' },
          { text: 'Consecrated Water — Hallowed ground zone while stationary', detail: 'Evolves Holy Water → Divine Deluge' },
          { text: 'Whetstone — Missed projectiles ricochet toward enemies', detail: 'Evolves Throwing Daggers → Knife Storm' },
          { text: 'Storm Conduit — Chain-lightning proc on damaged enemies', detail: 'Evolves Lightning Ring → Thunderstorm' },
          { text: 'Moonpetal Wreath — Close kills drop life motes for healing', detail: 'Evolves Garlic → Soul Eater' },
          { text: 'Celestial Compass — Detection pulse reveals + amps damage', detail: 'Evolves Runic Orbs → Celestial Guard' },
          { text: 'Cinder Core — Kill-ignite that spreads fire through swarms', detail: 'Evolves Fire Wand → Inferno Staff' },
        ],
      },
      {
        label: 'Passive Items',
        icon: Shield,
        color: 'var(--altair-info)',
        entries: [
          { text: 'Swift Boots reworked — conditional MS bonus above HP thresholds + dodge proc at Lv5' },
          { text: 'Magnetic Amulet reworked — faster gem collection, auto coin pickup, periodic magnet pulse' },
          { text: 'Clover reworked — bonus coins from chests, food healing, +1 level-up choice at Lv5' },
          { text: 'XP Tome reworked — free weapon upgrades every 8 levels, passives start at Lv2' },
          { text: 'New: Iron Hide — +1 Armor/lvl, heavy-hit DR, knockback immunity' },
          { text: 'New: War Banner — +4% Might/lvl, Frenzy kill-streak proc' },
          { text: 'New: Quicksilver Flask — +5% ASPD/lvl, CDR while moving' },
          { text: 'New: Thorn Mantle — Retaliatory AoE damage when hit' },
          { text: 'New: Vital Essence — +8% Max HP/lvl, triple Regen below 50%' },
          { text: 'New: Piercing Lens — +1 Pierce/lvl, escalating pierce damage' },
          { text: 'New: Shadow Cloak — Dodge chance up to 13%, invisibility on dodge' },
          { text: 'New: Chronosphere — +8% Duration/lvl, ground effects detonate on expiry' },
        ],
      },
      {
        label: 'Meta Store',
        icon: ShoppingBag,
        color: 'var(--altair-success)',
        entries: [
          { text: 'Meta store expanded from 13 to 20 upgrades' },
          { text: 'New: Piercing — +1 global Pierce/lvl (3 levels, 1,900 coins total)' },
          { text: 'New: Haste — +4% Attack Speed/lvl (5 levels, 2,000 coins)' },
          { text: 'New: Tenacity — reduce CC duration by 15%/lvl (3 levels, 1,300 coins)' },
          { text: 'New: Scavenger — food heals +5% more, coins +5% more likely (3 levels, 1,100 coins)' },
          { text: 'New: Catalyst Affinity — catalysts appear more often, start at Lv2 (2 levels, 1,700 coins)' },
          { text: 'New: Endurance — late-game DR after minute 10/15 (3 levels, 2,200 coins)' },
          { text: 'New: Arsenal — starting weapon begins at higher level (3 levels, 1,650 coins)' },
          { text: 'Revival expanded to 2 levels (2,300 coins total)' },
          { text: 'Grand total to fully upgrade: ~34,440 coins (was ~16,700)', detail: '~50-70 full clears for experienced players, ~40-60 hours of meta-progression' },
        ],
      },
    ],
  },
  {
    version: 'v1.2',
    title: 'Weapon Meta & Class Parity',
    summary: 'Targeted nerfs to War Axe and Garlic; buffs to underperforming starting weapons; class tuning to close the gap between Berserker and everyone else.',
    categories: [
      {
        label: 'Nerfs',
        icon: TrendingDown,
        color: 'var(--altair-danger)',
        entries: [
          { text: 'War Axe: damage 24→20, cooldown 2.0s→2.3s, range 80→70px, max targets 8→6', detail: 'New 0.25s windup with 60% move speed during animation — no longer instant 360° clear' },
          { text: 'War Axe effective AoE DPS nearly halved at max level' },
          { text: 'Garlic: damage 3→2/tick, tick rate 0.75s→1.0s, knockback 15→8px', detail: 'New max target cap of 10. New 50% damage falloff in outer ring. Repositioned as comfort passive, not kill weapon' },
          { text: 'Cataclysm Axe: damage bonus +40%→+30%, pull 30→20px, fire trail 5→3 DPS' },
          { text: 'Soul Eater: aura radius 120→100px, lifesteal 0.5%→0.3%, tick 5→4 at 1.0s' },
          { text: 'Berserker: HP 140→130, regen 0.3→0.2, move speed 205→200', detail: 'Blood Rage attack speed bonus below 25% HP removed entirely. Savage Slam cooldown 30s→35s, invuln 0.6s→0.4s' },
        ],
      },
      {
        label: 'Buffs',
        icon: TrendingUp,
        color: 'var(--altair-success)',
        entries: [
          { text: 'Iron Shortbow: damage 10→12, cooldown 0.9s→0.75s, pierce 1→2, proj speed 350→400', detail: 'New 8% base crit chance (1.5x damage) unique to Shortbow. Nearly 2x single-target DPS of War Axe when aimed' },
          { text: 'Ranger: move speed 230→235, proj speed 1.2x→1.25x, pickup 65→70, new +1 global Pierce', detail: 'Evasion Roll: CD 20s→16s, dash 150→170px, new trail damage. Hunter\'s Mark: +30% amp, 8s duration, mark transfer on kill' },
          { text: 'Arcane Bolt: damage 15→17, cooldown 1.2s→1.05s, tracking 300→350px, turn 180→220°/s', detail: 'New splash on kill: 40% damage in 40px radius. Level 5 fires 2 bolts at 2 nearest enemies' },
          { text: 'Soul Siphon: damage 8→9/tick, range 80→100px, tick rate 4→5/s (45 DPS)', detail: 'New 15% slow while draining. +10% bonus to Raise Dead proc on beam kills' },
          { text: 'Temporal Shard: damage 12→14 per pass, cooldown 2.2s→2.0s, pierce 3→4, range 250→280px', detail: 'New return pass +25% damage bonus. New 10% slow for 1.5s on hit' },
          { text: 'Crimson Whip: damage 18→20, cooldown 1.5s→1.35s, range 130→140px, width 40→55px', detail: 'New 2% inherent lifesteal (stacks with Sanguine Feast for 6% total)' },
          { text: 'Toxic Flask: damage 6→7/tick, cooldown 4.0s→3.5s, pool duration 1.5s→2.0s, radius 60→70px', detail: 'New smart-targeting lobs to densest cluster. New 20% slow in pool + 0.5s after leaving' },
          { text: 'Broad Sword: damage 18→19, cooldown 1.3s→1.2s, arc 100°→110°, range 90→95px', detail: 'New Block: 25% DR for 0.1s after swing connects. Level 5 widens arc to 120°' },
        ],
      },
      {
        label: 'Other Weapons',
        icon: Sword,
        color: 'var(--altair-text-muted)',
        entries: [
          { text: 'Throwing Daggers: damage 6→7, cooldown 0.7s→0.65s, pierce 0→1, proj count 2→3' },
          { text: 'Lightning Ring: cooldown 3.0s→2.5s, damage 20→22' },
          { text: 'Runic Orbs: hit CD 0.5s→0.4s, damage 10→11' },
          { text: 'Holy Water and Fire Wand unchanged' },
        ],
      },
    ],
  },
  {
    version: 'v1.1',
    title: 'Balance Overhaul',
    summary: 'Address critical balance failures making the game trivially easy. Players should struggle to reach 20:00 even on Knight.',
    categories: [
      {
        label: 'Weapons',
        icon: Sword,
        color: 'var(--altair-accent)',
        entries: [
          { text: 'Complete weapon stat overhaul across all 14 weapons' },
          { text: 'Pierce globally capped — no more infinite pierce builds' },
          { text: 'Evolved weapon power reduced across the board' },
          { text: 'Weapon level scaling tightened to prevent exponential power curves' },
        ],
      },
      {
        label: 'Classes',
        icon: Target,
        color: 'var(--altair-info)',
        entries: [
          { text: 'All 8 classes rebalanced for stat parity' },
          { text: 'Class abilities retuned with proper cooldowns and scaling' },
          { text: 'Starting weapon assignments reviewed for class identity' },
        ],
      },
      {
        label: 'Passive Items',
        icon: Shield,
        color: 'var(--altair-rare)',
        entries: [
          { text: 'Passive item level scaling reduced' },
          { text: 'Stacking bonuses capped to prevent multiplicative power explosions' },
          { text: 'Evolution passive requirements adjusted' },
        ],
      },
      {
        label: 'Enemies & Difficulty',
        icon: Skull,
        color: 'var(--altair-danger)',
        entries: [
          { text: 'Enemy HP, damage, and speed stats overhauled across all tiers' },
          { text: 'Difficulty scaling reworked — linear HP/damage growth, multiplicative speed' },
          { text: 'Wave timeline completely restructured', detail: 'Minutes 0-5: learning phase. 5-10: power building. 10-15: challenge ramp. 15-20: controlled panic' },
          { text: 'Boss overhaul — new attack patterns, proper HP scaling, phase thresholds' },
          { text: 'New enemy behaviors: flanking, charging, ranged attacks' },
        ],
      },
      {
        label: 'Economy',
        icon: FlaskConical,
        color: 'var(--altair-warning)',
        entries: [
          { text: 'XP curve reworked — slower early leveling, smoother mid-game progression' },
          { text: 'Coin drop rates adjusted for harder difficulty' },
          { text: 'Meta shop prices rebalanced', detail: '~16,700 total coins to fully upgrade' },
          { text: 'Treasure chest spawn timing adjusted' },
        ],
      },
      {
        label: 'New Mechanics',
        icon: Sparkles,
        color: 'var(--altair-success)',
        entries: [
          { text: 'Multiplayer scaling — enemies scale with player count' },
          { text: 'Target benchmarks established for clear times and difficulty curves' },
          { text: 'New enemy tier system with distinct threat profiles' },
        ],
      },
    ],
  },
];

// ── Component ────────────────────────────────────────────────

export default function PatchnotesModal({ onClose }: { onClose: () => void }) {
  const [selectedVersion, setSelectedVersion] = useState(0);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  const patch = PATCH_NOTES[selectedVersion];

  const toggleDetail = (key: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 altair-overlay" onClick={onClose}>
      <div
        className="altair-parchment-surface bg-(--altair-surface) border border-(--altair-border) rounded-2xl w-full max-w-2xl mx-4 altair-modal overflow-hidden flex flex-col"
        style={{ maxHeight: 'min(85vh, 700px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h2 className="text-xl font-bold text-(--altair-text) flex items-center gap-2">
            <ScrollText size={20} className="text-(--altair-accent)" />
            Patch Notes
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-(--altair-text-dim) hover:text-(--altair-text) hover:bg-(--altair-surface-hover) transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Version tabs */}
        <div className="flex gap-1.5 px-5 pb-3 shrink-0">
          {PATCH_NOTES.map((v, i) => (
            <button
              key={v.version}
              onClick={() => { setSelectedVersion(i); setExpandedEntries(new Set()); }}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
                selectedVersion === i
                  ? 'bg-(--altair-accent) text-white'
                  : 'bg-(--altair-bg) text-(--altair-text-muted) hover:bg-(--altair-surface-hover)'
              }`}
            >
              <span className="block font-bold">{v.version}</span>
              <span className="block text-[10px] opacity-80 mt-0.5 truncate">{v.title}</span>
            </button>
          ))}
        </div>

        {/* Version summary */}
        <div className="px-5 pb-3 shrink-0">
          <p className="text-xs text-(--altair-text-muted) italic leading-relaxed">{patch.summary}</p>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-5 pb-5 min-h-0 flex-1 altair-scrollbar">
          <div className="space-y-4">
            {patch.categories.map((cat) => {
              const Icon = cat.icon;
              return (
                <div key={cat.label}>
                  {/* Category header */}
                  <div className="flex items-center gap-2 mb-2 sticky top-0 bg-(--altair-surface) py-1 z-10">
                    <Icon size={14} style={{ color: cat.color }} />
                    <h3 className="text-sm font-bold text-(--altair-text)" style={{ color: cat.color }}>
                      {cat.label}
                    </h3>
                    <div className="flex-1 h-px bg-(--altair-border)" />
                  </div>

                  {/* Entries */}
                  <div className="space-y-1">
                    {cat.entries.map((entry, j) => {
                      const key = `${cat.label}-${j}`;
                      const isExpanded = expandedEntries.has(key);
                      const hasDetail = !!entry.detail;

                      return (
                        <div key={key}>
                          <button
                            onClick={hasDetail ? () => toggleDetail(key) : undefined}
                            className={`w-full text-left flex items-start gap-2 px-2.5 py-1.5 rounded-md text-xs leading-relaxed transition-colors ${
                              hasDetail
                                ? 'hover:bg-(--altair-bg) cursor-pointer'
                                : 'cursor-default'
                            } ${isExpanded ? 'bg-(--altair-bg)' : ''}`}
                          >
                            <span className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color, opacity: 0.6 }} />
                            <span className="text-(--altair-text) flex-1">
                              {entry.text}
                              {hasDetail && !isExpanded && (
                                <span className="text-(--altair-text-dim) ml-1">...</span>
                              )}
                            </span>
                          </button>
                          {hasDetail && isExpanded && (
                            <div className="ml-6 px-2.5 pb-1.5 text-[11px] text-(--altair-text-muted) leading-relaxed">
                              {entry.detail}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
