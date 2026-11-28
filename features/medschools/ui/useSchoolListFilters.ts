import { useNavigate } from '@tanstack/react-router';
import { mineOfSearch, mineToSearch, type MineChoice } from '../engine/mine';
import { pickFilter } from '../engine/saved-filters';
import type { parseIndexSearch, parseLiveSearch, validateIndexSearch, validateLiveSearch } from '../engine/search';
import { holdScroll } from './hold-scroll';
import { useEffectiveView } from './useEffectiveView';
import { useMineFilter } from './useMineFilter';
import { saveFilters, useSavedFilters } from './useSavedFilters';

type PageSearch = ReturnType<typeof parseIndexSearch> | ReturnType<typeof parseLiveSearch>;
type SearchPatch = ReturnType<typeof validateIndexSearch> | ReturnType<typeof validateLiveSearch>;

/** The index and live feed share remembered filters. Only an explicit change writes its keys into the URL. */
export function useSchoolListFilters(kind: 'index' | 'live', search: PageSearch) {
  const { view, setSearch: setView } = useEffectiveView(kind, search);
  const saved = useSavedFilters().page;
  const states = pickFilter<string[]>(search.states, saved?.states, undefined, []);
  const mine = useMineFilter(mineOfSearch(search), saved?.mine);
  const navigate = useNavigate();

  function setSearch(patch: SearchPatch) {
    holdScroll();
    void navigate({
      to: kind === 'index' ? '/med' : '/med/live',
      search: (prev) => ({ ...prev, ...patch }),
      replace: true,
      resetScroll: false,
    });
  }

  function setStates(next: string[]) {
    saveFilters('page', { states: next });
    setSearch({ state: next.length ? next.join(',') : undefined });
  }

  function setMine(next: MineChoice | null) {
    saveFilters('page', { mine: next });
    setSearch(mineToSearch(next));
  }

  return {
    view,
    setView,
    states: states.value,
    mine,
    fromDevice: view.fromDevice || states.from === 'device' || mine.fromDevice,
    setSearch,
    setStates,
    setMine,
  };
}
