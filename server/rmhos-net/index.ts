// rmhOS network relay hub entry point. Runs sandboxed (see deploy/rmhos-net and
// the rmhos-net service in docker-compose.yml): one JSON log line per event on stdout.
import { loadHubConfig, type HubConfig } from './config';
import { UsageMeter } from './meter';
import { createRelayServer } from './relay';

function log(line: object): void {
  // `t` is epoch milliseconds (for arithmetic and journald queries), `ts` the same instant as ISO text.
  const now = Date.now();
  process.stdout.write(`${JSON.stringify({ t: now, ts: new Date(now).toISOString(), ...line })}\n`);
}

let cfg: HubConfig;
try {
  cfg = loadHubConfig(process.env);
} catch (err) {
  log({
    evt: 'rmhos-net.fatal',
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
}

const meter = new UsageMeter(cfg.policy);
const server = createRelayServer({
  secret: cfg.secret,
  policy: cfg.policy,
  meter,
  log,
  deny: cfg.deny,
  doh: {
    upstream: cfg.dohUpstream,
    corsOrigin: cfg.corsOrigin,
  },
});

const prune = setInterval(
  () => {
    meter.prune();
    server.prune();
  },
  10 * 60 * 1000,
);
prune.unref();

server.listen(cfg.port, () => {
  log({
    evt: 'rmhos-net.listening',
    port: cfg.port,
    enabled: cfg.policy.enabled,
    denied: cfg.deny.size,
    maxSessions: cfg.policy.maxSessions,
  });
});

// Deny-list file: re-read on SIGHUP and every 60 s; anyone newly denied loses their live session
// at once. A self-rescheduling timeout (unref'd), not an interval: it is not periodic housekeeping
// the scheduler ratchet should count, and a slow read cannot overlap itself.
cfg.deny.onEvent = log;
function reloadDeny(reason: string): void {
  const report = (added: string[]) => {
    if (added.length > 0) {
      log({
        evt: 'rmhos-net.deny',
        reason,
        added: added.length,
        total: cfg.deny.size,
      });
      server.enforceDeny();
    }
  };
  report(cfg.deny.reload(report));
}
function scheduleDenyReload(): void {
  setTimeout(() => {
    reloadDeny('timer');
    scheduleDenyReload();
  }, 60_000).unref();
}
scheduleDenyReload();
process.on('SIGHUP', () => reloadDeny('sighup'));

// An unexpected error must not take the hub (and every user's session) down: log it and keep serving.
process.on('uncaughtException', (err) => {
  log({
    evt: 'rmhos-net.uncaught',
    error: err instanceof Error ? err.message : String(err),
  });
});
process.on('unhandledRejection', (reason) => {
  log({
    evt: 'rmhos-net.unhandled',
    error: reason instanceof Error ? reason.message : String(reason),
  });
});

function shutdown(): void {
  clearInterval(prune);
  server.close(() => process.exit(0));
  server.closeAllConnections();
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
