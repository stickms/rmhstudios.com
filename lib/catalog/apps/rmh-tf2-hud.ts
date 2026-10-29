import type { AppInfo } from '../types';

const entry: AppInfo = {
  id: 'rmh-tf2-hud',
  order: 55,
  title: 'RMH TF2 Hub',
  description:
    'The Team Fortress 2 hub: play TF2 in your browser online or against bots, a custom HUD editor with a live preview and a per-class loadout builder, with a workshop to share both.',
  longDescription:
    'RMH TF2 Hub brings Team Fortress 2 to the browser. Play is the game itself on a clean-room engine: join a server or host your own room with bots on the games hub, or practise offline against bots that run on your own machine, with every class, the stock arsenal and the classic maps. The HUD Editor starts from the TF2 Default HUD, a community HUD or an uploaded zip, then lets you edit every .res file with a code editor and a visual inspector while a resolution-accurate canvas shows where each panel lands; test any page with adjustable health, ammo, class and round state, validate fonts, colours and textures, and download a ready-to-install zip. The Loadout Builder plans weapons, cosmetics, paints, unusual effects and taunts for every class from the game’s own item list, which refreshes itself when the game updates. Save loadouts per class, and share HUDs and loadouts in the RMH TF2 Workshop.',
  href: '/tf2',
  cta: 'Open the Hub',
  isSteam: false,
  gradient: 'from-orange-500 via-amber-600 to-red-700',
  iconName: 'LayoutDashboard',
  color: 'from-orange-500/20 to-red-700/20 hover:border-orange-500/50',
  tags: ['TF2', 'HUD', 'Loadout', 'Beta'],
  authGate: false,
};

export default entry;
