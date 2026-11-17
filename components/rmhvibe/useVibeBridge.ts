/**
 * Host side of the vibe bridge. Attach it to the visible frame (VibeFrame's
 * `onFrame`); it answers store/room requests through the page-supplied
 * `VibeBridgeHost` and forwards frame events.
 *
 * Trust: a message is accepted only when `e.source === frame.contentWindow`.
 * The frame's origin is opaque, so replies go out with target origin '*'.
 */

import {
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  BRIDGE_TAG,
  isBridgeRequest,
  parseBridgeMessage,
  toErrorCode,
  validRequestId,
  type BridgeFrameEvent,
  type BridgeHostEvent,
  type BridgeOp,
  type BridgeResponse,
  type HostEventName,
  type HostKind,
} from '@/lib/rmhvibe/bridge';

export interface VibeBridgeHost {
  kind: HostKind;
  handle(
    op: BridgeOp,
    args: unknown,
  ): Promise<unknown>;
  onEvent?(
    event: BridgeFrameEvent,
  ): void;
}

const MAX_REQUESTS_PER_SECOND = 50;
/** `store.*` is a network round trip to the KV endpoint, so a frame gets far fewer of them. */
const MAX_STORE_REQUESTS_PER_SECOND = 10;

function reply(
  frame: HTMLIFrameElement,
  msg:
    | BridgeResponse
    | BridgeHostEvent,
) {
  try {
    frame.contentWindow?.postMessage(
      msg,
      '*',
    );
  } catch {
    /* the frame went away */
  }
}

export function useVibeBridge(
  frame: HTMLIFrameElement | null,
  host: VibeBridgeHost,
): {
  post(
    event: HostEventName,
    data: unknown,
  ): void;
} {
  const hostRef =
    useRef(
      host,
    );
  hostRef.current =
    host;
  const frameRef =
    useRef(
      frame,
    );
  frameRef.current =
    frame;

  useEffect(() => {
    if (
      !frame
    )
      return;
    let windowStart = 0;
    let count = 0;
    const overLimit =
      () => {
        const now =
          Date.now();
        if (
          now -
            windowStart >=
          1000
        ) {
          windowStart =
            now;
          count = 0;
        }
        return (
          ++count >
          MAX_REQUESTS_PER_SECOND
        );
      };
    let storeWindowStart = 0;
    let storeCount = 0;
    const storeOverLimit =
      () => {
        const now =
          Date.now();
        if (
          now -
            storeWindowStart >=
          1000
        ) {
          storeWindowStart =
            now;
          storeCount = 0;
        }
        return (
          ++storeCount >
          MAX_STORE_REQUESTS_PER_SECOND
        );
      };
    const hello =
      () =>
        reply(
          frame,
          {
            [BRIDGE_TAG]: 1,
            event:
              'hello',
            data: {
              host: hostRef
                .current
                .kind,
            },
          },
        );

    const onMessage =
      (
        e: MessageEvent,
      ) => {
        if (
          !frame.contentWindow ||
          e.source !==
            frame.contentWindow
        )
          return;
        const raw =
          e.data as {
            id?: unknown;
            [BRIDGE_TAG]?: unknown;
          } | null;
        const rawId =
          raw &&
          typeof raw ===
            'object' &&
          raw[
            BRIDGE_TAG
          ] ===
            1 &&
          validRequestId(
            raw.id,
          )
            ? raw.id
            : null;
        const fail =
          (
            id: number,
            error: string,
          ) =>
            reply(
              frame,
              {
                [BRIDGE_TAG]: 1,
                id,
                ok: false,
                error,
              },
            );

        if (
          overLimit()
        ) {
          if (
            rawId !==
            null
          )
            fail(
              rawId,
              'rate',
            );
          return;
        }
        const msg =
          parseBridgeMessage(
            e.data,
          );
        if (
          !msg
        ) {
          if (
            rawId !==
            null
          )
            fail(
              rawId,
              'invalid',
            );
          return;
        }
        if (
          !isBridgeRequest(
            msg,
          )
        ) {
          try {
            hostRef.current.onEvent?.(
              msg,
            );
          } catch {
            /* a host callback must not break the bridge */
          }
          return;
        }
        if (
          msg.op.startsWith(
            'store.',
          ) &&
          storeOverLimit()
        ) {
          fail(
            msg.id,
            'rate',
          );
          return;
        }
        Promise.resolve()
          .then(
            () =>
              hostRef.current.handle(
                msg.op,
                msg.args,
              ),
          )
          .then(
            (
              result,
            ) =>
              reply(
                frame,
                {
                  [BRIDGE_TAG]: 1,
                  id: msg.id,
                  ok: true,
                  result,
                },
              ),
            (
              err: unknown,
            ) =>
              fail(
                msg.id,
                toErrorCode(
                  err,
                ),
              ),
          );
      };

    window.addEventListener(
      'message',
      onMessage,
    );
    frame.addEventListener(
      'load',
      hello,
    );
    // The frame has usually loaded already when it is attached.
    hello();
    return () => {
      window.removeEventListener(
        'message',
        onMessage,
      );
      frame.removeEventListener(
        'load',
        hello,
      );
    };
  }, [
    frame,
  ]);

  const post =
    useCallback(
      (
        event: HostEventName,
        data: unknown,
      ) => {
        const f =
          frameRef.current;
        if (
          f
        )
          reply(
            f,
            {
              [BRIDGE_TAG]: 1,
              event,
              data,
            },
          );
      },
      [],
    );

  return {
    post,
  };
}
