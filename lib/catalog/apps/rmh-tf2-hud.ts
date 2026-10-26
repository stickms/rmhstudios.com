import type { AppInfo } from '../types';

const entry: AppInfo = {
  id: 'rmh-tf2-hud',
  order: 55,
  title: 'RMH TF2 HUD Editor',
  description:
    'Build, preview, share and download Team Fortress 2 custom HUDs with a live in-browser preview.',
  longDescription:
    'RMH TF2 HUD Editor is a full custom-HUD workshop for Team Fortress 2. Start from the TF2 Default HUD, fork a community HUD or upload a zip, then edit every .res file with a code editor and a visual inspector while a resolution-accurate canvas shows exactly where each panel lands. Test any page with adjustable health, ammo, class, team and round state, compare against your own screenshot, see only the files you changed, validate fonts, colours and textures, then save to your account, share a link or download a ready-to-install zip.',
  href: '/tf2-hud',
  cta: 'Open the Editor',
  isSteam: false,
  gradient: 'from-orange-500 via-amber-600 to-red-700',
  iconName: 'LayoutDashboard',
  color: 'from-orange-500/20 to-red-700/20 hover:border-orange-500/50',
  tags: ['TF2', 'HUD', 'Editor', 'Beta'],
  authGate: false,
};

export default entry;
