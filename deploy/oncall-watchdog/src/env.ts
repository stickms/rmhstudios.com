// Bindings and the few Workers platform types this needs.
//
// The platform types are declared structurally here rather than pulled from
// `@cloudflare/workers-types` / `cloudflare:workers`, so the root `tsc`, eslint
// and vitest cover this directory with no extra dependency or tsconfig. wrangler
// bundles it with esbuild at deploy time.

export interface Env {
  /** The single Durable Object that owns all alarm state. */
  ONCALL_STATE: DurableObjectNamespaceLike;

  // ── vars (wrangler.toml; not secret) ──
  /** e.g. https://rmhstudios.com */
  SITE_URL: string;
  /** e.g. https://status.rmhstudios.com */
  STATUS_URL: string;
  /** Base for runbook links, e.g. https://github.com/<org>/<repo>/blob/main/docs/runbooks/oncall */
  RUNBOOK_BASE: string;
  DISCORD_APPLICATION_ID: string;
  /** Hex Ed25519 key from the Discord developer portal (General Information). */
  DISCORD_PUBLIC_KEY: string;
  ONCALL_CHANNEL_ID: string;
  ONCALL_ROLE_ID: string;
  /** Optional: extra role mentioned on a Sev1 escalation. */
  ESCALATION_ROLE_ID?: string;
  /** Cloudflare Access team domain, e.g. rmhstudios.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string;
  /** Access application audience tag (AUD) for the /v1 path. */
  ACCESS_AUD?: string;
  /** Optional: only this service token's Client ID may call /v1. */
  ACCESS_CLIENT_ID?: string;

  // ── secrets (`wrangler secret put`) ──
  DISCORD_BOT_TOKEN?: string;
  /** Fallback channel webhook: plain message, no buttons, if the bot post fails. */
  ONCALL_WEBHOOK_URL?: string;
}

export interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: Request | string, init?: RequestInit): Promise<Response> };
}

export interface DurableObjectStorageLike {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T>(opts: { prefix: string }): Promise<Map<string, T>>;
}

export interface DurableObjectStateLike {
  storage: DurableObjectStorageLike;
}

export interface ExecutionContextLike {
  waitUntil(p: Promise<unknown>): void;
}
