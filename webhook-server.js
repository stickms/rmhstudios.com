const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const path = require('path');

const SECRET = process.env.WEBHOOK_SECRET;
if (!SECRET || SECRET === 'change-me') {
  console.error('FATAL: WEBHOOK_SECRET must be set to a secure value');
  process.exit(1);
}
const PORT = 7002;
const DEPLOY_SCRIPT = '/home/rmhstudios/rmhstudios.com/deploy.sh';
const PROJECT_DIR = '/home/rmhstudios/rmhstudios.com';
const LOG_FILE = '/home/rmhstudios/webhook.log';
const NEWS_PIPELINE_LOG = '/home/rmhstudios/news-pipeline.log';
const NEWS_PIPELINE_INTERVAL_MS = 8 * 60 * 60 * 1000; /* 8 hours */

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

    /* Run deploy script detached so it outlives the request */
    const child = spawn('bash', [DEPLOY_SCRIPT], {
      detached: true,
      stdio: ['ignore', fs.openSync(LOG_FILE, 'a'), fs.openSync(LOG_FILE, 'a')],
      env: { ...process.env, PATH: '/home/rmhstudios/.nvm/versions/node/v25.6.1/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' }
    });
    child.unref();
  });
}).listen(PORT, '127.0.0.1', () => logMsg(`Webhook server listening on 127.0.0.1:${PORT}`));

/* ── News Pipeline Scheduler (every 8 hours = 3× per day) ────────────── */

const NPX = '/home/rmhstudios/.nvm/versions/node/v25.6.1/bin/npx';

function runNewsPipeline() {
  logMsg('News pipeline: starting scheduled run');
  const child = spawn(NPX, ['tsx', 'scripts/news-pipeline/index.ts'], {
    cwd: PROJECT_DIR,
    detached: true,
    stdio: ['ignore', fs.openSync(NEWS_PIPELINE_LOG, 'a'), fs.openSync(NEWS_PIPELINE_LOG, 'a')],
    env: { ...process.env, PATH: path.dirname(NPX) + ':/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' }
  });
  child.on('exit', (code) => logMsg(`News pipeline: exited with code ${code}`));
  child.unref();
}

/* Run once on startup, then every 8 hours */
runNewsPipeline();
setInterval(runNewsPipeline, NEWS_PIPELINE_INTERVAL_MS);
