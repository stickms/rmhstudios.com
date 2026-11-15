import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { Layout } from '@/lib/elections/room-config';
import {
  DEFAULT_SPLIT,
  STEP,
  clampShare,
  parseSplits,
  shareFromPointer,
  type Split,
} from '@/lib/elections/split';

const KEY =
  'rmh-elections-split';

type Axis =
  | 'c'
  | 'r';

/** Draggable pane sizes for the current layout, saved per layout in this browser. */
/** `pad` and `gap` are the grid's padding and gap in px (they follow the viewer's spacing choice). */
export function useSplit(
  layout: Layout,
  pad: number,
  gap: number,
) {
  const [
    all,
    setAll,
  ] =
    useState<
      Partial<
        Record<
          Layout,
          Split
        >
      >
    >(
      {},
    );
  const [
    dragging,
    setDragging,
  ] =
    useState<Axis | null>(
      null,
    );
  const grid =
    useRef<HTMLDivElement | null>(
      null,
    );

  useEffect(() => {
    try {
      setAll(
        parseSplits(
          localStorage.getItem(
            KEY,
          ),
        ),
      );
    } catch {
      /* private mode: sizes last for this visit only */
    }
  }, []);

  const split =
    all[
      layout
    ] ??
    DEFAULT_SPLIT[
      layout
    ];

  const save =
    useCallback(
      (
        next: Partial<
          Record<
            Layout,
            Split
          >
        >,
      ) => {
        try {
          localStorage.setItem(
            KEY,
            JSON.stringify(
              next,
            ),
          );
        } catch {
          /* ignore */
        }
      },
      [],
    );

  const set =
    useCallback(
      (
        axis: Axis,
        value: number,
        persist = false,
      ) => {
        setAll(
          (
            cur,
          ) => {
            const prev =
              cur[
                layout
              ] ??
              DEFAULT_SPLIT[
                layout
              ];
            const next =
              {
                ...cur,
                [layout]:
                  {
                    ...prev,
                    [axis]:
                      clampShare(
                        value,
                      ),
                  },
              };
            if (
              persist
            )
              save(
                next,
              );
            return next;
          },
        );
      },
      [
        layout,
        save,
      ],
    );

  const reset =
    useCallback(
      (
        axis: Axis,
      ) =>
        set(
          axis,
          DEFAULT_SPLIT[
            layout
          ][
            axis
          ],
          true,
        ),
      [
        layout,
        set,
      ],
    );

  /** Pointer handlers for a divider on `axis`; `from` is the start of the track area the share is measured in. */
  const handlers =
    (
      axis: Axis,
    ) => ({
      onPointerDown:
        (
          e: React.PointerEvent<HTMLDivElement>,
        ) => {
          if (
            e.button !==
            0
          )
            return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(
            e.pointerId,
          );
          setDragging(
            axis,
          );
        },
      onPointerMove:
        (
          e: React.PointerEvent<HTMLDivElement>,
        ) => {
          const el =
            grid.current;
          if (
            !el ||
            !e.currentTarget.hasPointerCapture(
              e.pointerId,
            )
          )
            return;
          const rect =
            el.getBoundingClientRect();
          set(
            axis,
            axis ===
              'c'
              ? shareFromPointer(
                  e.clientX,
                  rect.left,
                  rect.width,
                  pad,
                  gap,
                )
              : shareFromPointer(
                  e.clientY,
                  rect.top,
                  rect.height,
                  pad,
                  gap,
                ),
          );
        },
      onPointerUp:
        (
          e: React.PointerEvent<HTMLDivElement>,
        ) => {
          if (
            e.currentTarget.hasPointerCapture(
              e.pointerId,
            )
          )
            e.currentTarget.releasePointerCapture(
              e.pointerId,
            );
          setDragging(
            null,
          );
          setAll(
            (
              cur,
            ) => {
              save(
                cur,
              );
              return cur;
            },
          );
        },
      onKeyDown:
        (
          e: React.KeyboardEvent<HTMLDivElement>,
        ) => {
          const dec =
            axis ===
            'c'
              ? 'ArrowLeft'
              : 'ArrowUp';
          const inc =
            axis ===
            'c'
              ? 'ArrowRight'
              : 'ArrowDown';
          if (
            e.key ===
            dec
          )
            set(
              axis,
              split[
                axis
              ] -
                STEP,
              true,
            );
          else if (
            e.key ===
            inc
          )
            set(
              axis,
              split[
                axis
              ] +
                STEP,
              true,
            );
          else if (
            e.key ===
              'Home' ||
            e.key ===
              'Enter'
          )
            reset(
              axis,
            );
          else
            return;
          e.preventDefault();
        },
      onDoubleClick:
        () =>
          reset(
            axis,
          ),
    });

  return {
    split,
    grid,
    dragging,
    handlers,
  };
}
