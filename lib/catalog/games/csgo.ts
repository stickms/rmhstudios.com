import type { GameInfo } from '../types';

const entry: GameInfo = {
  id: 'csgo',
  order: 250,
  title: 'Counter-Strike: Global Offensive',
  description: 'Counter-Strike: Global Offensive in your browser: bomb defusal or deathmatch on Dust II, against bots or friends.',
  longDescription:
    'Counter-Strike: Global Offensive’s Dust II on an independent browser engine, with default loadouts and plain weapons. Play bomb defusal (freeze time, a buy period, the money system, planting and defusing, first to 16) or deathmatch (instant respawns, free weapons). Practise offline against bots, or sign in to host a peer-to-peer match for friends; the match runs in the host’s browser and moves to another player if the host leaves. Keyboard and mouse, gamepad or touch.',
  href: '/csgo',
  status: 'Beta',
  cta: 'Play Now',
  isSteam: false,
  gradient: 'from-amber-500 to-sky-700',
  iconName: 'Crosshair',
  color: 'from-amber-500/20 to-sky-700/20 hover:border-amber-500/50',
  tags: ['Valve', 'FPS', 'Multiplayer', 'Beta'],
  authGate: false,
};

export default entry;
