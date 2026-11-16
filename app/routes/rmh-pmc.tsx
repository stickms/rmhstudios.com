import { createFileRoute } from '@tanstack/react-router';
import RmhPmcLayout from '@/components/rmh-pmc/Layout';
import rmhPmcCss from '@/components/rmh-pmc/rmh-pmc.css?url';
import homeCss from '@/components/rmh-pmc/pages/home.css?url';
import commandCss from '@/components/rmh-pmc/pages/command.css?url';
import capabilitiesCss from '@/components/rmh-pmc/pages/capabilities.css?url';
import intelligenceCss from '@/components/rmh-pmc/pages/intelligence.css?url';
import operatorsCss from '@/components/rmh-pmc/pages/operators.css?url';
import contactCss from '@/components/rmh-pmc/pages/contact.css?url';

// Geist and Geist Mono are the site's own self-hosted faces and set the whole
// microsite; the page follows the site's Day and Night editions and writes no
// `theme-color` (like rmh-capital). The foundation sheet and all six page
// sheets are linked here so in-site navigation never waits for a stylesheet.
export const Route = createFileRoute('/rmh-pmc')({
  head: () => ({
    links: [
      { rel: 'stylesheet', href: rmhPmcCss },
      { rel: 'stylesheet', href: homeCss },
      { rel: 'stylesheet', href: commandCss },
      { rel: 'stylesheet', href: capabilitiesCss },
      { rel: 'stylesheet', href: intelligenceCss },
      { rel: 'stylesheet', href: operatorsCss },
      { rel: 'stylesheet', href: contactCss },
    ],
  }),
  component: RmhPmcLayout,
});
