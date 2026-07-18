const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const SECRET = process.env.WEBHOOK_SECRET;
if (!SECRET || SECRET === 'change-me') {
    console.error('FATAL: WEBHOOK_SECRET must be set to a secure value');
    process.exit(1);
}
const PORT = 7002;
// Compose deploy (the production path). DEPLOY_SCRIPT can override the path.
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

          // Constant-time signature comparison. `timingSafeEqual` throws on a
          // length mismatch, so guard on presence + equal length first: a
          // missing header or a wrong-length signature is treated as invalid
          // without throwing.
          const sigBuf = Buffer.from(sig || '', 'utf8');
          const expBuf = Buffer.from(expected, 'utf8');
          if (!sig || sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
                  // Never log the server-computed `expected` HMAC or the secret length —
                  // doing so would weaken the signature gate. Only log non-sensitive context.
                  logMsg(`WARN: Invalid signature — rejected. bodyLen=${body.length} hasSig=${!!sig}`);
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

          /* The exact commit whose images GitHub Actions built + pushed to GHCR.
             deploy.sh pulls this SHA's images and checks out this SHA, so the
             running code and the image always match. This request is now sent by
             the CI build workflow AFTER the push+build (not by GitHub's raw push
             webhook), which is what sequences the deploy after the image exists.
             Validate it looks like a git SHA; otherwise omit it and let deploy.sh
             fall back to the branch tip. (The body is already HMAC-authenticated;
             this is just hygiene before it becomes a process argument.) */
          const rawSha = typeof payload.after === 'string' ? payload.after : '';
          const sha = /^[0-9a-f]{7,40}$/i.test(rawSha) ? rawSha : '';
          const deployArgs = sha ? [DEPLOY_SCRIPT, environment, sha] : [DEPLOY_SCRIPT, environment];

          /* Discord message id from the CI build phase. Passing it to deploy.sh
             (via DEPLOY_DISCORD_MSG_ID) lets it EDIT the same message through the
             deploy phase, so push → build → deploy is one evolving embed. It comes
             in the `X-Discord-Msg-Id` HEADER (kept out of the signed JSON body — a
             19-digit id in the body tripped an origin WAF PAN/numeric rule and the
             POST was blocked with a 400). Fall back to a body field for safety.
             Validate it's a snowflake before it becomes an env value; empty =
             deploy.sh posts its own message. */
          const rawMid = req.headers['x-discord-msg-id'] ||
                  (typeof payload.discord_msg_id === 'string' ? payload.discord_msg_id : '');
          const discordMsgId = /^[0-9]{5,25}$/.test(rawMid) ? rawMid : '';

          logMsg(`Deploy request for ${payload.ref} (${sha ? sha.slice(0, 7) : 'tip'}) — triggering ${environment} deploy`);
          res.writeHead(200);
          res.end(`Deploying ${environment}`);

          /* Run deploy script detached so it outlives the request */
          const child = spawn('bash', deployArgs, {
                  detached: true,
                  stdio: ['ignore', fs.openSync(LOG_FILE, 'a'), fs.openSync(LOG_FILE, 'a')],
                  cwd: PROJECT_DIR,
                  env: {
                      ...process.env,
                      PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                      DEPLOY_DISCORD_MSG_ID: discordMsgId,
                  }
                });
          child.unref();
        });
}).listen(PORT, '127.0.0.1', () => logMsg(`Webhook server listening on 127.0.0.1:${PORT}`));
