/**
 * ClassSelectScreen — 8-class selector with ability previews.
 */
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Lock, Swords, Shield, Zap, Coins } from 'lucide-react';
import { CLASSES, ClassDef } from '@/lib/altair/data/classes';
import { WEAPONS } from '@/lib/altair/data/weapons';
import { useAltairMetaStore } from '@/lib/altair/stores/meta-store';
import { useAltairSettingsStore } from '@/lib/altair/stores/settings-store';
import { useAltairToastStore } from '@/lib/altair/stores/toast-store';
import { useKeyboardNav } from '@/lib/altair/hooks/use-keyboard-nav';
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
  const doubleTimeUnlocked = useAltairMetaStore((s) => s.doubleTimeUnlocked);
  const doubleTime = useAltairSettingsStore((s) => s.doubleTime);
  const setDoubleTime = useAltairSettingsStore((s) => s.setDoubleTime);

  const handleGridSelect = useCallback((i: number) => {
    const cls = CLASSES[i];
    if (!cls) return;
    if (!unlockedClasses.includes(cls.id)) return;
    // If already selected, start the run
    if (selectedId === cls.id) {
      onSelect(cls.id);
    } else {
      setSelectedId(cls.id);
    }
  }, [unlockedClasses, selectedId, onSelect]);

  const { focusedIndex } = useKeyboardNav({
    itemCount: CLASSES.length,
    onSelect: handleGridSelect,
    orientation: 'grid',
    gridCols: 4,
  });

  // Escape to go back
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onBack]);

  const selectedClass = CLASSES.find((c) => c.id === selectedId);
  const startingWeapon = selectedClass ? WEAPONS.find((w) => w.id === selectedClass.startingWeaponId) : null;

  return (
    <div className="altair-parchment flex flex-col min-h-[calc(100vh-56px)] px-4 py-6 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-(--altair-text) mb-1">Choose Your Class</h2>
      <p className="text-sm text-(--altair-text-muted) mb-6">Select a class to begin your run</p>

      {/* Class grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {CLASSES.map((cls, i) => {
          const isUnlocked = unlockedClasses.includes(cls.id);
          const isSelected = selectedId === cls.id;
          const isFocused = focusedIndex === i && !isSelected;

          return (
            <button
              key={cls.id}
              onClick={() => isUnlocked && setSelectedId(cls.id)}
              disabled={!isUnlocked}
              className={`relative p-4 rounded-xl border text-left transition-all ${
                isSelected
                  ? 'border-2 scale-[1.02] shadow-lg'
                  : isFocused
                    ? 'border-2 border-(--altair-accent)/60 ring-1 ring-(--altair-accent)/30 bg-(--altair-surface-hover)'
                    : isUnlocked
                      ? 'border-(--altair-border) hover:border-(--altair-border-bright) hover:bg-(--altair-surface-hover)'
                      : 'border-(--altair-border) opacity-50 cursor-not-allowed'
              } bg-(--altair-surface)`}
              style={isSelected ? { borderColor: cls.color, boxShadow: `0 0 20px ${cls.color}30` } : {}}
            >
              {!isUnlocked && (
                <LockOverlay cls={cls} />
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

      {/* Double-time toggle */}
      <DoubleTimeToggle
        unlocked={doubleTimeUnlocked}
        enabled={doubleTime}
        onToggle={() => setDoubleTime(!doubleTime)}
      />

      {/* Action buttons */}
      <div className="mt-auto flex gap-3">
        <button
          onClick={onBack}
          data-altair-sfx="menu_back"
          className="flex-1 py-3 rounded-xl font-semibold text-(--altair-text-muted) bg-(--altair-surface) border border-(--altair-border) hover:bg-(--altair-surface-hover) transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => selectedId && onSelect(selectedId)}
          data-altair-sfx="ui_confirm"
          disabled={!selectedId}
          className={`flex-2 py-3 rounded-xl font-bold text-white transition-colors ${
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

// ── Lock overlay with popover ──────────────────────────────────────────

function LockOverlay({ cls }: { cls: ClassDef }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const coins = useAltairMetaStore((s) => s.coins);
  const purchaseClassUnlock = useAltairMetaStore((s) => s.purchaseClassUnlock);
  const addToast = useAltairToastStore((s) => s.addToast);

  const canPurchase = cls.unlockCost > 0 && coins >= cls.unlockCost;

  const handlePurchase = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (purchaseClassUnlock(cls.id, cls.unlockCost)) {
      addToast(`${cls.name} unlocked!`, 'success');
      setOpen(false);
    } else {
      addToast('Not enough coins!', 'error');
    }
  };

  // Close popover when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Raise parent card z-index so popover draws over sibling cards
  useEffect(() => {
    const card = ref.current?.closest('button') as HTMLElement | null;
    if (!card) return;
    if (open) {
      card.style.zIndex = '20';
      card.style.position = 'relative';
      card.style.opacity = '1';
    } else {
      card.style.zIndex = '';
      card.style.opacity = '';
    }
  }, [open]);

  return (
    <div
      ref={ref}
      className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50 z-10"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((v) => !v);
      }}
    >
      <Lock size={20} className="text-(--altair-text-dim)" />

      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 w-48 p-3 rounded-lg bg-(--altair-surface) border border-(--altair-border) shadow-xl pointer-events-auto">
          {/* Arrow */}
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-(--altair-surface) border-l border-t border-(--altair-border)" />

          <div className="relative flex flex-col items-center text-center gap-2">
            <Lock size={14} className="text-(--altair-text-dim)" />
            <span className="text-xs font-semibold text-(--altair-text)">
              {cls.name}
            </span>
            <p className="text-[11px] text-(--altair-text-muted) leading-snug">
              {cls.unlockCondition}
            </p>
            {cls.unlockCost > 0 && (
              <>
                <span className="flex items-center gap-1 text-[11px] font-bold text-(--altair-warning)">
                  <Coins size={12} />
                  {cls.unlockCost} coins
                </span>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={handlePurchase}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePurchase(e as unknown as React.MouseEvent); } }}
                  aria-disabled={!canPurchase}
                  className={`w-full mt-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors text-center ${
                    canPurchase
                      ? 'bg-(--altair-accent) hover:bg-(--altair-accent-hover) text-white cursor-pointer'
                      : 'bg-(--altair-surface-active) text-(--altair-text-dim) cursor-not-allowed pointer-events-none'
                  }`}
                >
                  {canPurchase ? 'Purchase' : 'Not enough coins'}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Double-time toggle (locked or unlocked) ─────────────────────────

function DoubleTimeToggle({
  unlocked,
  enabled,
  onToggle,
}: {
  unlocked: boolean;
  enabled: boolean;
  onToggle: () => void;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [popoverOpen]);

  if (unlocked) {
    return (
      <button
        onClick={onToggle}
        className="flex items-center gap-3 px-4 py-3 rounded-xl bg-(--altair-surface) border border-(--altair-border) mb-4 cursor-pointer select-none hover:bg-(--altair-surface-hover) transition-colors w-full text-left"
      >
        <div className={`w-9 h-5 rounded-full relative transition-colors ${enabled ? 'bg-(--altair-warning)' : 'bg-(--altair-surface-active)'}`}>
          <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : ''}`} />
        </div>
        <div className="flex items-center gap-2">
          <Zap size={16} className={enabled ? 'text-(--altair-warning)' : 'text-(--altair-text-dim)'} />
          <span className="text-sm font-semibold text-(--altair-text)">Double Time</span>
          <span className="text-[10px] text-(--altair-text-dim)">2x game speed</span>
        </div>
      </button>
    );
  }

  return (
    <div
      ref={ref}
      className="relative mb-4"
      onMouseEnter={() => setPopoverOpen(true)}
      onMouseLeave={() => setPopoverOpen(false)}
      onClick={() => setPopoverOpen((v) => !v)}
    >
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-(--altair-surface) border border-(--altair-border) opacity-50 cursor-pointer select-none">
        <div className="w-9 h-5 rounded-full relative bg-(--altair-surface-active)">
          <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white/50" />
        </div>
        <div className="flex items-center gap-2">
          <Lock size={14} className="text-(--altair-text-dim)" />
          <span className="text-sm font-semibold text-(--altair-text-dim)">Double Time</span>
          <span className="text-[10px] text-(--altair-text-dim)">Locked</span>
        </div>
      </div>

      {popoverOpen && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-56 p-3 rounded-lg bg-(--altair-surface) border border-(--altair-border) shadow-xl">
          {/* Arrow */}
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-(--altair-surface) border-r border-b border-(--altair-border)" />
          <div className="relative flex flex-col items-center text-center gap-1.5">
            <Zap size={16} className="text-(--altair-warning)" />
            <span className="text-xs font-bold text-(--altair-text)">Double Time</span>
            <p className="text-[11px] text-(--altair-text-muted) leading-snug">
              Complete a run (survive 20:00) to unlock 2x game speed mode
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
