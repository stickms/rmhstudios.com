'use client';

import { useTempleStore } from '@/lib/temple-of-joy/store';
import { RELICS } from '@/lib/temple-of-joy/data/relics';
import type { RelicId } from '@/lib/temple-of-joy/types';

function EmptySlot({ index }: { index: number }) {
  return (
    <div
      key={index}
      className="flex items-center justify-center rounded-xl text-2xl"
      style={{
        width: 64,
        height: 64,
        background: 'var(--temple-surface)',
        border: '2px dashed var(--temple-border)',
        opacity: 0.5,
      }}
    >
      ○
    </div>
  );
}

interface ActiveSlotProps {
  relicId: RelicId;
  onUnequip: (id: RelicId) => void;
}

function ActiveSlot({ relicId, onUnequip }: ActiveSlotProps) {
  const def = RELICS.find(r => r.id === relicId);
  if (!def) return <EmptySlot index={0} />;

  return (
    <button
      onClick={() => onUnequip(relicId)}
      title={`${def.name} — click to unequip`}
      className="flex flex-col items-center justify-center rounded-xl transition-all duration-150 group"
      style={{
        width: 64,
        height: 64,
        background: 'var(--temple-surface)',
        border: '2px solid var(--temple-accent)',
        boxShadow: '0 0 10px rgba(212,168,71,0.25)',
        cursor: 'pointer',
      }}
    >
      <span className="text-xl leading-none">💍</span>
      <span
        className="text-[9px] leading-tight text-center px-1 mt-0.5 line-clamp-2 group-hover:text-red-400 transition-colors"
        style={{ color: 'var(--temple-text)', opacity: 0.75 }}
      >
        {def.name}
      </span>
    </button>
  );
}

interface RelicCardProps {
  relicId: RelicId;
  karma: number;
  activeRelics: RelicId[];
  maxRelicSlots: number;
  onEquip: (id: RelicId) => void;
}

function RelicCard({ relicId, karma, activeRelics, maxRelicSlots, onEquip }: RelicCardProps) {
  const def = RELICS.find(r => r.id === relicId)!;

  const isEquipped  = activeRelics.includes(relicId);
  const hasSlot     = activeRelics.length < maxRelicSlots;
  const canAfford   = karma >= def.karmaCost;
  const canEquip    = !isEquipped && hasSlot && canAfford;

  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-1.5 transition-all duration-150"
      style={{
        background: 'var(--temple-surface)',
        border: isEquipped
          ? '1px solid var(--temple-accent)'
          : '1px solid var(--temple-border)',
        opacity: canAfford || isEquipped ? 1 : 0.55,
        boxShadow: isEquipped ? '0 0 10px rgba(212,168,71,0.2)' : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-semibold leading-tight"
          style={{ color: 'var(--temple-text)', fontFamily: 'var(--font-cormorant, Georgia, serif)' }}
          >
            {isEquipped && <span className="mr-1" style={{ color: 'var(--temple-accent)' }}>♦</span>}
            {def.name}
          </p>
          <p
            className="text-xs mt-0.5"
            style={{ color: 'var(--temple-text)', opacity: 0.85 }}
          >
            {def.description}
          </p>
          <p
            className="text-[11px] italic mt-1"
            style={{ color: 'var(--temple-text)', opacity: 0.55 }}
          >
            {def.flavorText}
          </p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          <span
            className="text-xs font-bold tabular-nums"
            style={{ color: 'var(--temple-accent)' }}
          >
            💫 {def.karmaCost}
          </span>
          {isEquipped ? (
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                background: 'rgba(212,168,71,0.2)',
                color: 'var(--temple-accent)',
              }}
            >
              Equipped
            </span>
          ) : (
            <button
              onClick={() => onEquip(relicId)}
              disabled={!canEquip}
              className="px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wide transition-all duration-150"
              style={{
                background: canEquip ? 'var(--temple-accent)' : 'var(--temple-border)',
                color: '#fff',
                cursor: canEquip ? 'pointer' : 'not-allowed',
                opacity: canEquip ? 1 : 0.5,
              }}
            >
              Equip
            </button>
          )}
        </div>
      </div>
      {!canAfford && !isEquipped && (
        <p
          className="text-[10px]"
          style={{ color: 'var(--temple-text)', opacity: 0.5 }}
        >
          Needs {def.karmaCost - Math.floor(karma)} more karma
        </p>
      )}
      {!hasSlot && !isEquipped && canAfford && (
        <p
          className="text-[10px]"
          style={{ color: 'var(--temple-text)', opacity: 0.5 }}
        >
          No free relic slots
        </p>
      )}
    </div>
  );
}

export default function RelicsPanel() {
  const karma         = useTempleStore(s => s.karma);
  const peakKarma     = useTempleStore(s => s.peakKarma);
  const activeRelics  = useTempleStore(s => s.activeRelics);
  const maxRelicSlots = useTempleStore(s => s.maxRelicSlots);
  const equipRelic    = useTempleStore(s => s.equipRelic);
  const unequipRelic  = useTempleStore(s => s.unequipRelic);

  const emptySlots = Math.max(0, maxRelicSlots - activeRelics.length);

  // Only reveal a relic once the player has had at least 1/10th of its karma cost
  const visibleRelics = RELICS.filter(
    r => activeRelics.includes(r.id) || peakKarma >= r.karmaCost * 0.1
  );

  return (
    <div className="flex flex-col gap-4 w-full" style={{ color: 'var(--temple-text)' }}>
      <div className="flex items-center justify-between">
        <h2
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color: 'var(--temple-accent)' }}
        >
          Relics
        </h2>
        <span
          className="text-sm font-bold"
          style={{ color: 'var(--temple-accent)' }}
        >
          💫 {karma.toFixed(0)} Karma
        </span>
      </div>

      {/* Active relic slots */}
      <div>
        <p
          className="text-[10px] uppercase tracking-widest font-semibold mb-2"
          style={{ color: 'var(--temple-text)', opacity: 0.55 }}
        >
          Active Slots ({activeRelics.length}/{maxRelicSlots})
        </p>
        <div className="flex flex-wrap gap-2">
          {activeRelics.map(id => (
            <ActiveSlot key={id} relicId={id} onUnequip={unequipRelic} />
          ))}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <EmptySlot key={`empty-${i}`} index={i} />
          ))}
        </div>
      </div>

      {/* Available relics */}
      <div>
        <p
          className="text-[10px] uppercase tracking-widest font-semibold mb-2"
          style={{ color: 'var(--temple-text)', opacity: 0.55 }}
        >
          Available Relics
        </p>
        <div className="flex flex-col gap-2 overflow-y-auto max-h-[55vh] pr-1">
          {visibleRelics.map(r => (
            <RelicCard
              key={r.id}
              relicId={r.id}
              karma={karma}
              activeRelics={activeRelics}
              maxRelicSlots={maxRelicSlots}
              onEquip={equipRelic}
            />
          ))}
          {visibleRelics.length === 0 && (
            <p className="text-xs italic opacity-55 text-center py-4"
              style={{ color: 'var(--temple-text)' }}>
              Keep generating karma to reveal relics…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
