/**
 * rmhstudios.com — Status Page service
 *
 * Standalone, dependency-light HTTP service that powers status.rmhstudios.com.
 * It periodically probes the health endpoint of every other service in the
 * stack and serves:
 *
 *   GET /            → self-contained HTML dashboard (auto-refreshes)
 *   GET /api/status  → JSON snapshot of every probe + uptime history
 *   GET /health      → liveness probe for this service itself (Docker/Apache)
 *
 * Runs as its own Docker service (see docker-compose.yml `status`) and as its
 * own process under `pnpm start` / the deploy script — it does NOT live inside
 * the main web app, so the status page stays up even if the web app is down.
 *
 * Probing model:
 *   - The web app is deployed blue/green by deploy/hotswap-web.sh and publishes
 *     its port on the host LOOPBACK only (127.0.0.1), so it is NOT reachable via
 *     host.docker.internal. It IS reachable by container name on the shared
 *     compose network — the active container is ${PROJECT}-web-blue (port
 *     PORT_WEB) or ${PROJECT}-web-green (port PORT_WEB_GREEN), so we probe both.
 *   - The other services share the compose network and are reached by their
 *     compose DNS name (socket, rmhbox, …).
 *
 * Uptime history is bucketed and persisted to the db/ volume so the percentage
 * bars survive restarts/redeploys (see HISTORY_FILE).
 */

import 'dotenv/config';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.STATUS_PORT ?? '7008', 10);
const PROBE_INTERVAL_MS = parseInt(process.env.STATUS_PROBE_INTERVAL_MS ?? '15000', 10);
const PROBE_TIMEOUT_MS = parseInt(process.env.STATUS_PROBE_TIMEOUT_MS ?? '4000', 10);

// Compose project (e.g. "rmhstudios-prod"). Used to address the blue/green web
// containers by name on the shared compose network.
const PROJECT = process.env.COMPOSE_PROJECT_NAME ?? 'rmhstudios';

const PORT_WEB = process.env.PORT_WEB ?? '7005';
const PORT_WEB_GREEN = process.env.PORT_WEB_GREEN ?? String(parseInt(PORT_WEB, 10) + 10);
const PORT_SOCKET = process.env.PORT_SOCKET ?? '7001';
const PORT_RMHBOX = process.env.PORT_RMHBOX ?? '7676';
const PORT_RMHTUBE = process.env.PORT_RMHTUBE ?? '7003';
const PORT_RECAP = process.env.PORT_RECAP ?? '7004';

// ── Uptime history ──
// Each bucket aggregates all samples within a fixed time window. The bar chart
// renders the last MAX_BUCKETS buckets; uptime % is up-samples / all-samples.
const BUCKET_MS = parseInt(process.env.STATUS_BUCKET_MS ?? String(60 * 60 * 1000), 10); // 1h
const MAX_BUCKETS = parseInt(process.env.STATUS_MAX_BUCKETS ?? '90', 10);

// Persisted so percentages survive restarts. Defaults to the mounted db/ volume.
const DATA_DIR = process.env.STATUS_DATA_DIR ?? (existsSync('/app/db') ? '/app/db' : './db');
const HISTORY_FILE = join(DATA_DIR, 'status-history.json');

type Kind = 'http' | 'database';

interface ServiceProbe {
    name: string;
    description?: string;
    kind?: Kind;
    /** Candidate URLs (http kind). "up" if ANY responds — covers blue/green. */
    urls?: string[];
}

const DEFAULT_SERVICES: ServiceProbe[] = [
    {
        name: 'Website',
        description: 'Main rmhstudios.com web app',
        kind: 'http',
        urls: [
            // Active blue/green container (one is live at a time).
            `http://${PROJECT}-web-blue:${PORT_WEB}/`,
            `http://${PROJECT}-web-green:${PORT_WEB_GREEN}/`,
            // Fallback for a non-hotswap `compose up` web container.
            `http://${PROJECT}-web:${PORT_WEB}/`,
        ],
    },
    {
        name: 'Realtime / Games',
        description: 'Socket.IO server (multiplayer + live apps)',
        kind: 'http',
        urls: [`http://socket:${PORT_SOCKET}/health`],
    },
    {
        name: 'RMHbox',
        description: 'Party-game WebSocket server',
        kind: 'http',
        urls: [`http://rmhbox:${PORT_RMHBOX}/health`],
    },
    {
        name: 'RMHtube',
        description: 'Watch-together WebSocket server',
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

function log(msg: string) {
    console.log(`[${new Date().toISOString()}] [status] ${msg}`);
}

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

interface Bucket {
    /** Bucket window start (ms epoch, floored to BUCKET_MS). */
    t: number;
    up: number;
    degraded: number;
    down: number;
}

// service name → ordered list of buckets (oldest → newest).
const history = new Map<string, Bucket[]>();

let lastResults: ProbeResult[] = SERVICES.map((s) => ({
    name: s.name,
    description: s.description,
    status: 'unknown' as Status,
    latencyMs: null,
    detail: 'Not checked yet',
    checkedAt: new Date(0).toISOString(),
}));
let lastCheckedAt = new Date(0).toISOString();

// ─── History persistence ─────────────────────────────────────────────────────

function loadHistory() {
    try {
        if (!existsSync(HISTORY_FILE)) return;
        const data = JSON.parse(readFileSync(HISTORY_FILE, 'utf8')) as Record<string, Bucket[]>;
        for (const [name, buckets] of Object.entries(data)) {
            if (Array.isArray(buckets)) history.set(name, buckets.slice(-MAX_BUCKETS));
        }
        log(`Loaded uptime history for ${history.size} services from ${HISTORY_FILE}.`);
    } catch (e) {
        log(`Could not load history (${e}) — starting fresh.`);
    }
}

function saveHistory() {
    try {
        if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
        const obj: Record<string, Bucket[]> = {};
        for (const [name, buckets] of history) obj[name] = buckets;
        // Atomic-ish write: tmp + rename so a crash mid-write can't corrupt it.
        const tmp = `${HISTORY_FILE}.tmp`;
        writeFileSync(tmp, JSON.stringify(obj));
        renameSync(tmp, HISTORY_FILE);
    } catch (e) {
        log(`Could not persist history: ${e}`);
    }
}

function recordSample(name: string, status: Status, at: number) {
    if (status === 'unknown') return; // don't let "not configured" tank uptime
    const t = Math.floor(at / BUCKET_MS) * BUCKET_MS;
    let buckets = history.get(name);
    if (!buckets) {
        buckets = [];
        history.set(name, buckets);
    }
    let cur = buckets[buckets.length - 1];
    if (!cur || cur.t !== t) {
        cur = { t, up: 0, degraded: 0, down: 0 };
        buckets.push(cur);
        if (buckets.length > MAX_BUCKETS) buckets.splice(0, buckets.length - MAX_BUCKETS);
    }
    cur[status] += 1;
}

function uptimePct(name: string): number | null {
    const buckets = history.get(name);
    if (!buckets || buckets.length === 0) return null;
    let up = 0;
    let total = 0;
    for (const b of buckets) {
        up += b.up;
        total += b.up + b.degraded + b.down;
    }
    if (total === 0) return null;
    return (up / total) * 100;
}

function bucketStatus(b: Bucket): Status {
    if (b.down > 0) return 'down';
    if (b.degraded > 0) return 'degraded';
    if (b.up > 0) return 'up';
    return 'unknown';
}

// ─── Probes ──────────────────────────────────────────────────────────────────

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
            lastDetail = `HTTP ${res.status}`;
        } catch (e: unknown) {
            const msg =
                e instanceof Error
                    ? e.name === 'AbortError'
                        ? `timeout after ${PROBE_TIMEOUT_MS}ms`
                        : e.message
                    : String(e);
            lastDetail = msg;
        } finally {
            clearTimeout(timer);
        }
    }
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
    const r = kind === 'database' ? await probeDatabase() : await probeHttp(svc.urls ?? []);
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
    const results = await Promise.all(SERVICES.map(probeOne));
    const now = Date.now();
    for (const r of results) recordSample(r.name, r.status, now);
    lastResults = results;
    lastCheckedAt = new Date(now).toISOString();
    saveHistory();
}

function overallStatus(results: ProbeResult[]): Status {
    if (results.some((r) => r.status === 'down')) return 'down';
    if (results.some((r) => r.status === 'degraded')) return 'degraded';
    if (results.every((r) => r.status === 'up' || r.status === 'unknown')) {
        return results.some((r) => r.status === 'up') ? 'up' : 'unknown';
    }
    return 'unknown';
}

// ─── Rendering ───────────────────────────────────────────────────────────────
// Themed to match the rmhstudios.com site design system (app/globals.css):
//   bg #000 · surface #27282c · accent #9b7ad8 · success #7bc88a · warning
//   #d9c36e · danger #d98a8a · fonts Nunito (display) / Inter (body).

const STATUS_META: Record<Status, { label: string; color: string }> = {
    up: { label: 'Operational', color: '#7bc88a' },
    degraded: { label: 'Degraded', color: '#d9c36e' },
    down: { label: 'Down', color: '#d98a8a' },
    unknown: { label: 'Unknown', color: '#6a6b74' },
};

function escapeHtml(s: string): string {
    return s.replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
    );
}

function formatSpan(ms: number): string {
    const h = Math.round(ms / 3_600_000);
    if (h < 48) return `${h}h`;
    return `${Math.round(h / 24)}d`;
}

function renderBars(name: string): string {
    const buckets = history.get(name) ?? [];
    // Right-align: pad the left with empty bars so the newest is flush-right.
    const pad = Math.max(0, MAX_BUCKETS - buckets.length);
    const cells: string[] = [];
    for (let i = 0; i < pad; i++) {
        cells.push('<span class="bar bar-empty"></span>');
    }
    for (const b of buckets) {
        const st = bucketStatus(b);
        const when = new Date(b.t).toLocaleString();
        const total = b.up + b.degraded + b.down;
        const pct = total ? Math.round((b.up / total) * 100) : 0;
        const title = `${when} — ${STATUS_META[st].label} (${pct}% up, ${total} checks)`;
        cells.push(`<span class="bar bar-${st}" title="${escapeHtml(title)}"></span>`);
    }
    return cells.join('');
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

    const span = formatSpan(BUCKET_MS * MAX_BUCKETS);

    const cards = lastResults
        .map((r) => {
            const m = STATUS_META[r.status];
            const latency = r.latencyMs != null ? `${r.latencyMs} ms` : '—';
            const pct = uptimePct(r.name);
            const pctLabel = pct != null ? `${pct.toFixed(2)}%` : '—';
            return `
        <li class="service">
          <div class="service-head">
            <span class="dot" style="background:${m.color}"></span>
            <span class="info">
              <span class="name">${escapeHtml(r.name)}</span>
              ${r.description ? `<span class="desc">${escapeHtml(r.description)}</span>` : ''}
            </span>
            <span class="meta">
              <span class="latency" title="${escapeHtml(r.detail)}">${latency}</span>
              <span class="badge" style="color:${m.color};border-color:${m.color}">${m.label}</span>
            </span>
          </div>
          <div class="bars" aria-hidden="true">${renderBars(r.name)}</div>
          <div class="bars-legend">
            <span>${escapeHtml(span)} ago</span>
            <span class="uptime">${pctLabel} uptime</span>
            <span>now</span>
          </div>
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
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --site-bg: #000;
      --site-bg-subtle: #0b0b0c;
      --site-surface: #27282c;
      --site-surface-hover: #313238;
      --site-border: #3a3b42;
      --site-border-bright: #4a4b54;
      --site-text: #e8e8ec;
      --site-text-muted: #9a9ba4;
      --site-text-dim: #6a6b74;
      --site-accent: #9b7ad8;
      --site-success: #7bc88a;
      --site-warning: #d9c36e;
      --site-danger: #d98a8a;
      --site-radius: 12px;
      --site-radius-sm: 8px;
      --font-title: "Playfair Display", Georgia, "Times New Roman", serif;
      --font-body: "Inter", "Segoe UI", system-ui, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; font-family: var(--font-body);
      background:
        radial-gradient(1200px 600px at 50% -10%, rgba(155,122,216,0.10), transparent 60%),
        var(--site-bg);
      color: var(--site-text); line-height: 1.5; min-height: 100vh;
      display: flex; justify-content: center; padding: 56px 16px;
      letter-spacing: -0.01em;
    }
    .wrap { width: 100%; max-width: 760px; }
    header { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; }
    .banner { width: 16px; height: 16px; border-radius: 50%; flex: none; box-shadow: 0 0 0 5px rgba(255,255,255,.05); }
    h1 { font-family: var(--font-title); font-size: 1.95rem; margin: 0; font-weight: 700; letter-spacing: 0; line-height: 1.15; }
    .sub { color: var(--site-text-muted); font-size: .9rem; margin-top: 4px; }
    ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
    .service {
      background: var(--site-surface); border: 1px solid var(--site-border);
      border-radius: var(--site-radius); padding: 16px 18px;
      transition: border-color .2s ease, transform .2s ease;
    }
    .service:hover { border-color: var(--site-border-bright); }
    .service-head { display: flex; align-items: center; gap: 14px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
    .info { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; }
    .name { font-weight: 600; }
    .desc { color: var(--site-text-muted); font-size: .82rem; }
    .meta { display: flex; align-items: center; gap: 12px; flex: none; }
    .latency { color: var(--site-text-dim); font-size: .8rem; font-variant-numeric: tabular-nums; }
    .badge { font-size: .72rem; font-weight: 600; padding: 3px 10px; border: 1px solid; border-radius: 999px; white-space: nowrap; }
    .bars { display: flex; gap: 2px; margin-top: 14px; height: 30px; align-items: stretch; }
    .bar { flex: 1 1 0; border-radius: 2px; min-width: 2px; }
    .bar-up { background: var(--site-success); }
    .bar-degraded { background: var(--site-warning); }
    .bar-down { background: var(--site-danger); }
    .bar-unknown, .bar-empty { background: #2f3036; }
    .bar:hover { filter: brightness(1.25); }
    .bars-legend {
      display: flex; justify-content: space-between; align-items: center;
      margin-top: 8px; color: var(--site-text-dim); font-size: .72rem;
    }
    .uptime { color: var(--site-text-muted); font-weight: 600; font-variant-numeric: tabular-nums; }
    footer { margin-top: 22px; color: var(--site-text-dim); font-size: .76rem; text-align: center; }
    footer a { color: var(--site-accent); text-decoration: none; }
    footer a:hover { text-decoration: underline; }

    /* ── Mobile ── */
    @media (max-width: 560px) {
      body { padding: 28px 12px; }
      header { gap: 12px; margin-bottom: 20px; }
      h1 { font-size: 1.55rem; }
      .service { padding: 14px; }
      /* Stack name/description above the status badge so nothing gets squeezed. */
      .service-head { flex-wrap: wrap; row-gap: 8px; }
      .info { flex-basis: calc(100% - 24px); }
      .meta { width: 100%; padding-left: 24px; justify-content: flex-start; }
      .meta .latency { margin-left: auto; }
      /* Tighten bars so all buckets fit without horizontal scroll on small phones. */
      .bars { height: 34px; gap: 1px; }
      .bar { min-width: 1px; border-radius: 1px; }
      .bars-legend { font-size: .68rem; }
    }
    /* Wider tap/hover targets + no sticky :hover filter on touch devices. */
    @media (hover: none) {
      .bar:hover { filter: none; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <span class="banner" style="background:${meta.color}"></span>
      <div>
        <h1>${headline}</h1>
        <div class="sub">RMH Studios system status</div>
      </div>
    </header>
    <ul>${cards}</ul>
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
        const services = lastResults.map((r) => ({ ...r, uptimePct: uptimePct(r.name) }));
        res.writeHead(overall === 'down' ? 503 : 200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({ status: overall, checkedAt: lastCheckedAt, services }, null, 2));
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
    log(
        `Probing ${SERVICES.length} services every ${PROBE_INTERVAL_MS}ms ` +
            `(timeout ${PROBE_TIMEOUT_MS}ms, history ${MAX_BUCKETS}×${BUCKET_MS}ms).`,
    );
    loadHistory();

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
        saveHistory();
        server.close();
        if (prisma) await prisma.$disconnect().catch(() => {});
        process.exit(0);
    };
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
