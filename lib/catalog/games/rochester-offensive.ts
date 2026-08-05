import type { GameInfo } from '../types';

const entry: GameInfo = {
  id: 'rochester-offensive',
  order: 150,
  title: 'Mental-Hospital: Rochester Offensive',
  description:
    'A pixelated tactical 5v5 FPS — agents, abilities, an economy, the spike and MR13, plus co-op Zombies and online lobbies.',
  longDescription:
    'A browser-based, Valorant-inspired tactical shooter rendered in chunky pixel-art 3D. Pick an agent, buy weapons and abilities each round, plant or defuse the spike, and play to 13 in standard 5v5 — or team up for wave-based co-op Zombies against walkers, runners, brutes and spitters. Online lobbies with public/private rooms, team selection, and host-configurable AI fill, plus full mobile support with an on-screen joystick.',
  href: '/rochester-offensive',
  cta: 'Play Now',
  isSteam: false,
  gradient: 'from-red-600 to-blue-600',
  iconName: 'Crosshair',
  color: 'from-red-500/20 to-blue-600/20 hover:border-red-500/50',
  tags: ['FPS', 'Multiplayer', 'Tactical', '3D'],
  imagePath: '/images/games/rochester-offensive.webp',
  authGate: false,
};

export default entry;
