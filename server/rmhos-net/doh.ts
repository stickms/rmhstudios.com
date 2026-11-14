// DNS-over-HTTPS forwarder for the guest's resolver. Ticket-gated like the
// relay socket; forwards only DNS wire-format bodies to one fixed upstream.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyNetTicket } from '@features/rmhos/engine/net-ticket.server';
import type { UsageMeter } from './meter';
import { checkConnect, type RelayPolicy } from './policy';
import type { Resolver } from './relay';

export const DOH_PATH = '/rmhos-net/dns-query';
const MAX_QUERY_BYTES = 4096;
const MAX_ANSWER_BYTES = 65535;
const UPSTREAM_TIMEOUT_MS = 5000;
const MAX_IN_FLIGHT_PER_USER = 16;
const DNS_MESSAGE = 'application/dns-message';

export interface DohOptions {
  secret: string;
  enabled: boolean;
  policy: RelayPolicy;
  meter: UsageMeter;
  resolve: Resolver;
  upstream: string;
  corsOrigin: string;
  fetchImpl?: typeof fetch;
}

function cors(opts: DohOptions, res: ServerResponse): void {
  if (opts.corsOrigin !== '') {
    res.setHeader('access-control-allow-origin', opts.corsOrigin);
    res.setHeader('vary', 'origin');
  }
}

function reply(
  opts: DohOptions,
  res: ServerResponse,
  status: number,
  body: string | Uint8Array = '',
  type = 'text/plain',
): void {
  cors(opts, res);
  res.writeHead(status, {
    'content-type': type,
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    // A refused body is never drained; close so the connection is not reused.
    ...(status >= 400
      ? {
          connection: 'close',
        }
      : {}),
  });
  res.end(body);
}

export function handleDohPreflight(opts: DohOptions, res: ServerResponse): void {
  cors(opts, res);
  res.writeHead(204, {
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '600',
  });
  res.end();
}

function readBody(req: IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_QUERY_BYTES) {
      resolve(null);
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_QUERY_BYTES) {
        chunks.length = 0;
        resolve(null);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(null));
  });
}

const inFlight = new Map<string, number>();

export async function handleDohQuery(
  opts: DohOptions,
  req: IncomingMessage,
  res: ServerResponse,
  ticket: string,
): Promise<void> {
  if (!opts.enabled) return reply(opts, res, 503, 'disabled');
  const verdict = verifyNetTicket(ticket, opts.secret);
  if (!verdict.ok) return reply(opts, res, 401, 'unauthorized');
  const type = (req.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase();
  if (type !== DNS_MESSAGE) return reply(opts, res, 415, 'unsupported media type');

  const active = inFlight.get(verdict.userId) ?? 0;
  if (active >= MAX_IN_FLIGHT_PER_USER) return reply(opts, res, 429, 'too many queries');
  inFlight.set(verdict.userId, active + 1);
  try {
    const body = await readBody(req);
    if (body === null) return reply(opts, res, 413, 'payload too large');
    if (body.length === 0) return reply(opts, res, 400, 'empty query');
    // Queries and answers draw on the same budget as relayed streams.
    if (opts.meter.dayExhausted(verdict.userId)) {
      return reply(opts, res, 429, 'daily limit reached');
    }
    opts.meter.consume(verdict.userId, body.length);

    // The upstream must be a public address, same rule as a relayed stream.
    const url = new URL(opts.upstream);
    const target = await checkConnect(
      opts.policy,
      {
        streamType: 'tcp',
        port: Number(url.port || 443),
        host: url.hostname,
        openStreams: 0,
      },
      opts.resolve,
    );
    if (!target.ok) return reply(opts, res, 502, 'upstream refused');

    const doFetch = opts.fetchImpl ?? fetch;
    const upstream = await doFetch(opts.upstream, {
      method: 'POST',
      headers: {
        'content-type': DNS_MESSAGE,
        accept: DNS_MESSAGE,
      },
      body: new Uint8Array(body),
      redirect: 'error',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!upstream.ok) return reply(opts, res, 502, 'upstream error');
    const answer = new Uint8Array(await upstream.arrayBuffer());
    if (answer.length === 0 || answer.length > MAX_ANSWER_BYTES) {
      return reply(opts, res, 502, 'upstream error');
    }
    opts.meter.consume(verdict.userId, answer.length);
    return reply(opts, res, 200, answer, DNS_MESSAGE);
  } catch {
    return reply(opts, res, 502, 'upstream error');
  } finally {
    const left = (inFlight.get(verdict.userId) ?? 1) - 1;
    if (left <= 0) inFlight.delete(verdict.userId);
    else inFlight.set(verdict.userId, left);
  }
}
