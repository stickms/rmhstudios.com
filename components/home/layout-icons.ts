/**
 * Icon-name → lucide component map for §15's layout catalog. The codebase
 * references lucide icons as direct imports (no dynamic resolver), so we keep a
 * small explicit map covering the icon names used by WIDGET_CATALOG and
 * SIDEBAR_NAV_META. Unknown names fall back to a neutral square.
 */
import {
  Gamepad2,
  Flame,
  History,
  Users,
  Briefcase,
  Radio,
  CalendarDays,
  Coins,
  Wand2,
  Library,
  ShoppingBag,
  TrendingUp,
  Trophy,
  Store,
  HelpCircle,
  ListMusic,
  Building2,
  Car,
  Terminal,
  Landmark,
  Shield,
  Eye,
  Atom,
  Brain,
  Square,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  Gamepad2,
  Flame,
  History,
  Users,
  Briefcase,
  Radio,
  CalendarDays,
  Coins,
  Wand2,
  Library,
  ShoppingBag,
  TrendingUp,
  Trophy,
  Store,
  HelpCircle,
  ListMusic,
  Building2,
  Car,
  Terminal,
  Landmark,
  Shield,
  Eye,
  Atom,
  Brain,
};

export function iconFor(name: string): LucideIcon {
  return ICONS[name] ?? Square;
}
