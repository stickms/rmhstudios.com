/**
 * Project Vega's island entry (redesign audit B1): the client entry
 * `vite.islands.config.ts` builds for this feature, mounted by the bare document
 * `app/routes/secret/vega.tsx` serves. The page (`ui/VegaPage.tsx`) is what the
 * router used to render there, without the site's router, shell or providers.
 *
 * The page lives in `ui/`, not here: both site sheets skip `features/vega/ui`,
 * and this file stays free of the page's one-off utilities.
 */
import './island.css';
import { mountIsland } from '@/components/island/mount';
import { VegaPage } from './ui/VegaPage';

mountIsland(<VegaPage />);
