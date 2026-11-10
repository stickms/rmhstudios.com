import { useEffect, useState, type RefObject } from 'react';

/** Room the playfield leaves around itself inside its container, in px. */
export interface MarginRoom {
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** The field's own left edge and width, so a bar can line up with it. */
  stageLeft: number;
  stageWidth: number;
}

/** Shorter than this and a top bar cannot hold the song, the score and the groove. */
export const TOP_BAR_MIN = 92;
/** Shorter than this and a bottom bar cannot hold the tally. */
export const BOTTOM_BAR_MIN = 56;

/**
 * How much room the 16:9 playfield leaves above, below and beside itself.
 *
 * The field is held to its ratio for fairness, so a window that is taller than 16:9
 * leaves bands above and below it and one that is wider leaves margins either side.
 * That room is where the readouts and the music go. Measured when the layout changes
 * (a `ResizeObserver` on the container and the field), never per frame, and the state
 * only changes when a number does, so a steady window re-renders nothing.
 */
export function useMarginRoom(
  rootRef: RefObject<HTMLElement | null>,
  stageRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  /**
   * Changes when something outside the two observed boxes moves the field without
   * resizing it: the multiplayer leaderboard mounting beside it re-centres a field of
   * the same width, and neither observer fires for a move.
   */
  layoutKey?: unknown,
): MarginRoom | null {
  const [room, setRoom] = useState<MarginRoom | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    if (!enabled || !root || !stage) {
      setRoom(null);
      return;
    }
    const measure = () => {
      const box = root.getBoundingClientRect();
      const field = stage.getBoundingClientRect();
      const next: MarginRoom = {
        top: Math.max(0, Math.round(field.top - box.top)),
        bottom: Math.max(0, Math.round(box.bottom - field.bottom)),
        left: Math.max(0, Math.round(field.left - box.left)),
        right: Math.max(0, Math.round(box.right - field.right)),
        stageLeft: Math.round(field.left - box.left),
        stageWidth: Math.round(field.width),
      };
      setRoom((prev) =>
        prev &&
        prev.top === next.top &&
        prev.bottom === next.bottom &&
        prev.left === next.left &&
        prev.right === next.right &&
        prev.stageLeft === next.stageLeft &&
        prev.stageWidth === next.stageWidth
          ? prev
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [rootRef, stageRef, enabled, layoutKey]);

  return room;
}
