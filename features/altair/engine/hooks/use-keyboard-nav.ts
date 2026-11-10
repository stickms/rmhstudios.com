/**
 * useKeyboardNav — Shared keyboard navigation for Altair UI screens.
 * Supports WASD, Arrow keys, Tab/Shift+Tab for movement; Space/Enter to confirm.
 * Number keys 1-9 for direct selection (optional).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { altairSfx } from '../audio/sfx';

interface UseKeyboardNavOptions {
  /** Total number of navigable items */
  itemCount: number;
  /** Called when the user confirms the focused item (Space/Enter or number key) */
  onSelect: (index: number) => void;
  /** Navigation layout direction */
  orientation?: 'horizontal' | 'vertical' | 'grid';
  /** Number of columns when orientation is 'grid' */
  gridCols?: number;
  /** Enable/disable the hook (e.g. when the screen is not visible) */
  enabled?: boolean;
  /** Allow number keys 1-9 for instant selection */
  numberKeys?: boolean;
}

export function useKeyboardNav({
  itemCount,
  onSelect,
  orientation = 'vertical',
  gridCols = 4,
  enabled = true,
  numberKeys = false,
}: UseKeyboardNavOptions) {
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Keep stable refs so the effect doesn't churn
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const focusRef = useRef(focusedIndex);
  focusRef.current = focusedIndex;

  // Clamp focused index when item count changes
  useEffect(() => {
    setFocusedIndex((prev) => Math.min(prev, Math.max(0, itemCount - 1)));
  }, [itemCount]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (itemCount === 0) return;

      const key = e.key;
      const idx = focusRef.current;
      let next = idx;
      let handled = false;

      // Navigation
      const isUp = key === 'ArrowUp' || key === 'w' || key === 'W';
      const isDown = key === 'ArrowDown' || key === 's' || key === 'S';
      const isLeft = key === 'ArrowLeft' || key === 'a' || key === 'A';
      const isRight = key === 'ArrowRight' || key === 'd' || key === 'D';
      const isTab = key === 'Tab';

      if (orientation === 'horizontal') {
        if (isLeft || (isTab && e.shiftKey)) {
          next = (idx - 1 + itemCount) % itemCount;
          handled = true;
        } else if (isRight || (isTab && !e.shiftKey)) {
          next = (idx + 1) % itemCount;
          handled = true;
        }
      } else if (orientation === 'vertical') {
        if (isUp || (isTab && e.shiftKey)) {
          next = (idx - 1 + itemCount) % itemCount;
          handled = true;
        } else if (isDown || (isTab && !e.shiftKey)) {
          next = (idx + 1) % itemCount;
          handled = true;
        }
      } else if (orientation === 'grid') {
        if (isLeft) {
          next = (idx - 1 + itemCount) % itemCount;
          handled = true;
        } else if (isRight) {
          next = (idx + 1) % itemCount;
          handled = true;
        } else if (isUp) {
          next = idx - gridCols;
          if (next < 0) next = (idx % gridCols) + (Math.ceil(itemCount / gridCols) - 1) * gridCols;
          if (next >= itemCount) next = itemCount - 1;
          handled = true;
        } else if (isDown) {
          next = idx + gridCols;
          if (next >= itemCount) next = idx % gridCols;
          handled = true;
        } else if (isTab) {
          if (e.shiftKey) {
            next = (idx - 1 + itemCount) % itemCount;
          } else {
            next = (idx + 1) % itemCount;
          }
          handled = true;
        }
      }

      if (handled) {
        e.preventDefault();
        setFocusedIndex(next);
        return;
      }

      // Confirm with Space or Enter
      if (key === ' ' || key === 'Enter') {
        e.preventDefault();
        altairSfx.play('ui_click');
        onSelectRef.current(focusRef.current);
        return;
      }

      // Number keys for direct selection (1-indexed)
      if (numberKeys) {
        const num = parseInt(key);
        if (num >= 1 && num <= Math.min(itemCount, 9)) {
          e.preventDefault();
          setFocusedIndex(num - 1);
          altairSfx.play('ui_click');
          onSelectRef.current(num - 1);
        }
      }
    },
    [itemCount, orientation, gridCols, numberKeys],
  );

  useEffect(() => {
    if (!enabled || itemCount === 0) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, itemCount, handleKeyDown]);

  return { focusedIndex, setFocusedIndex };
}
