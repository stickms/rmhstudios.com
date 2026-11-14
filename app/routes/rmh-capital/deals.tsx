import { createFileRoute } from '@tanstack/react-router';
import DealsPage from '@/components/rmh-capital/DealsPage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-capital/deals';
const TITLE = 'Deals — RMH Capital';
const DESC =
  'Transactions RMH Capital has announced: the all-stock combination of AMD and Nvidia to form NvidiAMD, and the Senior Secured Enlightenment Facility for the acquisition of Tibetan Buddhism. RMH Capital is a work of satire; the transactions are fictional.';

export const Route = createFileRoute('/rmh-capital/deals')({
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH }),
    links: [buildCanonical(PATH)],
  }),
  component: DealsPage,
});
