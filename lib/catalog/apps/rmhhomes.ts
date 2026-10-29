import type { AppInfo } from '../types';

const entry: AppInfo = {
  id: 'rmhhomes',
  order: 110,
  title: 'RMHHomes',
  description:
    'A housing marketplace: member posts and real listings on one map. Filter and save.',
  longDescription:
    'RMHHomes is a housing marketplace that blends member-posted rentals and houses with real apartment/home postings aggregated from public feeds across the web. Browse everything on an interactive map, filter by price, beds, baths, property type and source, save favorites, and set up alerts for new matches. Post your own listing and message the owner directly, or jump straight to the original posting for aggregated listings.',
  href: '/homes',
  status: 'Beta',
  cta: 'Find a Home',
  isSteam: false,
  gradient: 'from-teal-500 via-emerald-500 to-green-600',
  iconName: 'Home',
  color: 'from-teal-500/20 to-green-600/20 hover:border-teal-500/50',
  tags: ['Housing', 'Search', 'Maps', 'Beta'],
  authGate: true,
  // All /homes routes render under the _site sidebar shell (app/routes/
  // _site/homes/*), so the site theme applies — without this flag the
  // theme class is stripped there (THEME_EXCLUDED_ROUTES).
  usesSiteTheme: true,
};

export default entry;
