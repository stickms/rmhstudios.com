/**
 * rmhstudios.com — Status Page service
 *
 * Standalone, dependency-light HTTP service that powers status.rmhstudios.com.
 * It periodically probes the health endpoint of every other service in the
 * stack and serves:
 *
 *   GET /            → self-contained HTML dashboard (auto-refreshes)
 *   GET /api/status  → JSON snapshot of every probe
 *   GET /health      → liveness probe for this service itself (Docker/Apache)
 *
 * Runs as its own Docker service (see docker-compose.yml `status`) and as its
 * own process under `pnpm start` / the deploy script — it does NOT live inside
 * the main web app, so the status page stays up even if the web app is down.
 *
 * Probe targets default to the compose-network DNS names (socket, rmhbox, …)
 * and the host gateway for the blue/green web container, but the whole list can
 * be overridden with the STATUS_SERVICES env var (JSON, see ServiceProbe).
 */

import 'dotenv/config';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.STATUS_PORT ?? '7008', 10);

// How often (ms) the background loop re-probes every service.
const PROBE_INTERVAL_MS = parseInt(process.env.STATUS_PROBE_INTERVAL_MS ?? '15000', 10);

// Per-probe network timeout.
const PROBE_TIMEOUT_MS = parseInt(process.env.STATUS_PROBE_TIMEOUT_MS ?? '4000', 10);

// Host the deployed services publish their loopback ports on. From inside the
// status container, the blue/green web container is reachable via the Docker
// host gateway (added as an extra_host in docker-compose.yml).
const GATEWAY = process.env.STATUS_HOST_GATEWAY ?? 'host.docker.internal';

const PORT_WEB = process.env.PORT_WEB ?? '7005';
const PORT_WEB_GREEN = process.env.PORT_WEB_GREEN ?? String(parseInt(PORT_WEB, 10) + 10);
const PORT_SOCKET = process.env.PORT_SOCKET ?? '7001';
const PORT_RMHBOX = process.env.PORT_RMHBOX ?? '7676';
const PORT_RMHTUBE = process.env.PORT_RMHTUBE ?? '7003';
const PORT_RECAP = process.env.PORT_RECAP ?? '7004';

type Kind = 'http' | 'database';

interface ServiceProbe {
    /** Human-readable label shown on the status page. */
    name: string;
    /** One-line description of what the service does. */
    description?: string;
    kind?: Kind;
    /**
     * Candidate URLs (http kind). The service is "up" if ANY responds — this is
     * how the web app's blue/green pair is covered (both ports are listed).
     */
    urls?: string[];
}

/**
 * Default probe set. Override wholesale by setting STATUS_SERVICES to a JSON
 * array of ServiceProbe objects.
 */
const DEFAULT_SERVICES: ServiceProbe[] = [
    {
        name: 'Website',
        description: 'Main rmhstudios.com web app',
        kind: 'http',
        urls: [`http://${GATEWAY}:${PORT_WEB}/`, `http://${GATEWAY}:${PORT_WEB_GREEN}/`],
    },
    {
        name: 'Realtime / Games',
        description: 'Socket.IO server (multiplayer + live apps)',
        kind: 'http',
        urls: [`http://socket:${PORT_SOCKET}/health`],
    },
    {
        name: 'RMHbox',
        description: 'RMHbox party-game WebSocket server',
        kind: 'http',
        urls: [`http://rmhbox:${PORT_RMHBOX}/health`],
    },
    {
        name: 'RMHtube',
        description: 'RMHtube watch-together WebSocket server',
        kind: 'http',
        urls: [`http://rmhtube:${PORT_RMHTUBE}/health`],
    },
    {
        name: 'Recap runner',
        description: 'Lights Out daily recap scheduler',
        kind: 'http',
        urls: [`http://recap:${PORT_RECAP}/`],
    },
    {
        name: 'Database',
        description: 'PostgreSQL (via Prisma)',
        kind: 'database',
    },
];

function loadServices(): ServiceProbe[] {
    const raw = process.env.STATUS_SERVICES;
    if (!raw) return DEFAULT_SERVICES;
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed as ServiceProbe[];
        log('STATUS_SERVICES was not a non-empty array — using defaults.');
    } catch (e) {
        log(`STATUS_SERVICES is not valid JSON (${e}) — using defaults.`);
    }
    return DEFAULT_SERVICES;
}

const SERVICES = loadServices();

// ─── State ───────────────────────────────────────────────────────────────────

type Status = 'up' | 'degraded' | 'down' | 'unknown';

interface ProbeResult {
    name: string;
    description?: string;
    status: Status;
    latencyMs: number | null;
    detail: string;
    checkedAt: string;
}

let lastResults: ProbeResult[] = SERVICES.map((s) => ({
    name: s.name,
    description: s.description,
    status: 'unknown' as Status,
    latencyMs: null,
    detail: 'Not checked yet',
    checkedAt: new Date(0).toISOString(),
}));
let lastCheckedAt = new Date(0).toISOString();

function log(msg: string) {
    console.log(`[${new Date().toISOString()}] [status] ${msg}`);
}

// ─── Probes ──────────────────────────────────────────────────────────────────

// Lazily-created Prisma client, only if a database probe exists and
// DATABASE_URL is set. Kept open for the lifetime of the process.
let prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient | null {
    if (prisma) return prisma;
    if (!process.env.DATABASE_URL) return null;
    const adapter = new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        max: 2,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: PROBE_TIMEOUT_MS,
    });
    prisma = new PrismaClient({ adapter });
    return prisma;
}

async function probeHttp(urls: string[]): Promise<{ status: Status; latencyMs: number | null; detail: string }> {
    let lastDetail = 'No URLs configured';
    for (const url of urls) {
        const started = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
        try {
            const res = await fetch(url, { method: 'GET', signal: controller.signal });
            const latencyMs = Date.now() - started;
            if (res.status >= 200 && res.status < 400) {
                return { status: 'up', latencyMs, detail: `HTTP ${res.status}` };
            }
            // Reachable but unhappy (e.g. 5xx) — degraded, keep trying other URLs.
            lastDetail = `HTTP ${res.status}`;
        } catch (e: unknown) {
            const msg = e instanceof Error ? (e.name === 'AbortError' ? `timeout after ${PROBE_TIMEOUT_MS}ms` : e.message) : String(e);
            lastDetail = msg;
        } finally {
            clearTimeout(timer);
        }
    }
    // Nothing returned 2xx/3xx. If the last reachable response was an HTTP error,
    // call it degraded; if we never connected, it's down.
    const isHttpError = lastDetail.startsWith('HTTP ');
    return { status: isHttpError ? 'degraded' : 'down', latencyMs: null, detail: lastDetail };
}

async function probeDatabase(): Promise<{ status: Status; latencyMs: number | null; detail: string }> {
    const client = getPrisma();
    if (!client) return { status: 'unknown', latencyMs: null, detail: 'DATABASE_URL not set' };
    const started = Date.now();
    try {
        const query = client.$queryRaw`SELECT 1`;
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`timeout after ${PROBE_TIMEOUT_MS}ms`)), PROBE_TIMEOUT_MS),
        );
        await Promise.race([query, timeout]);
        return { status: 'up', latencyMs: Date.now() - started, detail: 'SELECT 1 ok' };
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { status: 'down', latencyMs: null, detail: msg };
    }
}

async function probeOne(svc: ServiceProbe): Promise<ProbeResult> {
    const kind: Kind = svc.kind ?? 'http';
    const r =
        kind === 'database'
            ? await probeDatabase()
            : await probeHttp(svc.urls ?? []);
    return {
        name: svc.name,
        description: svc.description,
        status: r.status,
        latencyMs: r.latencyMs,
        detail: r.detail,
        checkedAt: new Date().toISOString(),
    };
}

async function probeAll() {
    lastResults = await Promise.all(SERVICES.map(probeOne));
    lastCheckedAt = new Date().toISOString();
}

function overallStatus(results: ProbeResult[]): Status {
    if (results.some((r) => r.status === 'down')) return 'down';
    if (results.some((r) => r.status === 'degraded')) return 'degraded';
    if (results.every((r) => r.status === 'up')) return 'up';
    return 'unknown';
}

// ─── Rendering ───────────────────────────────────────────────────────────────

const STATUS_META: Record<Status, { label: string; color: string; dot: string }> = {
    up: { label: 'Operational', color: '#1f9d55', dot: '#22c55e' },
    degraded: { label: 'Degraded', color: '#b7791f', dot: '#f59e0b' },
    down: { label: 'Down', color: '#c0392b', dot: '#ef4444' },
    unknown: { label: 'Unknown', color: '#6b7280', dot: '#9ca3af' },
};

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function renderHtml(): string {
    const overall = overallStatus(lastResults);
    const meta = STATUS_META[overall];
    const headline =
        overall === 'up'
            ? 'All systems operational'
            : overall === 'degraded'
              ? 'Some systems degraded'
              : overall === 'down'
                ? 'Major outage'
                : 'Status unknown';

    const rows = lastResults
        .map((r) => {
            const m = STATUS_META[r.status];
            const latency = r.latencyMs != null ? `${r.latencyMs} ms` : '—';
            return `
        <li class="service">
          <span class="dot" style="background:${m.dot}"></span>
          <span class="info">
            <span class="name">${escapeHtml(r.name)}</span>
            ${r.description ? `<span class="desc">${escapeHtml(r.description)}</span>` : ''}
          </span>
          <span class="meta">
            <span class="latency" title="${escapeHtml(r.detail)}">${latency}</span>
            <span class="badge" style="color:${m.color};border-color:${m.color}">${m.label}</span>
          </span>
        </li>`;
        })
        .join('');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="30" />
  <title>RMH Studios — System Status</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0b0e14; color: #e6e8eb; line-height: 1.5;
      display: flex; justify-content: center; padding: 48px 16px;
    }
    .wrap { width: 100%; max-width: 720px; }
    header { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; }
    .banner { width: 14px; height: 14px; border-radius: 50%; box-shadow: 0 0 0 4px rgba(255,255,255,.06); }
    h1 { font-size: 1.5rem; margin: 0; font-weight: 650; }
    .sub { color: #9aa4b2; font-size: .9rem; margin-top: 2px; }
    ul { list-style: none; margin: 0; padding: 0; border: 1px solid #1d2330; border-radius: 14px; overflow: hidden; background: #11161f; }
    .service { display: flex; align-items: center; gap: 14px; padding: 16px 18px; border-top: 1px solid #1d2330; }
    .service:first-child { border-top: none; }
    .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
    .info { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; }
    .name { font-weight: 600; }
    .desc { color: #8a93a3; font-size: .82rem; }
    .meta { display: flex; align-items: center; gap: 12px; flex: none; }
    .latency { color: #8a93a3; font-size: .8rem; font-variant-numeric: tabular-nums; }
    .badge { font-size: .74rem; font-weight: 600; padding: 3px 9px; border: 1px solid; border-radius: 999px; white-space: nowrap; }
    footer { margin-top: 18px; color: #6b7280; font-size: .78rem; text-align: center; }
    a { color: #6ea8fe; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <span class="banner" style="background:${meta.dot}"></span>
      <div>
        <h1>${headline}</h1>
        <div class="sub">RMH Studios system status</div>
      </div>
    </header>
    <ul>${rows}</ul>
    <footer>
      Last checked ${escapeHtml(lastCheckedAt)} · auto-refreshes every 30s ·
      <a href="/api/status">JSON</a>
    </footer>
  </div>
</body>
</html>`;
}

// ─── HTTP server ─────────────────────────────────────────────────────────────

function requestHandler(req: IncomingMessage, res: ServerResponse): void {
    const url = (req.url ?? '/').split('?')[0];

    if (url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
        return;
    }

    if (url === '/api/status') {
        const overall = overallStatus(lastResults);
        res.writeHead(overall === 'down' ? 503 : 200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({ status: overall, checkedAt: lastCheckedAt, services: lastResults }, null, 2));
        return;
    }

    if (url === '/' || url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(renderHtml());
        return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
}

async function main() {
    log(`Probing ${SERVICES.length} services every ${PROBE_INTERVAL_MS}ms (timeout ${PROBE_TIMEOUT_MS}ms).`);

    // Prime once before serving so the first page render has real data.
    await probeAll().catch((e) => log(`Initial probe failed: ${e}`));

    const loop = setInterval(() => {
        probeAll().catch((e) => log(`Probe cycle failed: ${e}`));
    }, PROBE_INTERVAL_MS);

    const server = createServer(requestHandler);
    server.listen(PORT, '0.0.0.0', () => {
        log(`Status page listening on port ${PORT}`);
    });

    const shutdown = async (sig: string) => {
        log(`${sig} received — shutting down.`);
        clearInterval(loop);
        server.close();
        if (prisma) await prisma.$disconnect().catch(() => {});
        process.exit(0);
    };
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
