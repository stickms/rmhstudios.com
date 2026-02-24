/**
 * LucideAwardIcon — Maps server-provided icon name strings to Lucide React icons.
 *
 * Server award handlers send icon names (e.g. 'trophy', 'zap') instead of emoji.
 * This component resolves those names to the corresponding Lucide icon component.
 *
 * Usage:
 *   <LucideAwardIcon name="trophy" className="h-5 w-5" />
 */
'use client';

import {
  PencilLine,
  Gem,
  Waves,
  Zap,
  Trophy,
  Brain,
  Target,
  Skull,
  BookOpen,
  Snowflake,
  Flame,
  Search,
  Home,
  PersonStanding,
  Star,
  Map,
  AlertCircle,
  Award,
  MicVocal,
  ShieldCheck,
  ListCollapse,
  Globe,
  type LucideProps,
} from 'lucide-react';
import type { ComponentType } from 'react';

const ICON_MAP: Record<string, ComponentType<LucideProps>> = {
  'pencil-line': PencilLine,
  gem: Gem,
  waves: Waves,
  zap: Zap,
  trophy: Trophy,
  brain: Brain,
  target: Target,
  skull: Skull,
  'book-open': BookOpen,
  snowflake: Snowflake,
  flame: Flame,
  search: Search,
  home: Home,
  'person-standing': PersonStanding,
  star: Star,
  map: Map,
  'alert-circle': AlertCircle,
  'mic-vocal': MicVocal,
  'shield-check': ShieldCheck,
  'list-collapse': ListCollapse,
  globe: Globe,
};

interface LucideAwardIconProps extends LucideProps {
  name: string;
}

export default function LucideAwardIcon({ name, ...props }: LucideAwardIconProps) {
  const IconComponent = ICON_MAP[name];
  if (IconComponent) {
    return <IconComponent {...props} />;
  }
  // Fallback: render as text (handles any unmapped strings gracefully)
  return <Award {...props} />;
}
