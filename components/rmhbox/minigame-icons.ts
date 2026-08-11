/**
 * Minigame icon-name → lucide component map.
 *
 * `MINIGAME_REGISTRY` stores an `icon` string (kebab-case lucide name, or a bare
 * emoji) because the registry is imported by the server too, where a React
 * component would be dead weight. Resolving that string used to be
 * `icons[pascalName]` against lucide's `icons` namespace export — and a
 * namespace object indexed by a computed key is **unshakeable**: the bundler
 * cannot prove which members are reachable, so it retains all ~1,400 of them.
 * That single lookup, in two components, is what pinned lucide's 431 KB
 * `icons-*` chunk into the bundle graph.
 *
 * So the map is explicit, the same way `components/home/layout-icons.ts` and
 * `CommandPalette`'s `DESTINATION_ICONS` already do it. Only the nine lucide
 * names the registry actually uses are imported; registry entries whose `icon`
 * is an emoji resolve to `null` here and the caller renders the character.
 *
 * Keep in sync with `lib/rmhbox/minigame-registry.ts` — an unlisted name
 * resolves to `null`, which the callers already treat as "not a lucide icon".
 */
import {
  Brush,
  Clapperboard,
  Flame,
  Globe,
  ListCollapse,
  MicVocal,
  Pencil,
  ShieldCheck,
  Swords,
  type LucideIcon,
} from 'lucide-react';

/**
 * Keyed by the registry's kebab-case `icon` string, not by PascalCase.
 *
 * Exported as the map rather than wrapped in a `minigameIcon(icon)` lookup
 * function on purpose: `react-hooks/static-components` flags a *call* that
 * returns a component inside a render body ("Cannot create components during
 * render"), because it cannot tell a table lookup from a factory. A member
 * expression on a module-scope constant is the shape the rule accepts, and it is
 * what the callers used before (`icons[pascalName]`).
 */
export const MINIGAME_ICONS: Record<string, LucideIcon> = {
  brush: Brush,
  clapperboard: Clapperboard,
  flame: Flame,
  globe: Globe,
  'list-collapse': ListCollapse,
  'mic-vocal': MicVocal,
  pencil: Pencil,
  'shield-check': ShieldCheck,
  swords: Swords,
};
