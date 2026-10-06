import type { AppInfo } from '../types';

const entry: AppInfo = {
  id: 'dunesday',
  order: 120,
  title: 'Dunesday',
  description: 'Plan an MCU + Dune marathon that ends before Doomsday and Dune: Part Three.',
  // Kept short on purpose: the catalog ships in the site-wide entry chunk, and
  // the full pitch was what pushed it over its bundle budget (OPT-01).
  longDescription:
    'Every MCU film and series plus Dune, scheduled night by night before 18 Dec 2026 — with calendar, RSS, Discord and an AI buddy.',
  href: '/dunesday',
  status: 'New',
  cta: 'Plan my marathon',
  isSteam: false,
  gradient: 'from-sky-400 via-cyan-400 to-amber-300',
  iconName: 'Clapperboard',
  color: 'from-sky-500/20 to-amber-400/20 hover:border-sky-400/50',
  tags: ['Planner', 'Movies', 'AI'],
  authGate: false,
  // Full-screen top-level route (app/routes/dunesday.tsx) with its own Frutiger
  // Aero palette (components/dunesday/dunesday.css), so the site theme class
  // stays off — the route lands in THEME_EXCLUDED_ROUTES through this flag.
};

export default entry;
