/**
 * The host bridge protocol — the one channel a sandboxed vibe page uses to reach
 * capabilities the sandbox itself never grants (shared storage, rooms, tweak
 * knobs, element picking, error reports). It is postMessage between the frame
 * and the page that hosts it.
 *
 * Client-safe and zod-free: it ships to the browser. A vibe page is untrusted
 * code, so everything arriving from a frame goes through `parseBridgeMessage`,
 * which returns null for anything malformed rather than guessing.
 */

export const BRIDGE_TAG =
  '__rmhvibe';
export const KEY_RE =
  /^[A-Za-z0-9:_.-]{1,64}$/;
export const MAX_VALUE_CHARS = 4096;
export const MAX_ROOM_CHARS = 2048;
const MAX_PREFIX_CHARS = 64;
const MAX_ERROR_CHARS = 500;
const MAX_EVENT_DATA_CHARS = 4096;

export type BridgeOp =
  | 'store.get'
  | 'store.set'
  | 'store.incr'
  | 'store.list'
  | 'room.send'
  | 'room.members';
export type StoreScope =
  | 'page'
  | 'user';
export type ListOrder =
  | 'key'
  | 'value-desc';

export type FrameEventName =
  | 'ready'
  | 'error'
  | 'picked'
  | 'pick:cancel';
export type HostEventName =
  | 'hello'
  | 'tweaks'
  | 'room:message'
  | 'room:members'
  | 'pick:start'
  | 'pick:stop'
  | 'visibility';
export type HostKind =
  | 'viewer'
  | 'feed'
  | 'discord';

export type BridgeArgs =
  {
    'store.get': {
      key: string;
      scope: StoreScope;
    };
    'store.set': {
      key: string;
      scope: StoreScope;
      value: unknown;
    };
    'store.incr': {
      key: string;
      scope: StoreScope;
      by: number;
      oncePerUser?: boolean;
    };
    'store.list': {
      prefix: string;
      scope: StoreScope;
      order: ListOrder;
      limit: number;
    };
    'room.send': {
      data: unknown;
    };
    'room.members': Record<
      string,
      never
    >;
  };

export type BridgeRequest =
  {
    [
      O in BridgeOp
    ]: {
      __rmhvibe: 1;
      id: number;
      op: O;
      args: BridgeArgs[O];
    };
  }[BridgeOp];

export type BridgeFrameEvent =
  {
    __rmhvibe: 1;
    event: FrameEventName;
    data: unknown;
  };

export type BridgeResponse =
  | {
      __rmhvibe: 1;
      id: number;
      ok: true;
      result: unknown;
    }
  | {
      __rmhvibe: 1;
      id: number;
      ok: false;
      error: string;
    };

export type BridgeHostEvent =
  {
    __rmhvibe: 1;
    event: HostEventName;
    data: unknown;
  };

const OPS: readonly string[] =
  [
    'store.get',
    'store.set',
    'store.incr',
    'store.list',
    'room.send',
    'room.members',
  ];
const FRAME_EVENTS: readonly string[] =
  [
    'ready',
    'error',
    'picked',
    'pick:cancel',
  ];

function isRecord(
  v: unknown,
): v is Record<
  string,
  unknown
> {
  return (
    typeof v ===
      'object' &&
    v !==
      null &&
    !Array.isArray(
      v,
    )
  );
}

/**
 * The JSON-normalised copy of a value (what a store would persist), or null when
 * it cannot be serialised (cycles, bigint, undefined) or exceeds `max` chars.
 */
function jsonClone(
  v: unknown,
  max: number,
): {
  value: unknown;
} | null {
  try {
    const s =
      JSON.stringify(
        v,
      );
    if (
      typeof s !==
        'string' ||
      s.length >
        max
    )
      return null;
    return {
      value:
        JSON.parse(
          s,
        ) as unknown,
    };
  } catch {
    return null;
  }
}

function validKey(
  v: unknown,
): v is string {
  return (
    typeof v ===
      'string' &&
    KEY_RE.test(
      v,
    )
  );
}

function validScope(
  v: unknown,
): v is StoreScope {
  return (
    v ===
      'page' ||
    v ===
      'user'
  );
}

/** A safe positive integer — the only id shape a request may carry. */
export function validRequestId(
  v: unknown,
): v is number {
  return (
    typeof v ===
      'number' &&
    Number.isSafeInteger(
      v,
    ) &&
    v >
      0
  );
}

function parseArgs(
  op: BridgeOp,
  a: unknown,
):
  | BridgeArgs[BridgeOp]
  | null {
  if (
    !isRecord(
      a,
    )
  )
    return null;
  switch (
    op
  ) {
    case 'store.get':
      return validKey(
        a.key,
      ) &&
        validScope(
          a.scope,
        )
        ? {
            key: a.key,
            scope:
              a.scope,
          }
        : null;
    case 'store.set': {
      if (
        !validKey(
          a.key,
        ) ||
        !validScope(
          a.scope,
        )
      )
        return null;
      const c =
        jsonClone(
          a.value,
          MAX_VALUE_CHARS,
        );
      return c
        ? {
            key: a.key,
            scope:
              a.scope,
            value:
              c.value,
          }
        : null;
    }
    case 'store.incr': {
      if (
        !validKey(
          a.key,
        ) ||
        !validScope(
          a.scope,
        )
      )
        return null;
      const by =
        a.by;
      if (
        typeof by !==
          'number' ||
        !Number.isInteger(
          by,
        ) ||
        by <
          -1000 ||
        by >
          1000
      )
        return null;
      if (
        a.oncePerUser !==
          undefined &&
        typeof a.oncePerUser !==
          'boolean'
      )
        return null;
      return a.oncePerUser ===
        undefined
        ? {
            key: a.key,
            scope:
              a.scope,
            by,
          }
        : {
            key: a.key,
            scope:
              a.scope,
            by,
            oncePerUser:
              a.oncePerUser,
          };
    }
    case 'store.list': {
      const {
        prefix,
        scope,
        order,
        limit,
      } =
        a;
      if (
        typeof prefix !==
          'string' ||
        prefix.length >
          MAX_PREFIX_CHARS
      )
        return null;
      if (
        !validScope(
          scope,
        )
      )
        return null;
      if (
        order !==
          'key' &&
        order !==
          'value-desc'
      )
        return null;
      if (
        typeof limit !==
          'number' ||
        !Number.isInteger(
          limit,
        ) ||
        limit <
          1 ||
        limit >
          100
      ) {
        return null;
      }
      return {
        prefix,
        scope,
        order,
        limit,
      };
    }
    case 'room.send': {
      const c =
        jsonClone(
          a.data,
          MAX_ROOM_CHARS,
        );
      return c
        ? {
            data: c.value,
          }
        : null;
    }
    case 'room.members':
      return {};
  }
}

/** Validate one message from a frame. Null means ignore it. */
export function parseBridgeMessage(
  data: unknown,
):
  | BridgeRequest
  | BridgeFrameEvent
  | null {
  if (
    !isRecord(
      data,
    ) ||
    data[
      BRIDGE_TAG
    ] !==
      1
  )
    return null;

  if (
    'event' in
    data
  ) {
    const event =
      data.event;
    if (
      typeof event !==
        'string' ||
      !FRAME_EVENTS.includes(
        event,
      )
    )
      return null;
    const payload =
      data.data;
    if (
      event ===
      'error'
    ) {
      if (
        !isRecord(
          payload,
        ) ||
        typeof payload.message !==
          'string'
      )
        return null;
      if (
        payload
          .message
          .length >
        MAX_ERROR_CHARS
      )
        return null;
      if (
        payload.source !==
          undefined &&
        typeof payload.source !==
          'string'
      )
        return null;
      const clean: {
        message: string;
        source?: string;
      } =
        {
          message:
            payload.message,
        };
      if (
        typeof payload.source ===
        'string'
      )
        clean.source =
          payload.source.slice(
            0,
            200,
          );
      return {
        __rmhvibe: 1,
        event,
        data: clean,
      };
    }
    if (
      payload ===
      undefined
    )
      return {
        __rmhvibe: 1,
        event:
          event as FrameEventName,
        data: null,
      };
    const c =
      jsonClone(
        payload,
        MAX_EVENT_DATA_CHARS,
      );
    return c
      ? {
          __rmhvibe: 1,
          event:
            event as FrameEventName,
          data: c.value,
        }
      : null;
  }

  const {
    id,
    op,
  } =
    data;
  if (
    !validRequestId(
      id,
    )
  )
    return null;
  if (
    typeof op !==
      'string' ||
    !OPS.includes(
      op,
    )
  )
    return null;
  const args =
    parseArgs(
      op as BridgeOp,
      data.args,
    );
  if (
    !args
  )
    return null;
  return {
    __rmhvibe: 1,
    id,
    op,
    args,
  } as BridgeRequest;
}

export function isBridgeRequest(
  m:
    | BridgeRequest
    | BridgeFrameEvent,
): m is BridgeRequest {
  return (
    'op' in
    m
  );
}

/** The only error text a frame ever sees; handlers throw `new BridgeError(code)`. */
export const BRIDGE_ERROR_CODES =
  [
    'unavailable',
    'rate',
    'invalid',
    'forbidden',
    'too-large',
    'unauthorized',
    'not-found',
    'conflict',
    'failed',
  ] as const;
export type BridgeErrorCode =
  (typeof BRIDGE_ERROR_CODES)[number];

export class BridgeError extends Error {
  readonly code: BridgeErrorCode;
  constructor(
    code: BridgeErrorCode,
  ) {
    super(
      code,
    );
    this.name =
      'BridgeError';
    this.code =
      code;
  }
}

/** Map anything a handler threw to an allowlisted code ('failed' otherwise). */
export function toErrorCode(
  err: unknown,
): BridgeErrorCode {
  return err instanceof
    BridgeError &&
    BRIDGE_ERROR_CODES.includes(
      err.code,
    )
    ? err.code
    : 'failed';
}
