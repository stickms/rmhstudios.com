/**
 * The harness's stand-in for the site's API (not part of the app). Everything under `/api/` answers 404
 * (so the HUD and menu code take their offline paths, and the HUD base comes from public/), except:
 *
 *   - `HARNESS_HUD_BASE=<dir>`: `/api/tf2-hud/base/*` serves a HUD base built by
 *     scripts/tf2-assets/hud.py (`--root <install> --out <dir>`), as the asset sync publishes it — the
 *     menus then read the game's own option pages, key list, advanced options and localisation;
 *   - `HARNESS_CATALOG=<file>`: `/api/tf2-loadout/catalog` serves an item catalog built by
 *     lib/tf2-loadout/catalog-build.ts (the loadout screen).
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

type Res = { statusCode: number; setHeader: (k: string, v: string) => void; end: (body?: string | Buffer) => void };

export function harnessApi() {
  const base = process.env.HARNESS_HUD_BASE;
  const catalog = process.env.HARNESS_CATALOG;
  return {
    name: 'harness-api',
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: Res, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (!url.startsWith('/api/')) {
          next();
          return;
        }
        if (base && url.startsWith('/api/tf2-hud/base/')) {
          const rel = decodeURIComponent(url.slice('/api/tf2-hud/base/'.length));
          const file = path.join(base, rel);
          if (!rel.includes('..') && existsSync(file) && statSync(file).isFile()) {
            res.statusCode = 200;
            res.setHeader('content-type', rel.endsWith('.json') ? 'application/json' : 'application/octet-stream');
            res.end(readFileSync(file));
            return;
          }
        }
        if (catalog && url === '/api/tf2-loadout/catalog') {
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json');
          res.end(readFileSync(catalog));
          return;
        }
        res.statusCode = 404;
        res.end();
      });
    },
  };
}
