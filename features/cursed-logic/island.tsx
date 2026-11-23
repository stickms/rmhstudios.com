/**
 * Cursed Logic's island entry (redesign audit B1): the client entry `vite.islands.config.ts` builds for this
 * feature, mounted by the bare document `app/routes/cursed-logic.tsx` serves. The page
 * (`ui/CursedLogicPage.tsx`) is what the router used to render at `/secret/cursed-logic`, without the site's
 * router, shell or providers.
 *
 * The page lives in `ui/`, not here: both site sheets skip `features/cursed-logic/ui`, and this file stays free
 * of the page's one-off utilities.
 */
import './island.css';
import { mountIsland } from '@/components/island/mount';
import { CursedLogicPage } from './ui/CursedLogicPage';

mountIsland(<CursedLogicPage />);
