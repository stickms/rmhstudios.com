// Hub configuration, parsed locally: this folder imports nothing from the site
// (see __tests__/no-site-imports.test.ts), so there is no shared envInt here.
import { RMHOS } from '@features/rmhos/engine/constants';
import {
  loadPolicy,
  type RelayPolicy,
} from './policy';

export interface HubConfig {
  port: number;
  secret: string;
  policy: RelayPolicy & {
    enabled: boolean;
  };
  dohUpstream: string;
  corsOrigin: string;
}

const DEFAULT_DOH_UPSTREAM =
  'https://1.1.1.1/dns-query';

function port(
  raw:
    | string
    | undefined,
): number {
  const t =
    raw?.trim() ??
    '';
  if (
    t ===
    ''
  )
    return RMHOS.netPort;
  const n =
    Number(
      t,
    );
  if (
    !Number.isInteger(
      n,
    ) ||
    n <
      1 ||
    n >
      65535
  ) {
    throw new Error(
      `RMHOS_NET_PORT must be 1-65535, got "${t}"`,
    );
  }
  return n;
}

function upstream(
  raw:
    | string
    | undefined,
): string {
  const t =
    raw?.trim() ??
    '';
  const url =
    t ===
    ''
      ? DEFAULT_DOH_UPSTREAM
      : t;
  let parsed: URL;
  try {
    parsed =
      new URL(
        url,
      );
  } catch {
    throw new Error(
      'RMHOS_NET_DOH_UPSTREAM is not a URL',
    );
  }
  if (
    parsed.protocol !==
    'https:'
  ) {
    throw new Error(
      'RMHOS_NET_DOH_UPSTREAM must be https',
    );
  }
  return parsed.toString();
}

/** Throws on an unusable configuration; the entry point turns that into a non-zero exit. */
export function loadHubConfig(
  env: NodeJS.ProcessEnv,
): HubConfig {
  const secret =
    env.RMHOS_NET_TICKET_SECRET ??
    '';
  if (
    secret ===
    ''
  )
    throw new Error(
      'RMHOS_NET_TICKET_SECRET is required',
    );
  return {
    port: port(
      env.RMHOS_NET_PORT,
    ),
    secret,
    policy:
      loadPolicy(
        env,
      ),
    dohUpstream:
      upstream(
        env.RMHOS_NET_DOH_UPSTREAM,
      ),
    corsOrigin:
      env.RMHOS_NET_CORS_ORIGIN?.trim() ??
      '',
  };
}
