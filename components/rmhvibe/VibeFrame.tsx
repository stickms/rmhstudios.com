/**
 * VibeFrame — the sandboxed iframe a vibe page renders in, double-buffered.
 *
 * A new `html` mounts a second iframe above the first at opacity 0. When its
 * document has loaded it fades in (160 ms, opacity only) and, once the fade ends, the
 * older frame unmounts — so a swap (a live preview during a build, a version
 * switch) never shows a blank frame. The sandbox defaults to the viewer's
 * string and never carries `allow-same-origin`.
 *
 * Each iframe loads the same-origin loader (`/vibe-frame`, its own CSP) and is handed
 * its document by postMessage (lib/rmhvibe/frame-loader.ts); "loaded" is the written
 * document's load, not the loader's. One document per iframe, so a swap is always a
 * new layer.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ensureBridgeRuntime } from '@/lib/rmhvibe/bridge-runtime';
import { BRIDGE_TAG } from '@/lib/rmhvibe/bridge';
import {
  FRAME_URL,
  useFrameDocument,
} from '@/lib/rmhvibe/frame-loader';

export const VIEWER_SANDBOX =
  'allow-scripts allow-forms allow-modals allow-pointer-lock';

/** Matches the 160 ms arrival fade (Steel M9); the old frame outlives it a little. */
const FADE_MS = 160;

type Layer =
  {
    id: number;
    html: string;
    visible: boolean;
  };

export function VibeFrame({
  html,
  title,
  sandbox = VIEWER_SANDBOX,
  className,
  onFrame,
}: {
  html: string;
  title: string;
  sandbox?: string;
  className?: string;
  onFrame?: (
    frame: HTMLIFrameElement,
  ) => void;
}) {
  const nextId =
    useRef(
      1,
    );
  const [
    layers,
    setLayers,
  ] =
    useState<
      Layer[]
    >(
      () => [
        {
          id: 0,
          html,
          visible: true,
        },
      ],
    );
  const layersRef =
    useRef(
      layers,
    );
  layersRef.current =
    layers;
  const frames =
    useRef(
      new Map<
        number,
        HTMLIFrameElement
      >(),
    );
  const onFrameRef =
    useRef(
      onFrame,
    );
  onFrameRef.current =
    onFrame;
  const firstLoad =
    useRef(
      true,
    );
  const cleanup =
    useRef<
      | number
      | undefined
    >(
      undefined,
    );

  // A new document mounts hidden above the current one. A candidate that has not
  // loaded yet is superseded (latest wins).
  useEffect(() => {
    setLayers(
      (
        prev,
      ) => {
        const newest =
          prev[
            prev.length -
              1
          ]!;
        if (
          newest.html ===
          html
        )
          return prev;
        const settled =
          newest.visible
            ? prev
            : prev.slice(
                0,
                -1,
              );
        return [
          ...settled,
          {
            id: nextId.current++,
            html,
            visible: false,
          },
        ];
      },
    );
  }, [
    html,
  ]);

  useEffect(
    () =>
      () =>
        window.clearTimeout(
          cleanup.current,
        ),
    [],
  );

  const handleLoad =
    useCallback(
      (
        id: number,
      ) => {
        const frame =
          frames.current.get(
            id,
          );
        const current =
          layersRef.current;
        const idx =
          current.findIndex(
            (
              l,
            ) =>
              l.id ===
              id,
          );
        if (
          !frame ||
          idx <
            0
        )
          return;
        const isFirst =
          firstLoad.current;
        firstLoad.current = false;
        if (
          !current[
            idx
          ]!
            .visible
        ) {
          // Focus follows only if the frame being replaced held it.
          const before =
            idx >
            0
              ? frames.current.get(
                  current[
                    idx -
                      1
                  ]!
                    .id,
                )
              : undefined;
          const hadFocus =
            !!before &&
            document.activeElement ===
              before;
          // The layers underneath are about to be unmounted, but their scripts keep running
          // through the fade: tell their bridge runtime to silence media and Web Audio now.
          for (
            let i = 0;
            i <
            idx;
            i++
          ) {
            const outgoing =
              frames.current.get(
                current[
                  i
                ]!
                  .id,
              );
            try {
              outgoing?.contentWindow?.postMessage(
                {
                  [BRIDGE_TAG]: 1,
                  event:
                    'visibility',
                  data: {
                    hidden: true,
                    suspend: true,
                  },
                },
                '*',
              );
            } catch {
              /* the frame went away */
            }
          }
          setLayers(
            (
              prev,
            ) =>
              prev.map(
                (
                  l,
                ) =>
                  l.id ===
                  id
                    ? {
                        ...l,
                        visible: true,
                      }
                    : l,
              ),
          );
          window.clearTimeout(
            cleanup.current,
          );
          cleanup.current =
            window.setTimeout(
              () => {
                setLayers(
                  (
                    prev,
                  ) => {
                    const at =
                      prev.findIndex(
                        (
                          l,
                        ) =>
                          l.id ===
                          id,
                      );
                    return at >
                      0
                      ? prev.slice(
                          at,
                        )
                      : prev;
                  },
                );
              },
              FADE_MS +
                40,
            );
          if (
            hadFocus
          )
            focusFrame(
              frame,
            );
        }
        if (
          isFirst
        )
          focusFrame(
            frame,
          );
        onFrameRef.current?.(
          frame,
        );
      },
      [],
    );

  return (
    <div
      className={`vibe-frame ${className ?? ''}`.trim()}
    >
      {layers.map(
        (
          layer,
        ) => (
          <VibeLayer
            key={
              layer.id
            }
            layer={
              layer
            }
            title={
              title
            }
            sandbox={
              sandbox
            }
            onLoaded={
              handleLoad
            }
            onElement={(
              id,
              el,
            ) => {
              if (
                el
              )
                frames.current.set(
                  id,
                  el,
                );
              else
                frames.current.delete(
                  id,
                );
            }}
          />
        ),
      )}
    </div>
  );
}

function VibeLayer({
  layer,
  title,
  sandbox,
  onLoaded,
  onElement,
}: {
  layer: Layer;
  title: string;
  sandbox: string;
  onLoaded: (
    id: number,
  ) => void;
  onElement: (
    id: number,
    el: HTMLIFrameElement | null,
  ) => void;
}) {
  const doc =
    useMemo(
      () =>
        ensureBridgeRuntime(
          layer.html,
        ),
      [
        layer.html,
      ],
    );
  const ref =
    useFrameDocument(
      doc,
      () =>
        onLoaded(
          layer.id,
        ),
      (
        el,
      ) =>
        onElement(
          layer.id,
          el,
        ),
    );
  return (
    <iframe
      ref={
        ref
      }
      title={
        title
      }
      src={
        FRAME_URL
      }
      sandbox={
        sandbox
      }
      className={`vibe-frame__layer${layer.visible ? ' is-visible' : ''}`}
      aria-hidden={
        layer.visible
          ? undefined
          : true
      }
      tabIndex={
        layer.visible
          ? undefined
          : -1
      }
    />
  );
}

function focusFrame(
  frame: HTMLIFrameElement,
) {
  try {
    frame.contentWindow?.focus();
  } catch {
    /* focus is best-effort */
  }
}
