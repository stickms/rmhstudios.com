import { useNavigate } from '@tanstack/react-router';
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

/**
 * The view a public page shows: the URL where it speaks, the viewer's preferences where it is silent (plan D13/D14).
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
  const view = resolveView(kind, search, prefs, ctx);
  const navigate = useNavigate();

  const setSearch = (patch: ViewPatch) => {
    void navigate({
      to: '.',
      search: ((prev: Record<string, unknown>) => patchSearch(kind, prev, view, patch, prefs)) as never,
      replace: true,
      resetScroll: false,
    });
  };
  return { view, prefs, setSearch };
}
