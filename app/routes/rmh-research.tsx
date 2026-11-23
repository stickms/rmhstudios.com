import { createFileRoute } from '@tanstack/react-router';
import RmhResearchLayout from '@/components/rmh-research/Layout';
import rmhResearchCss from '@/components/rmh-research/rmh-research.css?url';
import homeCss from '@/components/rmh-research/pages/home.css?url';
import fieldsCss from '@/components/rmh-research/pages/fields.css?url';
import archiveCss from '@/components/rmh-research/pages/archive.css?url';
import authorsCss from '@/components/rmh-research/pages/authors.css?url';
import rIndexCss from '@/components/rmh-research/pages/r-index.css?url';
import psychologyCss from '@/components/rmh-research/pages/psychology.css?url';

// RMH Research is a full-screen microsite in the /rmh-pmc and /rmh-capital
// tradition, but in the site's own Steel look: the site's own faces (DM Sans and DM Mono or the reader's choice; the site's
// self-hosted faces), the `--site-*` tokens, and so the Day and Night editions,
// with no `theme-color`. The foundation sheet and every page sheet are linked
// here so in-site navigation never waits for a stylesheet.
export const Route = createFileRoute('/rmh-research')({
  head: () => ({
    links: [
      { rel: 'stylesheet', href: rmhResearchCss },
      { rel: 'stylesheet', href: homeCss },
      { rel: 'stylesheet', href: fieldsCss },
      { rel: 'stylesheet', href: archiveCss },
      { rel: 'stylesheet', href: authorsCss },
      { rel: 'stylesheet', href: rIndexCss },
      { rel: 'stylesheet', href: psychologyCss },
    ],
  }),
  component: RmhResearchLayout,
});
