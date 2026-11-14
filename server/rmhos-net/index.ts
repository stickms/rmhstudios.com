// rmhOS network relay hub entry point. Runs sandboxed (see deploy/rmhos-net and
// the rmhos-net service in docker-compose.yml): one JSON log line per event on stdout.
import { loadHubConfig } from './config';
import { UsageMeter } from './meter';
import { createRelayServer } from './relay';

function log(
  line: object,
): void {
  process.stdout.write(
    `${JSON.stringify({ ts: new Date().toISOString(), ...line })}\n`,
  );
}

let cfg;
try {
  cfg =
    loadHubConfig(
      process.env,
    );
} catch (err) {
  log(
    {
      evt: 'rmhos-net.fatal',
      error:
        err instanceof
        Error
          ? err.message
          : String(
              err,
            ),
    },
  );
  process.exit(
    1,
  );
}

const meter =
  new UsageMeter(
    cfg.policy,
  );
const server =
  createRelayServer(
    {
      secret:
        cfg.secret,
      policy:
        cfg.policy,
      meter,
      log,
      doh: {
        upstream:
          cfg.dohUpstream,
        corsOrigin:
          cfg.corsOrigin,
      },
    },
  );

const prune =
  setInterval(
    () =>
      meter.prune(),
    10 *
      60 *
      1000,
  );
prune.unref();

server.listen(
  cfg.port,
  () => {
    log(
      {
        evt: 'rmhos-net.listening',
        port: cfg.port,
        enabled:
          cfg
            .policy
            .enabled,
      },
    );
  },
);

// An unexpected error must not take the hub (and every user's session) down: log it and keep serving.
process.on(
  'uncaughtException',
  (
    err,
  ) => {
    log(
      {
        evt: 'rmhos-net.uncaught',
        error:
          err instanceof
          Error
            ? err.message
            : String(
                err,
              ),
      },
    );
  },
);
process.on(
  'unhandledRejection',
  (
    reason,
  ) => {
    log(
      {
        evt: 'rmhos-net.unhandled',
        error:
          reason instanceof
          Error
            ? reason.message
            : String(
                reason,
              ),
      },
    );
  },
);

function shutdown(): void {
  clearInterval(
    prune,
  );
  server.close(
    () =>
      process.exit(
        0,
      ),
  );
  server.closeAllConnections();
  setTimeout(
    () =>
      process.exit(
        0,
      ),
    3000,
  ).unref();
}
process.on(
  'SIGTERM',
  shutdown,
);
process.on(
  'SIGINT',
  shutdown,
);
