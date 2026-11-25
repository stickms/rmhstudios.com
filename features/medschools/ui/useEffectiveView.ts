import { useNavigate } from '@tanstack/react-router';
import { holdScroll } from './hold-scroll';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/components/session/session-context';
import {
  patchSearch,
  resolveView,
  type EffectiveView,
  type Prefs,
  type PrefsSearch,
  type ViewKind,
  type ViewPatch,
} from '../engine/prefs';
import { prefsQuery } from '../medschools.queries';
import { saveFilters, useSavedFilters } from './useSavedFilters';

/**
 * The view a public page shows: the URL where it speaks, then this device's saved filters (index and live, owner
 * 2026-11-24; `useSavedFilters`, after hydration), then the viewer's preferences (plan D13/D14), then the default.
 * Signed out, or before the preferences arrive, it is exactly phase 3's view. The preferences are one private query
 * (`['medschools','me','prefs']`) that only runs for a signed-in viewer, so a signed-out request is unchanged.
 *
 * `setSearch` rewrites only the preference keys the page changes (`patchSearch`) and keeps the rest of the URL.
 */
export function useEffectiveView(
  kind: ViewKind,
  search: PrefsSearch,
  ctx?: { schoolDegree?: 'MD' | 'DO' },
): { view: EffectiveView; prefs: Prefs | null; setSearch: (patch: ViewPatch) => void } {
  const { data: session } = useSession();
  const signedIn = !!session;
  const { data } = useQuery({ ...prefsQuery(), enabled: signedIn });
  const prefs = signedIn ? (data ?? null) : null;
  const saved = useSavedFilters();
  const view = resolveView(kind, search, prefs, ctx, kind === 'school' ? {} : { programs: saved.page?.programs });
  const navigate = useNavigate();

  const setSearch = (patch: ViewPatch) => {
    // The index and the live page remember the program set on this device; all four clears it.
    if (kind !== 'school' && patch.programs) saveFilters('page', { programs: patch.programs });
    holdScroll();
    void navigate({
      to: '.',
      search: ((prev: Record<string, unknown>) => patchSearch(kind, prev, view, patch, prefs)) as never,
      replace: true,
      resetScroll: false,
    });
  };
  return { view, prefs, setSearch };
}
