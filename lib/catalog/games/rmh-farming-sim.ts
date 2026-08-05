import type { GameInfo } from '../types';

const entry: GameInfo = {
  id: 'rmh-farming-sim',
  order: 180,
  title: 'RMH Farming Simulator',
  description:
    'A cozy pixel-3D farming sim — till, plant, water and harvest, sell at the shop, upgrade your gear, and farm co-op with friends.',
  longDescription:
    'Claim your own pixelated 3D homestead and grow it from a few seed packets into a thriving farm. Till the soil, plant seasonal crops across spring, summer, fall and winter, water them (or let the rain do it), and harvest for Normal, Silver or Gold quality. Sell produce at the General Store and shipping bin, buy new seeds, and upgrade your Hoe, Watering Can and Scythe through Copper, Iron and Gold tiers for wider area-of-effect. Every farm has a shareable invite code: friends request to join, the host approves or declines, and you all share one wallet, inventory and plot of land in real-time co-op — with a previously-joined-farms list to hop back in and host kick controls to keep things friendly.',
  href: '/rmh-farming-sim',
  cta: 'Start Farming',
  isSteam: false,
  gradient: 'from-green-500 to-amber-600',
  iconName: 'Sprout',
  color: 'from-green-500/20 to-amber-600/20 hover:border-green-500/50',
  tags: ['Simulation', 'Farming', 'Co-op', 'Multiplayer', '3D'],
  imagePath: '/images/games/rmh-farming-sim.webp',
  authGate: true,
};

export default entry;
