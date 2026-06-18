const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const SECRET = process.env.WEBHOOK_SECRET;
if (!SECRET || SECRET === 'change-me') {
    console.error('FATAL: WEBHOOK_SECRET must be set to a secure value');
    process.exit(1);
}
const PORT = 7002;
// Default to the Compose deploy; set DEPLOY_SCRIPT to deploy/deploy-k8s.sh to cut over to k3s.
const DEPLOY_SCRIPT = process.env.DEPLOY_SCRIPT || '/home/rmhstudios/rmhstudios.com/deploy.sh';
const PROJECT_DIR = '/home/rmhstudios/rmhstudios.com';
const LOG_FILE = '/home/rmhstudios/webhook.log';

/* Map git refs to deploy environments */
const BRANCH_ENV_MAP = {
    'refs/heads/main': 'production',
    'refs/heads/staging': 'staging',
};

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
                  logMsg(`WARN: Invalid signature — rejected. received=${sig} expected=${expected} bodyLen=${body.length} secretLen=${SECRET.length}`);
                  res.writeHead(401);
                  return res.end('Unauthorized');
                }

          let payload;
          try { payload = JSON.parse(body); } catch {
                  res.writeHead(400);
                  return res.end('Bad JSON');
                }

          const environment = BRANCH_ENV_MAP[payload.ref];
          if (!environment) {
                  logMsg(`Ignored push to ${payload.ref} (no matching environment)`);
                  res.writeHead(200);
                  return res.end('Ignored');
                }

          logMsg(`Push to ${payload.ref} detected (${payload.after?.slice(0, 7)}) — triggering ${environment} deploy`);
          res.writeHead(200);
          res.end(`Deploying ${environment}`);

          /* Run deploy script detached so it outlives the request */
          const child = spawn('bash', [DEPLOY_SCRIPT, environment], {
                  detached: true,
                  stdio: ['ignore', fs.openSync(LOG_FILE, 'a'), fs.openSync(LOG_FILE, 'a')],
                  cwd: PROJECT_DIR,
                  env: { ...process.env, PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' }
                });
          child.unref();
        });
}).listen(PORT, '127.0.0.1', () => logMsg(`Webhook server listening on 127.0.0.1:${PORT}`));
