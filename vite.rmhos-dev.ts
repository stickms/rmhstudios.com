/**
 * Dev only: serve the built rmhOS image directory (`public/rmhos-dev/`, git-ignored) with HTTP
 * Range support. v86 reads the 274 MB disk in blocks with `Range` requests and trusts the body
 * to be exactly the range, but Vite's dev static middleware answers a ranged request with a 200
 * and the whole file, which the emulator would take as one block. Production serves the image
 * from the CDN, which answers 206.
 */
import {
  createReadStream,
  realpathSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

const PREFIX =
  '/rmhos-dev/';

export function rmhosDevImage(
  root: string,
): Plugin {
  const dir =
    path.resolve(
      root,
      'public',
      'rmhos-dev',
    );
  const realDir =
    (() => {
      try {
        return realpathSync(
          dir,
        );
      } catch {
        return dir;
      }
    })();
  return {
    name: 'rmhos-dev-image',
    apply:
      'serve',
    configureServer(
      server,
    ) {
      server.middlewares.use(
        (
          req,
          res,
          next,
        ) => {
          const url =
            req.url ??
            '';
          if (
            !url.startsWith(
              PREFIX,
            ) ||
            (req.method !==
              'GET' &&
              req.method !==
                'HEAD')
          )
            return next();
          let name: string;
          try {
            name =
              decodeURIComponent(
                url
                  .slice(
                    PREFIX.length,
                  )
                  .split(
                    '?',
                  )[0] ??
                  '',
              );
          } catch {
            res.statusCode = 400;
            return res.end(
              'bad request',
            );
          }
          let file =
            path.resolve(
              dir,
              name,
            );
          if (
            !file.startsWith(
              dir +
                path.sep,
            )
          )
            return next();
          let size: number;
          try {
            // Resolve symlinks and check the prefix again: a link in the directory must not
            // reach a file outside it.
            file =
              realpathSync(
                file,
              );
            if (
              !file.startsWith(
                realDir +
                  path.sep,
              )
            )
              return next();
            const st =
              statSync(
                file,
              );
            if (
              !st.isFile()
            )
              return next();
            size =
              st.size;
          } catch {
            return next();
          }
          res.setHeader(
            'Accept-Ranges',
            'bytes',
          );
          res.setHeader(
            'Content-Type',
            'application/octet-stream',
          );
          res.setHeader(
            'Cache-Control',
            'no-cache',
          );
          const m =
            /^bytes=(\d*)-(\d*)$/.exec(
              req
                .headers
                .range ??
                '',
            );
          let start = 0;
          let end =
            size -
            1;
          if (
            m &&
            (m[1] ||
              m[2])
          ) {
            if (
              m[1]
            ) {
              start =
                Number(
                  m[1],
                );
              end =
                m[2]
                  ? Math.min(
                      Number(
                        m[2],
                      ),
                      size -
                        1,
                    )
                  : size -
                    1;
            } else {
              start =
                Math.max(
                  0,
                  size -
                    Number(
                      m[2],
                    ),
                );
            }
            if (
              start >
                end ||
              start >=
                size
            ) {
              res.statusCode = 416;
              res.setHeader(
                'Content-Range',
                `bytes */${size}`,
              );
              return res.end();
            }
            res.statusCode = 206;
            res.setHeader(
              'Content-Range',
              `bytes ${start}-${end}/${size}`,
            );
          }
          res.setHeader(
            'Content-Length',
            end -
              start +
              1,
          );
          if (
            req.method ===
            'HEAD'
          )
            return res.end();
          const stream =
            createReadStream(
              file,
              {
                start,
                end,
              },
            );
          // v86 aborts ranged requests it no longer needs; do not leak the descriptor.
          res.on(
            'close',
            () =>
              stream.destroy(),
          );
          stream.on(
            'error',
            () =>
              res.destroy(),
          );
          stream.pipe(
            res,
          );
        },
      );
    },
  };
}
