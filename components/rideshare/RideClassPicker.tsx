'use client';

import { Car, Users, Sparkles, Leaf, Crown, Bike, Helicopter, type LucideIcon } from 'lucide-react';
import { RIDE_CLASSES, type RideClassId } from '@/lib/rideshare/classes';

export const RIDE_CLASS_ICONS: Record<string, LucideIcon> = {
  Car,
  Users,
  Sparkles,
  Leaf,
  Crown,
  Bike,
  Helicopter,
};

interface RideClassPickerProps {
  value: RideClassId;
  onChange: (id: RideClassId) => void;
  /** Optional per-class fare label, keyed by ride class id. */
  fareLabels?: Partial<Record<RideClassId, string>>;
}

export function RideClassPicker({ value, onChange, fareLabels }: RideClassPickerProps) {
  return (
    <div className="space-y-2">
      {RIDE_CLASSES.map((cls) => {
        const Icon = RIDE_CLASS_ICONS[cls.icon] ?? Car;
        const selected = cls.id === value;
        return (
          <button
            key={cls.id}
            type="button"
            onClick={() => onChange(cls.id)}
            aria-pressed={selected}
            className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all ${
              selected
                ? 'border-site-accent bg-site-accent/10'
                : 'border-site-border bg-site-surface hover:border-site-border-bright'
            }`}
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                selected ? 'bg-site-accent/20 text-site-accent' : 'bg-site-surface-hover text-site-text-muted'
              }`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-site-text">{cls.name}</span>
                <span className="flex items-center gap-1 text-xs text-site-text-muted">
                  <Users className="h-3 w-3" /> {cls.seats}
                </span>
              </div>
              <p className="truncate text-xs text-site-text-muted">{cls.description}</p>
            </div>
            {fareLabels?.[cls.id] && (
              <div className="shrink-0 text-right">
                <div className="text-sm font-bold text-site-accent">Free</div>
                <div className="text-[11px] text-site-text-dim line-through">{fareLabels[cls.id]}</div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
