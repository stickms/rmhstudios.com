/**
 * HTTP + database helpers for the integration suite.
 *
 * `Client` is one browser: it holds a cookie jar, sends the Origin header
 * Better Auth's CSRF check expects, and talks to the running app at INTEGRATION_BASE_URL.
 * `db` is a direct Postgres connection to the SAME database, used only to seed
 * what no public endpoint can (a paid subscription, a starting balance) and to
 * assert on what a response alone cannot prove (a ledger row was written).
 */
import pg from 'pg';

// Not `BASE_URL`: Vite reserves that name and vitest overwrites it with '/'.
export const BASE_URL = (process.env.INTEGRATION_BASE_URL ?? 'http://localhost:7005').replace(/\/$/, '');

/** Shared by every test user; strong enough for any password rule. */
export const PASSWORD = 'Integ-pass-123!';

let pool: pg.Pool | null = null;
export function db(): pg.Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required (the throwaway DB the server uses)');
  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  return pool;
}
export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
}

/**
 * A parsed response body. Deliberately loose: these tests assert on the shapes
 * the app actually returns, and typing every endpoint's response here would
 * duplicate (and drift from) the route code under test.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonBody = any;

export interface Res<T = JsonBody> {
  status: number;
  body: T;
  headers: Headers;
}

export class Client {
  private jar = new Map<string, string>();

  constructor(cookies?: Record<string, string>) {
    for (const [k, v] of Object.entries(cookies ?? {})) this.jar.set(k, v);
  }

  get cookies(): Record<string, string> {
    return Object.fromEntries(this.jar);
  }

  get hasSession(): boolean {
    return [...this.jar.keys()].some((k) => k.endsWith('session_token'));
  }

  async request<T = JsonBody>(
    method: string,
    path: string,
    opts: { json?: unknown; headers?: Record<string, string> } = {},
  ): Promise<Res<T>> {
    const headers: Record<string, string> = { origin: BASE_URL, ...opts.headers };
    if (this.jar.size) headers.cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (opts.json !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: opts.json === undefined ? undefined : JSON.stringify(opts.json),
      redirect: 'manual',
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const expired = attrs.some((a) => /^\s*max-age=0\s*$/i.test(a)) || value === '';
      if (expired) this.jar.delete(name);
      else this.jar.set(name, value);
    }
    const text = await res.text();
    let body: JsonBody = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON body stays a string */
    }
    return { status: res.status, body: body as T, headers: res.headers };
  }

  get<T = JsonBody>(path: string, headers?: Record<string, string>) {
    return this.request<T>('GET', path, { headers });
  }
  post<T = JsonBody>(path: string, json?: unknown, headers?: Record<string, string>) {
    return this.request<T>('POST', path, { json: json ?? {}, headers });
  }
  delete<T = JsonBody>(path: string, headers?: Record<string, string>) {
    return this.request<T>('DELETE', path, { headers });
  }
}

/** A unique, valid-looking address per run, so reruns never collide. */
export function uniqueEmail(label: string): string {
  return `it-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}@example.test`;
}

export interface TestUser {
  id: string;
  email: string;
  name: string;
  cookies: Record<string, string>;
}

/** Sign up through the real endpoint; returns the user and its session cookies. */
export async function signUp(label: string): Promise<TestUser & { client: Client }> {
  const client = new Client();
  const email = uniqueEmail(label);
  const name = `Integ ${label}`;
  const res = await client.post('/api/auth/sign-up/email', { email, password: PASSWORD, name });
  if (res.status !== 200 || !res.body?.user?.id) {
    throw new Error(`sign-up for ${label} failed: HTTP ${res.status} ${JSON.stringify(res.body)}`);
  }
  if (!client.hasSession) throw new Error(`sign-up for ${label} set no session cookie`);
  return { id: res.body.user.id, email, name, cookies: client.cookies, client };
}

/** Poll until `fn` returns a truthy value — for work done just after a response. */
export async function eventually<T>(fn: () => Promise<T | null | undefined | false>, ms = 5_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 100));
  }
}
