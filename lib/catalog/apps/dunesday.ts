import type { AppInfo } from '../types';

const entry: AppInfo = {
  id: 'dunesday',
  order: 120,
  title: 'Dunesday',
  description:
    'Plan your MCU + Dune marathon so you finish every film and show before Avengers: Doomsday and Dune: Part Three.',
  longDescription:
    'Dunesday schedules the whole Marvel Cinematic Universe — every film and Disney+ series — plus the Dune films, night by night, so the run ends before Avengers: Doomsday and Dune: Part Three open on 18 December 2026. Set a start date and an average watch time per day, or let it fit the plan to your deadline; shape the week, take days off, pick release or story order, tick off what you have seen and it re-plans around you. Export to your calendar, share your plan, and ask the built-in AI buddy about the films with a spoiler shield that knows how far you have got.',
  href: '/dunesday',
  status: 'New',
  cta: 'Plan my marathon',
  isSteam: false,
  gradient: 'from-sky-400 via-cyan-400 to-amber-300',
  iconName: 'Clapperboard',
  color: 'from-sky-500/20 to-amber-400/20 hover:border-sky-400/50',
  tags: ['Planner', 'Movies', 'MCU', 'Dune', 'AI'],
  authGate: false,
  // Full-screen top-level route (app/routes/dunesday.tsx) with its own Frutiger
  // Aero palette (components/dunesday/dunesday.css), so the site theme class
  // stays off — the route lands in THEME_EXCLUDED_ROUTES through this flag.
};

export default entry;
