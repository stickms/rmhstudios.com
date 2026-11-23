import { createFileRoute } from '@tanstack/react-router';
import RmhPmcLayout from '@/components/rmh-pmc/Layout';
import rmhPmcCss from '@/components/rmh-pmc/rmh-pmc.css?url';

// The site's own faces (DM Sans and DM Mono, or the reader's choice) are self-hosted and set the whole
// microsite; the page follows the site's Day and Night editions and writes no
// `theme-color` (like rmh-capital). One stylesheet carries all six pages, so
// in-site navigation never waits for a sheet.
export const Route = createFileRoute('/rmh-pmc')({
  head: () => ({
    links: [{ rel: 'stylesheet', href: rmhPmcCss }],
  }),
  component: RmhPmcLayout,
});
