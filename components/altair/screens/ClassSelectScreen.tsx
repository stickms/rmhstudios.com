/**
 * ClassSelectScreen — 8-class selector with ability previews.
 */
'use client';

import { useState } from 'react';
import { Lock, Swords, Shield, Zap } from 'lucide-react';
import { CLASSES, ClassDef } from '@/lib/altair/data/classes';
import { WEAPONS } from '@/lib/altair/data/weapons';
import { useAltairMetaStore } from '@/lib/altair/stores/meta-store';
import SpriteIcon from '@/components/altair/hud/SpriteIcon';

interface ClassSelectScreenProps {
  onSelect: (classId: string) => void;
  onBack: () => void;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  Easy: 'var(--altair-success)',
  Medium: 'var(--altair-warning)',
  Hard: 'var(--altair-danger)',
};

/** Renders the character's idle sprite (frame 0) from their sprite sheet. */
function ClassSprite({ classId, size = 48 }: { classId: string; size?: number }) {
  const filename = classId.replace('_', '-');
  return (
    <SpriteIcon
      sheetSrc={`/sprites/altair/characters/${filename}.png`}
      frameIndex={0}
      frameWidth={16}
      frameHeight={16}
      size={size}
    />
  );
}

export default function ClassSelectScreen({ onSelect, onBack }: ClassSelectScreenProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const unlockedClasses = useAltairMetaStore((s) => s.unlockedClasses);

  const selectedClass = CLASSES.find((c) => c.id === selectedId);
  const startingWeapon = selectedClass ? WEAPONS.find((w) => w.id === selectedClass.startingWeaponId) : null;

  return (
    <div className="altair-parchment flex flex-col min-h-[calc(100vh-56px)] px-4 py-6 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-(--altair-text) mb-1">Choose Your Class</h2>
      <p className="text-sm text-(--altair-text-muted) mb-6">Select a class to begin your run</p>

      {/* Class grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {CLASSES.map((cls) => {
          const isUnlocked = unlockedClasses.includes(cls.id);
          const isSelected = selectedId === cls.id;

          return (
            <button
              key={cls.id}
              onClick={() => isUnlocked && setSelectedId(cls.id)}
              disabled={!isUnlocked}
              className={`relative p-4 rounded-xl border text-left transition-all ${
                isSelected
                  ? 'border-2 scale-[1.02] shadow-lg'
                  : isUnlocked
                    ? 'border-(--altair-border) hover:border-(--altair-border-bright) hover:bg-(--altair-surface-hover)'
                    : 'border-(--altair-border) opacity-50 cursor-not-allowed'
              } bg-(--altair-surface)`}
              style={isSelected ? { borderColor: cls.color, boxShadow: `0 0 20px ${cls.color}30` } : {}}
            >
              {!isUnlocked && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 z-10">
                  <Lock size={20} className="text-(--altair-text-dim)" />
                </div>
              )}
              <ClassSprite classId={cls.id} size={40} />
              <h3 className="font-bold text-sm mt-2" style={{ color: cls.color }}>
                {cls.name}
              </h3>
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: DIFFICULTY_COLORS[cls.difficulty] }}
              >
                {cls.difficulty}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected class details */}
      {selectedClass && (
        <div
          className="p-5 rounded-xl border bg-(--altair-surface) mb-6 altair-modal"
          style={{ borderColor: `${selectedClass.color}40` }}
        >
          <div className="flex items-start gap-4 mb-4">
            <ClassSprite classId={selectedClass.id} size={64} />
            <div>
              <h3 className="text-xl font-bold" style={{ color: selectedClass.color }}>
                {selectedClass.name}
              </h3>
              <p className="text-sm text-(--altair-text-muted) italic">{selectedClass.tagline}</p>
              <p className="text-xs text-(--altair-text-dim) mt-1">{selectedClass.description}</p>
            </div>
          </div>

          {/* Starting weapon */}
          {startingWeapon && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-(--altair-bg-subtle) mb-3">
              <Swords size={14} className="text-(--altair-text-muted)" />
              <span className="text-xs text-(--altair-text-muted)">Starting weapon:</span>
              <span className="text-xs font-bold text-(--altair-text)">{startingWeapon.name}</span>
            </div>
          )}

          {/* Abilities */}
          <div className="flex flex-col gap-2">
            <div className="px-3 py-2 rounded-lg bg-(--altair-bg-subtle)">
              <div className="flex items-center gap-2 mb-1">
                <Shield size={12} className="text-(--altair-info)" />
                <span className="text-xs font-bold text-(--altair-text)">{selectedClass.ability1.name}</span>
                <span className="text-[10px] text-(--altair-text-dim)">Innate</span>
              </div>
              <p className="text-[11px] text-(--altair-text-muted)">{selectedClass.ability1.description}</p>
            </div>
            <div className="px-3 py-2 rounded-lg bg-(--altair-bg-subtle)">
              <div className="flex items-center gap-2 mb-1">
                <Zap size={12} className="text-(--altair-warning)" />
                <span className="text-xs font-bold text-(--altair-text)">{selectedClass.ability2.name}</span>
                <span className="text-[10px] text-(--altair-text-dim)">Lv.10</span>
              </div>
              <p className="text-[11px] text-(--altair-text-muted)">{selectedClass.ability2.description}</p>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-auto flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 py-3 rounded-xl font-semibold text-(--altair-text-muted) bg-(--altair-surface) border border-(--altair-border) hover:bg-(--altair-surface-hover) transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => selectedId && onSelect(selectedId)}
          disabled={!selectedId}
          className={`flex-[2] py-3 rounded-xl font-bold text-white transition-colors ${
            selectedId
              ? 'bg-(--altair-accent) hover:bg-(--altair-accent-hover)'
              : 'bg-(--altair-surface-active) text-(--altair-text-dim) cursor-not-allowed'
          }`}
        >
          Begin Run
        </button>
      </div>
    </div>
  );
}
