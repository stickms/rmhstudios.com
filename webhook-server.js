const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const SECRET = process.env.WEBHOOK_SECRET || 'change-me';
const PORT = 7002;
const DEPLOY_SCRIPT = '/home/rmhstudios/rmhstudios.com/deploy.sh';
const LOG_FILE = '/home/rmhstudios/webhook.log';

const fs = require('fs');

function logMsg(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  fs.appendFileSync(LOG_FILE, line);
}

http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404);
    return res.end();
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const sig = req.headers['x-hub-signature-256'];
    const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');

    if (sig !== expected) {
      logMsg('WARN: Invalid signature — rejected.');
      res.writeHead(401);
      return res.end('Unauthorized');
    }

    let payload;
    try { payload = JSON.parse(body); } catch {
      res.writeHead(400);
      return res.end('Bad JSON');
    }

    if (payload.ref !== 'refs/heads/main') {
      logMsg(`Ignored push to ${payload.ref}`);
      res.writeHead(200);
      return res.end('Ignored');
    }

    logMsg(`Push to main detected (${payload.after?.slice(0, 7)}) — triggering deploy`);
    res.writeHead(200);
    res.end('Deploying');

    // Run deploy script detached so it outlives the request
    const child = spawn('bash', [DEPLOY_SCRIPT], {
      detached: true,
      stdio: ['ignore', fs.openSync(LOG_FILE, 'a'), fs.openSync(LOG_FILE, 'a')],
      env: { ...process.env, PATH: '/home/rmhstudios/.nvm/versions/node/v25.6.1/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' }
    });
    child.unref();
  });
}).listen(PORT, '127.0.0.1', () => logMsg(`Webhook server listening on 127.0.0.1:${PORT}`));
