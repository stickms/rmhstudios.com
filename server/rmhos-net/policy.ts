// Relay policy: what the hub will connect to. Pure apart from the injected resolver.
import { CLOSE_REASON } from './wisp';
import { isPrivateIp } from './private-ip';
import { isIP } from 'node:net';

export interface RelayPolicy {
  deniedPorts: ReadonlySet<number>;
  /** When set, ONLY these ports are allowed and `deniedPorts` is ignored. */
  allowedPorts: ReadonlySet<number> | null;
  maxStreams: number;
  bytesPerSecond: number;
  bytesPerDay: number;
  /** Scan brake: distinct (address, port) pairs one user may open per 10 minutes. */
  maxDestinationsPer10Min: number;
  /** Hub-wide ceilings, shared by every user on top of the per-user ones. */
  maxSessions: number;
  globalBytesPerSecond: number;
  globalBytesPerDay: number;
}

const DEFAULT_DENIED_PORTS =
  [
    25,
    465,
    587,
    2525,
  ]; // outbound mail

function int(
  raw:
    | string
    | undefined,
  fallback: number,
): number {
  const n =
    raw ===
      undefined ||
    raw.trim() ===
      ''
      ? NaN
      : Number(
          raw,
        );
  return Number.isFinite(
    n,
  ) &&
    n >
      0
    ? Math.floor(
        n,
      )
    : fallback;
}

function ports(
  raw:
    | string
    | undefined,
): Set<number> {
  if (
    raw ===
    undefined
  )
    return new Set(
      DEFAULT_DENIED_PORTS,
    );
  const out =
    new Set<number>();
  for (const part of raw.split(
    ',',
  )) {
    const t =
      part.trim();
    if (
      !/^\d+$/.test(
        t,
      )
    )
      continue;
    const n =
      Number(
        t,
      );
    if (
      n >=
        1 &&
      n <=
        65535
    )
      out.add(
        n,
      );
  }
  // An empty or unparseable list must never mean "deny nothing".
  return out.size >
    0
    ? out
    : new Set(
        DEFAULT_DENIED_PORTS,
      );
}

/** RMHOS_NET_ALLOWED_PORTS: unset/blank = no allow-list; set but with no valid port = allow nothing (fail closed). */
function allowed(
  raw:
    | string
    | undefined,
): Set<number> | null {
  if (
    raw ===
      undefined ||
    raw.trim() ===
      ''
  )
    return null;
  const out =
    new Set<number>();
  for (const part of raw.split(
    ',',
  )) {
    const t =
      part.trim();
    if (
      !/^\d+$/.test(
        t,
      )
    )
      continue;
    const n =
      Number(
        t,
      );
    if (
      n >=
        1 &&
      n <=
        65535
    )
      out.add(
        n,
      );
  }
  return out;
}

export function loadPolicy(
  env: NodeJS.ProcessEnv,
): RelayPolicy & {
  enabled: boolean;
} {
  return {
    enabled:
      env.RMHOS_NET_ENABLED !==
      '0',
    deniedPorts:
      ports(
        env.RMHOS_NET_DENIED_PORTS,
      ),
    allowedPorts:
      allowed(
        env.RMHOS_NET_ALLOWED_PORTS,
      ),
    maxStreams:
      int(
        env.RMHOS_NET_MAX_STREAMS,
        64,
      ),
    bytesPerSecond:
      int(
        env.RMHOS_NET_BYTES_PER_SECOND,
        2 *
          1024 *
          1024,
      ),
    bytesPerDay:
      int(
        env.RMHOS_NET_BYTES_PER_DAY,
        2 *
          1024 **
            3,
      ),
    maxDestinationsPer10Min:
      int(
        env.RMHOS_NET_MAX_DESTINATIONS_PER_10MIN,
        300,
      ),
    maxSessions:
      int(
        env.RMHOS_NET_MAX_SESSIONS,
        200,
      ),
    globalBytesPerSecond:
      int(
        env.RMHOS_NET_GLOBAL_BYTES_PER_SECOND,
        20 *
          1024 *
          1024,
      ),
    globalBytesPerDay:
      int(
        env.RMHOS_NET_GLOBAL_BYTES_PER_DAY,
        100 *
          1024 **
            3,
      ),
  };
}

export type Verdict =
  | {
      ok: true;
      address: string;
      family:
        | 4
        | 6;
    }
  | {
      ok: false;
      reason: number;
    };

type Resolve =
  (
    host: string,
  ) => Promise<
    {
      address: string;
      family:
        | 4
        | 6;
    }[]
  >;

const blocked: Verdict =
  {
    ok: false,
    reason:
      CLOSE_REASON.blocked,
  };

export async function checkConnect(
  p: RelayPolicy,
  req: {
    streamType:
      | 'tcp'
      | 'udp';
    port: number;
    host: string;
    openStreams: number;
  },
  resolve: Resolve,
): Promise<Verdict> {
  let host =
    req.host
      .trim()
      .toLowerCase();
  if (
    host.startsWith(
      '[',
    ) &&
    host.endsWith(
      ']',
    )
  )
    host =
      host.slice(
        1,
        -1,
      );
  // A trailing dot is the same name (`localhost.`); strip one before the name checks.
  if (
    host.endsWith(
      '.',
    )
  )
    host =
      host.slice(
        0,
        -1,
      );
  if (
    host ===
      '' ||
    !Number.isInteger(
      req.port,
    ) ||
    req.port <
      1 ||
    req.port >
      65535
  ) {
    return {
      ok: false,
      reason:
        CLOSE_REASON.invalid,
    };
  }
  if (
    req.streamType !==
    'tcp'
  )
    return blocked;
  if (
    p.allowedPorts
      ? !p.allowedPorts.has(
          req.port,
        )
      : p.deniedPorts.has(
          req.port,
        )
  )
    return blocked;
  if (
    req.openStreams >=
    p.maxStreams
  )
    return {
      ok: false,
      reason:
        CLOSE_REASON.throttled,
    };

  const family =
    isIP(
      host,
    );
  if (
    family !==
    0
  ) {
    return isPrivateIp(
      host,
    )
      ? blocked
      : {
          ok: true,
          address:
            host,
          family:
            family as
              | 4
              | 6,
        };
  }
  if (
    host ===
      'localhost' ||
    host.endsWith(
      '.localhost',
    )
  )
    return blocked;

  let records: {
    address: string;
    family:
      | 4
      | 6;
  }[];
  try {
    records =
      await resolve(
        host,
      );
  } catch {
    return {
      ok: false,
      reason:
        CLOSE_REASON.unreachable,
    };
  }
  const first =
    records[0];
  if (
    !first
  )
    return {
      ok: false,
      reason:
        CLOSE_REASON.unreachable,
    };
  // Every record must be public, so a mixed answer (rebinding) is refused.
  if (
    records.some(
      (
        r,
      ) =>
        isPrivateIp(
          r.address,
        ),
    )
  )
    return blocked;
  return {
    ok: true,
    address:
      first.address,
    family:
      first.family,
  };
}
