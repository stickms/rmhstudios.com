import type { GameInfo } from '../types';

const entry: GameInfo = {
  id: 'dream-rift',
  order: 170,
  title: 'Dream Rift',
  description:
    'A danmaku bullet hell — dodge gorgeous bullet curtains solo or in up to 4-player co-op across three dream worlds.',
  longDescription:
    'A vertical bullet-hell shoot-’em-up: weave a tiny pinpoint hitbox through dense, beautiful danmaku curtains, graze bullets for score, bomb to survive, and capture each boss’s spell cards before the timer runs out. Four playable dreamers — the shrine maiden Reika, the star-thief witch Mira, the tideglass diviner Aoi and void-walker Nyx — each with a distinct shot type. Three stages with mid-bosses, animated bosses and a synced story, a driving techno soundtrack, and Nico Nico–style scrolling comments. Play solo, or create public/private lobbies for up to four-player co-op with forgiving client-authoritative netcode (lag never kills you). Fixed-aspect, fair-by-design, with full mobile touch controls.',
  href: '/dream-rift',
  cta: 'Enter the Rift',
  isSteam: false,
  gradient: 'from-fuchsia-600 to-violet-700',
  iconName: 'Sparkles',
  color: 'from-fuchsia-500/20 to-violet-700/20 hover:border-fuchsia-500/50',
  tags: ['Bullet Hell', 'Multiplayer', 'Danmaku', 'Pixel Art'],
  imagePath: '/images/games/dream-rift.webp',
  authGate: false,
};

export default entry;
