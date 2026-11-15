// A throwaway TLS front for the rmhOS network e2e (testing/e2e/rmhos-net.mjs).
//
// v86 always builds an https:// DNS-over-HTTPS URL, so DNS cannot work on plain-http localhost.
// This puts one https origin in front of both servers, as Apache does in production:
//   /rmhos-net/*  (HTTP and WebSocket upgrade)  ->  the relay hub (HUB_PORT, default 7009)
//   everything else                              ->  Vite (VITE_PORT, default 7005)
// It also answers POST /__front/drop-ws by destroying every relay WebSocket it is carrying,
// to show that v86 reconnects with the URL (ticket included) it was started with.
//
//   TLS_KEY=key.pem TLS_CERT=cert.pem node testing/e2e/rmhos-tls-front.mjs   # listens on FRONT_PORT (7443)
//
// The certificate is self-signed and generated for the run (openssl req -x509 ...); nothing here
// is for production and no certificate is ever committed.
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

export function startFront({ key, cert, frontPort = 7443, hubPort = 7009, vitePort = 7005 }) {
  const relaySockets = new Set();
  const isRelay = (url) => (url ?? '').startsWith('/rmhos-net/');
  const server = https.createServer({ key, cert }, (req, res) => {
    if (req.method === 'POST' && req.url === '/__front/drop-ws') {
      const n = relaySockets.size;
      for (const s of relaySockets) s.destroy();
      relaySockets.clear();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ dropped: n }));
      return;
    }
    const up = http.request(
      {
        host: '127.0.0.1',
        port: isRelay(req.url) ? hubPort : vitePort,
        method: req.method,
        path: req.url,
        headers: { ...req.headers, 'x-forwarded-proto': 'https' },
      },
      (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      },
    );
    up.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(up);
  });
  server.on('upgrade', (req, socket, head) => {
    const relay = isRelay(req.url);
    const up = net.connect(relay ? hubPort : vitePort, '127.0.0.1', () => {
      up.write(
        `${req.method} ${req.url} HTTP/1.1\r\n` +
          Object.entries(req.headers)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\r\n') +
          '\r\n\r\n',
      );
      if (head.length) up.write(head);
      socket.pipe(up).pipe(socket);
    });
    if (relay) {
      relaySockets.add(socket);
      socket.on('close', () => relaySockets.delete(socket));
    }
    up.on('error', () => socket.destroy());
    socket.on('error', () => up.destroy());
    socket.on('close', () => up.destroy());
    up.on('close', () => socket.destroy());
  });
  return new Promise((resolve) => server.listen(frontPort, '127.0.0.1', () => resolve(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = await startFront({
    key: fs.readFileSync(process.env.TLS_KEY),
    cert: fs.readFileSync(process.env.TLS_CERT),
    frontPort: Number(process.env.FRONT_PORT ?? 7443),
  });
  console.log('rmhos tls front on', server.address());
}
