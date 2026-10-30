'use client';

import { useId } from 'react';
import {
  Anchor,
  Archive,
  AtSign,
  Award,
  Axe,
  BadgeCheck,
  BadgeDollarSign,
  Banknote,
  Bell,
  Bird,
  Bomb,
  BookOpen,
  Bookmark,
  Brain,
  Building2,
  CalendarCheck,
  CalendarDays,
  Cat,
  ChartBar,
  Check,
  CheckCheck,
  ChevronsUp,
  CircleDot,
  ClipboardList,
  Clock,
  Coins,
  Compass,
  Crown,
  Diamond,
  Dices,
  Disc3,
  Factory,
  Flag,
  Flame,
  Flower2,
  Gamepad2,
  Gem,
  Gift,
  Grab,
  Hammer,
  Hand,
  Handshake,
  Headphones,
  Heart,
  HeartHandshake,
  IdCard,
  Infinity as InfinityIcon,
  KeyRound,
  Keyboard,
  Landmark,
  Layers,
  Lightbulb,
  Link,
  Link2,
  ListChecks,
  ListMusic,
  Lock,
  Mail,
  Map,
  Medal,
  Megaphone,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Mic,
  Moon,
  Music,
  Music2,
  Package,
  PartyPopper,
  PenLine,
  PencilRuler,
  Plus,
  Quote,
  Radio,
  Repeat2,
  Rocket,
  Shield,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Skull,
  Slice,
  SlidersHorizontal,
  Spade,
  Sparkles,
  Star,
  Store,
  Sun,
  Sword,
  Swords,
  Target,
  ThumbsUp,
  Ticket,
  TrendingUp,
  Trophy,
  Tv,
  UserPlus,
  Users,
  UsersRound,
  Vote,
  Wallet,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  DEFAULT_ACHIEVEMENT_ICON,
  achievementAccentName,
  achievementIconName,
  achievementShape,
  compactCount,
  type AchievementShape,
} from '@/lib/achievements/icons';
import type { AchievementTier } from '@/lib/achievements/catalog';

/**
 * Every glyph an achievement badge can use, by lucide name. Explicit imports (not
 * `import * as`) so only these ship. `lib/achievements/icons.ts` is the source of
 * truth for which achievement gets which; `__tests__/achievement-icon.test.ts` fails
 * when this table and those maps drift apart.
 */
export const ACHIEVEMENT_ICON_COMPONENTS: Record<string, LucideIcon> = {
  Anchor,
  Archive,
  AtSign,
  Award,
  Axe,
  BadgeCheck,
  BadgeDollarSign,
  Banknote,
  Bell,
  Bird,
  Bomb,
  BookOpen,
  Bookmark,
  Brain,
  Building2,
  CalendarCheck,
  CalendarDays,
  Cat,
  ChartBar,
  Check,
  CheckCheck,
  ChevronsUp,
  CircleDot,
  ClipboardList,
  Clock,
  Coins,
  Compass,
  Crown,
  Diamond,
  Dices,
  Disc3,
  Factory,
  Flag,
  Flame,
  Flower2,
  Gamepad2,
  Gem,
  Gift,
  Grab,
  Hammer,
  Hand,
  Handshake,
  Headphones,
  Heart,
  HeartHandshake,
  IdCard,
  Infinity: InfinityIcon,
  KeyRound,
  Keyboard,
  Landmark,
  Layers,
  Lightbulb,
  Link,
  Link2,
  ListChecks,
  ListMusic,
  Lock,
  Mail,
  Map,
  Medal,
  Megaphone,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Mic,
  Moon,
  Music,
  Music2,
  Package,
  PartyPopper,
  PenLine,
  PencilRuler,
  Plus,
  Quote,
  Radio,
  Repeat2,
  Rocket,
  Shield,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Skull,
  Slice,
  SlidersHorizontal,
  Spade,
  Sparkles,
  Star,
  Store,
  Sun,
  Sword,
  Swords,
  Target,
  ThumbsUp,
  Ticket,
  TrendingUp,
  Trophy,
  Tv,
  UserPlus,
  Users,
  UsersRound,
  Vote,
  Wallet,
  Wind,
  Zap,
};

type Metal = {
  rim: [string, string, string];
  plate: [string, string];
  glyph: string;
  glow: string;
};

const TIER_METAL: Record<AchievementTier, Metal> = {
  bronze: {
    rim: ['#f1b982', '#b0763f', '#5b3416'],
    plate: ['#3a2616', '#1e130a'],
    glyph: '#ffd9b0',
    glow: '#ffb36b',
  },
  silver: {
    rim: ['#f4f7fb', '#b4bdc8', '#5d6773'],
    plate: ['#2e3640', '#171c22'],
    glyph: '#f4f7fb',
    glow: '#dfe7f0',
  },
  gold: {
    rim: ['#fff3b0', '#e6bd2e', '#8a6a0c'],
    plate: ['#3a2d0a', '#1c1604'],
    glyph: '#ffe27a',
    glow: '#ffd84d',
  },
  platinum: {
    rim: ['#e3f7ff', '#74ccff', '#2d73ff'],
    plate: ['#12304d', '#08172a'],
    glyph: '#c9efff',
    glow: '#6fd0ff',
  },
};
const LOCKED_METAL: Metal = {
  rim: ['#6b727b', '#454b53', '#2a2f35'],
  plate: ['#262a30', '#17191d'],
  glyph: '#78808a',
  glow: '#78808a',
};

/** The badge outline for a shape, in a 64x64 box (the inner plate is this, scaled). */
function ShapeEl({ shape, ...rest }: { shape: AchievementShape } & React.SVGProps<SVGElement>) {
  const common = rest as React.SVGProps<SVGPathElement>;
  switch (shape) {
    case 'hex': {
      const pts = [0, 1, 2, 3, 4, 5]
        .map((i) => {
          const a = ((-90 + 60 * i) * Math.PI) / 180;
          return `${(32 + 29 * Math.cos(a)).toFixed(2)},${(32 + 29 * Math.sin(a)).toFixed(2)}`;
        })
        .join(' ');
      return (
        <polygon
          points={pts}
          strokeLinejoin="round"
          {...(common as React.SVGProps<SVGPolygonElement>)}
        />
      );
    }
    case 'diamond':
      return (
        <polygon
          points="32,2 62,32 32,62 2,32"
          strokeLinejoin="round"
          {...(common as React.SVGProps<SVGPolygonElement>)}
        />
      );
    case 'shield':
      return (
        <path
          d="M32 3 L57 11 V30 C57 46 46 56 32 62 C18 56 7 46 7 30 V11 Z"
          strokeLinejoin="round"
          {...common}
        />
      );
    case 'square':
      return (
        <rect
          x="4"
          y="4"
          width="56"
          height="56"
          rx="13"
          {...(common as React.SVGProps<SVGRectElement>)}
        />
      );
    default:
      return <circle cx="32" cy="32" r="29" {...(common as React.SVGProps<SVGCircleElement>)} />;
  }
}

/** A four-point sparkle centred on (x, y). */
function sparkle(x: number, y: number, s: number): string {
  return `M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s}Z`;
}

const RAYS = Array.from({ length: 12 }, (_, i) => {
  const a = (i * 30 * Math.PI) / 180;
  const d = (7 * Math.PI) / 180;
  const p = (ang: number) =>
    `${(32 + 34 * Math.cos(ang)).toFixed(2)},${(32 + 34 * Math.sin(ang)).toFixed(2)}`;
  return `32,32 ${p(a - d)} ${p(a + d)}`;
});

/**
 * An achievement's badge, drawn in layers: a tier-metal outline in the category's
 * shape, a dark bevelled plate, sunburst rays for gold and platinum, the main glyph, a
 * small accent glyph in a corner badge, and — for counted goals — a ribbon with the
 * number. Locked badges are the same shape in dull grey, with no light on them.
 * Decorative; the achievement's name is always written beside it.
 */
export function AchievementIcon({
  id,
  tier,
  unlocked,
  target = 1,
  size = 64,
  className,
}: {
  id: string;
  tier: AchievementTier;
  unlocked: boolean;
  /** The count the achievement asks for; above 1 it is written on a ribbon. */
  target?: number;
  size?: number;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const metal = unlocked ? TIER_METAL[tier] : LOCKED_METAL;
  const shape = achievementShape(id);
  const Glyph =
    ACHIEVEMENT_ICON_COMPONENTS[achievementIconName(id)] ??
    ACHIEVEMENT_ICON_COMPONENTS[DEFAULT_ACHIEVEMENT_ICON];
  const accentName = achievementAccentName(id);
  const Accent = accentName ? ACHIEVEMENT_ICON_COMPONENTS[accentName] : null;
  const ribbon = target > 1;
  const lit = unlocked && (tier === 'gold' || tier === 'platinum');
  const glyphSize = ribbon ? 27 : 31;
  const gx = 32 - glyphSize / 2;
  const gy = ribbon ? 12 : 32 - glyphSize / 2;

  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={['st-ach-icon', className].filter(Boolean).join(' ')}
      data-tier={tier}
      data-unlocked={unlocked ? 'true' : 'false'}
      data-shape={shape}
    >
      <defs>
        <linearGradient id={`${uid}r`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={metal.rim[0]} />
          <stop offset="0.5" stopColor={metal.rim[1]} />
          <stop offset="1" stopColor={metal.rim[2]} />
        </linearGradient>
        <linearGradient id={`${uid}p`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={metal.plate[0]} />
          <stop offset="1" stopColor={metal.plate[1]} />
        </linearGradient>
        <radialGradient id={`${uid}g`} cx="0.5" cy="0.4" r="0.6">
          <stop offset="0" stopColor={metal.glow} stopOpacity="0.45" />
          <stop offset="1" stopColor={metal.glow} stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${uid}c`}>
          <g transform="translate(32 32) scale(0.84) translate(-32 -32)">
            <ShapeEl shape={shape} />
          </g>
        </clipPath>
      </defs>

      {/* Outline in tier metal, then the dark plate inside it. */}
      <ShapeEl shape={shape} fill={`url(#${uid}r)`} stroke={metal.rim[2]} strokeWidth="1.2" />
      <g transform="translate(32 32) scale(0.84) translate(-32 -32)">
        <ShapeEl shape={shape} fill={`url(#${uid}p)`} stroke={metal.rim[2]} strokeWidth="1" />
      </g>

      <g clipPath={`url(#${uid}c)`}>
        {unlocked ? <rect width="64" height="64" fill={`url(#${uid}g)`} /> : null}
        {lit
          ? RAYS.map((points, i) => (
              <polygon key={i} points={points} fill={metal.glow} opacity="0.13" />
            ))
          : null}
        {unlocked ? <ellipse cx="32" cy="17" rx="19" ry="9" fill="#fff" opacity="0.07" /> : null}
      </g>

      {unlocked && tier === 'platinum' ? (
        <g fill={metal.glyph}>
          <path d={sparkle(9, 13, 4.5)} />
          <path d={sparkle(55, 9, 3.5)} />
          <path d={sparkle(57, 45, 3)} />
        </g>
      ) : null}

      {/* Main glyph, with a soft drop shadow for depth. */}
      <Glyph
        x={gx + 0.6}
        y={gy + 1.2}
        size={glyphSize}
        color="#000"
        strokeWidth={1.75}
        opacity={unlocked ? 0.45 : 0.3}
      />
      <Glyph x={gx} y={gy} size={glyphSize} color={metal.glyph} strokeWidth={1.75} />

      {Accent ? (
        <g>
          <circle
            cx="50"
            cy="14"
            r="9.5"
            fill={`url(#${uid}r)`}
            stroke={metal.rim[2]}
            strokeWidth="1"
          />
          <Accent x={44} y={8} size={12} color={metal.plate[1]} strokeWidth={2.2} />
        </g>
      ) : null}

      {ribbon ? (
        <g>
          <rect
            x="15"
            y="46"
            width="34"
            height="13"
            rx="3.5"
            fill={`url(#${uid}p)`}
            stroke={`url(#${uid}r)`}
            strokeWidth="1.4"
          />
          <text
            x="32"
            y="55.6"
            textAnchor="middle"
            fontSize="9.5"
            fontWeight="700"
            fill={metal.glyph}
            style={{ fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' }}
          >
            {compactCount(target)}
          </text>
        </g>
      ) : null}
    </svg>
  );
}
