'use client';

/**
 * Isleworks — catalogue icon lookup.
 *
 * Every `iconId` in `lib/isleworks/catalog.ts` resolves through this map. It is
 * an explicit import list rather than a dynamic lookup for one reason worth the
 * verbosity: a typo in a catalogue `iconId` becomes a *typecheck* failure here
 * instead of a blank square in the palette that nobody notices until release.
 */

import { createElement } from 'react';
import {
  Baby,
  BatteryCharging,
  Briefcase,
  Building,
  Building2,
  Bus,
  Coffee,
  Cpu,
  Cross,
  Droplet,
  Droplets,
  Dumbbell,
  Factory,
  Flame,
  Flower2,
  Gem,
  GraduationCap,
  Hammer,
  Home,
  Hotel,
  Lamp,
  Landmark,
  Palette,
  Recycle,
  Route,
  School,
  Shield,
  Ship,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Stethoscope,
  Store,
  Telescope,
  TrainFront,
  Trash2,
  TreePine,
  Trees,
  Warehouse,
  Wind,
  Sun,
  Zap,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  Baby,
  BatteryCharging,
  Briefcase,
  Building,
  Building2,
  Bus,
  Coffee,
  Cpu,
  Cross,
  Droplet,
  Droplets,
  Dumbbell,
  Factory,
  Flame,
  Flower2,
  Gem,
  GraduationCap,
  Hammer,
  Home,
  Hotel,
  Lamp,
  Landmark,
  Palette,
  Recycle,
  Route,
  School,
  Shield,
  Ship,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Stethoscope,
  Store,
  Telescope,
  TrainFront,
  Trash2,
  TreePine,
  Trees,
  Warehouse,
  Wind,
  Sun,
  Zap,
};

export function catalogIcon(iconId: string): LucideIcon {
  return ICONS[iconId] ?? Building;
}

/**
 * Render a catalogue icon.
 *
 * One stable component instead of `const Icon = catalogIcon(id)` at each call
 * site: writing `<Icon />` from a looked-up variable makes React see a fresh
 * component type on every render (it would remount, and it trips
 * `react-hooks/static-components`). `createElement` on a value from a frozen
 * module-level map has neither problem — the type is the same object every time.
 */
export function CatalogIcon({ id, size = 16 }: { id: string; size?: number }) {
  return createElement(catalogIcon(id), { size, 'aria-hidden': true });
}
