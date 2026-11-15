/**
 * Signal Forge's island entry (redesign audit B1): the client entry
 * `vite.islands.config.ts` builds for this feature, mounted by the bare document
 * `app/routes/secret/signal-forge.tsx` serves. The page (`ui/SignalForgePage.tsx`)
 * is what the router used to render there, without the site's router, shell or
 * providers.
 *
 * The page lives in `ui/`, not here: both site sheets skip `features/signal-forge/ui`,
 * and this file stays free of the page's one-off utilities.
 */
import './island.css';
import { mountIsland } from '@/components/island/mount';
import { SignalForgePage } from './ui/SignalForgePage';

mountIsland(<SignalForgePage />);
