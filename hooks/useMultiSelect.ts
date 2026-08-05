'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Multi-select for editable lists (B9).
 *
 * The pointer half is the behaviour every file manager has taught users: plain
 * click replaces the selection, ctrl/cmd-click toggles one row, shift-click
 * extends from the last row touched. The keyboard half is not optional — a list
 * whose only way to select several rows is shift-click is unusable without a
 * mouse, and jsx-a11y cannot see that, because the markup is perfectly valid.
 * So `getItemProps` hands back both, and every pointer gesture has a key:
 *
 * | intent          | pointer            | keyboard                    |
 * | --------------- | ------------------ | --------------------------- |
 * | replace         | click              | Enter                       |
 * | toggle          | ctrl/cmd + click   | Space, ctrl/cmd + Enter     |
 * | extend range    | shift + click      | shift + Space / shift + ↑↓  |
 * | select all      | —                  | ctrl/cmd + A                |
 * | clear           | —                  | Escape                      |
 *
 * The reducer below is pure and exported so the range/anchor arithmetic — the
 * part that is actually easy to get wrong — is unit-testable without a DOM.
 */

/** What a gesture asked the selection to do. */
export type SelectionIntent = 'replace' | 'toggle' | 'range';

/** The parts of a mouse/keyboard event the reducer cares about. */
export interface SelectionModifiers {
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
}

/** Selection state: which ids are picked, and where a range would extend from. */
export interface SelectionState {
  selected: ReadonlySet<string>;
  /** Index the next shift-range extends from; `null` before the first pick. */
  anchorIndex: number | null;
}

/** Map a modifier combination to an intent. Shift wins over ctrl/cmd. */
export function intentFromModifiers(mods: SelectionModifiers): SelectionIntent {
  if (mods.shiftKey) return 'range';
  if (mods.metaKey || mods.ctrlKey) return 'toggle';
  return 'replace';
}

/** The ids between two indices, inclusive, in either direction. */
export function rangeIds(ids: readonly string[], from: number, to: number): string[] {
  const low = Math.max(0, Math.min(from, to));
  const high = Math.min(ids.length - 1, Math.max(from, to));
  if (high < low) return [];
  return ids.slice(low, high + 1);
}

/**
 * Apply one selection gesture. Pure — no React, no DOM.
 *
 * A `range` with no anchor yet degrades to `replace` rather than selecting
 * nothing: shift-clicking as the first action in a list should still pick that
 * row, which is what every desktop list does.
 */
export function applySelection(
  state: SelectionState,
  ids: readonly string[],
  index: number,
  intent: SelectionIntent,
): SelectionState {
  if (index < 0 || index >= ids.length) return state;
  const id = ids[index];

  if (intent === 'range') {
    if (state.anchorIndex === null) {
      return { selected: new Set([id]), anchorIndex: index };
    }
    // The anchor is deliberately NOT moved: dragging a range back and forth with
    // shift should pivot around the row the range started from.
    return {
      selected: new Set(rangeIds(ids, state.anchorIndex, index)),
      anchorIndex: state.anchorIndex,
    };
  }

  if (intent === 'toggle') {
    const next = new Set(state.selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { selected: next, anchorIndex: index };
  }

  return { selected: new Set([id]), anchorIndex: index };
}

/** Drop ids that are no longer in the list (a row was deleted under us). */
export function pruneSelection(state: SelectionState, ids: readonly string[]): SelectionState {
  const live = new Set(ids);
  let changed = false;
  const next = new Set<string>();
  for (const id of state.selected) {
    if (live.has(id)) next.add(id);
    else changed = true;
  }
  if (!changed) return state;
  return {
    selected: next,
    anchorIndex:
      state.anchorIndex !== null && state.anchorIndex < ids.length ? state.anchorIndex : null,
  };
}

export interface MultiSelectItemProps {
  'aria-pressed': boolean;
  'data-selected': boolean | undefined;
  onClick: (event: SelectionModifiers) => void;
  onKeyDown: (event: MultiSelectKeyEvent) => void;
}

/** The subset of a keyboard event `onItemKeyDown` reads. */
export interface MultiSelectKeyEvent extends SelectionModifiers {
  key: string;
  preventDefault: () => void;
}

export interface UseMultiSelect {
  /** Currently selected ids. */
  selected: ReadonlySet<string>;
  /** Selected ids in list order — what a bulk action should iterate. */
  selectedIds: string[];
  count: number;
  allSelected: boolean;
  isSelected: (id: string) => boolean;
  /** Handle a pointer gesture on a row. */
  onItemClick: (id: string, event: SelectionModifiers) => void;
  /** Handle a key press on a row (see the table in this file's docblock). */
  onItemKeyDown: (id: string, event: MultiSelectKeyEvent) => void;
  /** Everything a selectable row needs, in one spread. */
  getItemProps: (id: string) => MultiSelectItemProps;
  toggle: (id: string) => void;
  selectAll: () => void;
  clear: () => void;
}

/**
 * Track a multi-selection over a list of `{ id }` items.
 *
 * The item array is the source of truth for order and membership: selections of
 * rows that disappear are pruned automatically, so a bulk delete cannot leave a
 * ghost id in the action bar's count.
 */
export function useMultiSelect<T extends { id: string }>(items: readonly T[]): UseMultiSelect {
  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const [state, setState] = useState<SelectionState>({ selected: new Set(), anchorIndex: null });

  // `ids` in a ref so the handlers below stay referentially stable across list
  // re-renders — a row's onClick identity changing every render defeats memoized
  // rows, which is the whole reason a long list uses a hook like this.
  const idsRef = useRef(ids);
  idsRef.current = ids;

  useEffect(() => {
    setState((prev) => pruneSelection(prev, ids));
  }, [ids]);

  const onItemClick = useCallback((id: string, event: SelectionModifiers) => {
    const index = idsRef.current.indexOf(id);
    if (index === -1) return;
    setState((prev) => applySelection(prev, idsRef.current, index, intentFromModifiers(event)));
  }, []);

  const clear = useCallback(() => {
    setState((prev) =>
      prev.selected.size === 0 ? prev : { selected: new Set(), anchorIndex: null },
    );
  }, []);

  const selectAll = useCallback(() => {
    setState((prev) => ({
      selected: new Set(idsRef.current),
      anchorIndex: prev.anchorIndex ?? 0,
    }));
  }, []);

  const toggle = useCallback((id: string) => {
    const index = idsRef.current.indexOf(id);
    if (index === -1) return;
    setState((prev) => applySelection(prev, idsRef.current, index, 'toggle'));
  }, []);

  const onItemKeyDown = useCallback(
    (id: string, event: MultiSelectKeyEvent) => {
      const list = idsRef.current;
      const index = list.indexOf(id);
      if (index === -1) return;

      // Select-all / clear, the two shortcuts a keyboard user expects from a
      // list they can already select rows in.
      if ((event.metaKey || event.ctrlKey) && (event.key === 'a' || event.key === 'A')) {
        event.preventDefault();
        selectAll();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        clear();
        return;
      }

      // Shift + arrow extends the range one row at a time — the keyboard
      // equivalent of dragging a shift-click down the list.
      if (event.shiftKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
        setState((prev) =>
          applySelection(prev, list, Math.max(0, Math.min(list.length - 1, next)), 'range'),
        );
        return;
      }

      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        setState((prev) => applySelection(prev, list, index, event.shiftKey ? 'range' : 'toggle'));
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        setState((prev) => applySelection(prev, list, index, intentFromModifiers(event)));
      }
    },
    [clear, selectAll],
  );

  const isSelected = useCallback((id: string) => state.selected.has(id), [state.selected]);

  const getItemProps = useCallback(
    (id: string): MultiSelectItemProps => ({
      'aria-pressed': state.selected.has(id),
      'data-selected': state.selected.has(id) || undefined,
      onClick: (event) => onItemClick(id, event),
      onKeyDown: (event) => onItemKeyDown(id, event),
    }),
    [state.selected, onItemClick, onItemKeyDown],
  );

  const selectedIds = useMemo(
    () => ids.filter((id) => state.selected.has(id)),
    [ids, state.selected],
  );

  return {
    selected: state.selected,
    selectedIds,
    count: state.selected.size,
    allSelected: ids.length > 0 && state.selected.size === ids.length,
    isSelected,
    onItemClick,
    onItemKeyDown,
    getItemProps,
    toggle,
    selectAll,
    clear,
  };
}
