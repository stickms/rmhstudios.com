// A tiny reverse proxy that stores a bought theme in the page's localStorage before the pre-paint script runs, so Safari
// in the iOS simulator loads the site wearing that theme (a simulator has no way to set another origin's storage).
//
//   node scripts/ios-sim/theme-proxy.mjs <target-port> <listen-port> <theme-json-file>
//
// It injects `localStorage['rmh-user-theme'] = <json>` as the first thing in <head> of every HTML response and passes
// everything else through untouched. Test tooling only.
import http from 'node:http';
import { readFileSync } from 'node:fs';

const [
  target,
  listen,
  file,
] =
  process.argv.slice(
    2,
  );
const blob =
  readFileSync(
    file,
    'utf8',
  );
const inject = `<script>try{localStorage.setItem('rmh-user-theme',${JSON.stringify(blob)})}catch(e){}</script>`;

http
  .createServer(
    (
      req,
      res,
    ) => {
      const headers =
        {
          ...req.headers,
          host: `localhost:${target}`,
        };
      delete headers[
        'accept-encoding'
      ]; // so the HTML arrives uncompressed and can be edited
      const up =
        http.request(
          {
            host: 'localhost',
            port: target,
            path: req.url,
            method:
              req.method,
            headers,
          },
          (
            r,
          ) => {
            const type =
              String(
                r
                  .headers[
                  'content-type'
                ] ??
                  '',
              );
            if (
              !type.includes(
                'text/html',
              )
            ) {
              res.writeHead(
                r.statusCode ??
                  502,
                r.headers,
              );
              r.pipe(
                res,
              );
              return;
            }
            const chunks =
              [];
            r.on(
              'data',
              (
                c,
              ) =>
                chunks.push(
                  c,
                ),
            );
            r.on(
              'end',
              () => {
                const html =
                  Buffer.concat(
                    chunks,
                  )
                    .toString(
                      'utf8',
                    )
                    .replace(
                      /<head([^>]*)>/i,
                      (
                        m,
                      ) =>
                        m +
                        inject,
                    );
                const out =
                  {
                    ...r.headers,
                    'content-length':
                      Buffer.byteLength(
                        html,
                      ),
                  };
                delete out[
                  'transfer-encoding'
                ];
                res.writeHead(
                  r.statusCode ??
                    502,
                  out,
                );
                res.end(
                  html,
                );
              },
            );
          },
        );
      up.on(
        'error',
        () => {
          res.writeHead(
            502,
          );
          res.end(
            'proxy error',
          );
        },
      );
      req.pipe(
        up,
      );
    },
  )
  .listen(
    Number(
      listen,
    ),
    () =>
      console.warn(
        `theme proxy :${listen} -> :${target}`,
      ),
  );
