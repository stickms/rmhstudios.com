import { createFileRoute } from '@tanstack/react-router';
import RmhPmcLayout from '@/components/rmh-pmc/Layout';
import rmhPmcCss from '@/components/rmh-pmc/rmh-pmc.css?url';

// Geist and Geist Mono are the site's own self-hosted faces and set the whole
// microsite; the page follows the site's Day and Night editions and writes no
// `theme-color` (like rmh-capital). One stylesheet carries all six pages, so
// in-site navigation never waits for a sheet.
export const Route = createFileRoute('/rmh-pmc')({
  head: () => ({
    links: [{ rel: 'stylesheet', href: rmhPmcCss }],
  }),
  component: RmhPmcLayout,
});
