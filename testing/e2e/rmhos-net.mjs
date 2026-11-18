// ─────────────────────────────────────────────────────────────────────────────
// rmhOS internet access, end to end, through the real relay hub.
//
// Setup (once per run; the two modes need different server environments):
//   pnpm rmhos:image                      # or an image already in public/rmhos-dev
//   openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 2 \
//     -subj /CN=localhost -addext subjectAltName=DNS:localhost,IP:127.0.0.1
//   # Vite behind the TLS front (v86 always builds an https DoH URL, so DNS needs https):
//   BETTER_AUTH_URL=https://localhost:7443 VITE_BETTER_AUTH_URL=https://localhost:7443 \
//   RMHOS_NET_TICKET_SECRET=dev-secret [RMHOS_NET_ENABLED=0] pnpm exec vite dev
//   # the run (starts the TLS front, and in MODE=on the hub, itself):
//   MODE=on  TLS_KEY=key.pem TLS_CERT=cert.pem RMHOS_NET_TICKET_SECRET=dev-secret \
//     [GUEST_CA=ca-bundle.pem] [RMHOS_NET_DOH_UPSTREAM=https://…/dns-query] node testing/e2e/rmhos-net.mjs
//   MODE=off TLS_KEY=… TLS_CERT=… node testing/e2e/rmhos-net.mjs      # Vite started with RMHOS_NET_ENABLED=0
//
// MODE=on, inside the guest (a shell script is written to the 9p share and run in an xterm):
//   - the session has been up for more than 2 minutes first (the 60 s ticket is long expired);
//   - DNS resolves a name through the hub's DoH endpoint;
//   - curl https://example.com -> 200;
//   - the relay socket is dropped (the TLS front destroys it) and v86 reconnects with the same URL;
//     curl -> 200 again;
//   - http://169.254.169.254/ and port 25 are refused by the policy (stream log: reason blocked);
//   - an allowed non-web port (22) is attempted: the hub log shows a close reason other than blocked;
//   - the toolbar says "Online".
// MODE=off: the toolbar says "Network off", no WebSocket to /rmhos-net/ is opened, the machine boots.
//
// GUEST_CA: a PEM file the guest trusts for the curl checks. Needed only where TLS is inspected
// (a sandbox egress gateway re-signs example.com); with real internet the guest's own CA store works.
// CHROMIUM_PATH: a specific browser binary. Screenshots go to SHOTS_DIR (default ./shots). Exits 1 on the first failure.
// ─────────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import { X509Certificate } from 'node:crypto';
import { chromium } from 'playwright';
import { startFront } from './rmhos-tls-front.mjs';

const MODE =
  process
    .env
    .MODE ??
  'on';
const FRONT =
  'https://localhost:7443';
const SHOTS =
  process
    .env
    .SHOTS_DIR ??
  'shots';
const SESSION_AGE_MS = 130_000;
const sleep =
  (
    ms,
  ) =>
    new Promise(
      (
        r,
      ) =>
        setTimeout(
          r,
          ms,
        ),
    );
const log =
  (
    ...a
  ) =>
    console.log(
      new Date()
        .toISOString()
        .slice(
          11,
          19,
        ),
      ...a,
    );

fs.mkdirSync(
  SHOTS,
  {
    recursive: true,
  },
);

async function signIn(
  ctx,
) {
  const email = `rmhos-net-${Date.now()}@example.test`;
  const body =
    {
      email,
      password:
        'Passw0rd!Passw0rd!',
      name: 'Net E2E',
    };
  for (const path of [
    'sign-up/email',
    'sign-in/email',
  ]) {
    for (
      let i = 0;
      ;
      i++
    ) {
      const r =
        await ctx.request.post(
          `${FRONT}/api/auth/${path}`,
          {
            headers:
              {
                origin:
                  FRONT,
              },
            data: body,
          },
        );
      if (
        r.status() <
        300
      )
        break;
      if (
        r.status() !==
          429 ||
        i >
          5
      )
        throw new Error(
          `${path}: ${r.status()}`,
        );
      await sleep(
        15_000,
      );
    }
  }
}

const front =
  await startFront(
    {
      key: fs.readFileSync(
        process
          .env
          .TLS_KEY,
      ),
      cert: fs.readFileSync(
        process
          .env
          .TLS_CERT,
      ),
    },
  );

let hub =
  null;
const hubLines =
  [];
if (
  MODE ===
  'on'
) {
  // tsx directly (not through pnpm), so killing the child really stops the hub.
  hub =
    spawn(
      'node_modules/.bin/tsx',
      [
        'server/rmhos-net/index.ts',
      ],
      {
        env: {
          ...process.env,
          RMHOS_NET_PORT:
            '7009',
          RMHOS_NET_CORS_ORIGIN:
            FRONT,
        },
        stdio:
          [
            'ignore',
            'pipe',
            'inherit',
          ],
      },
    );
  let buf =
    '';
  hub.stdout.on(
    'data',
    (
      d,
    ) => {
      buf +=
        d;
      let i;
      while (
        (i =
          buf.indexOf(
            '\n',
          )) >=
        0
      ) {
        const line =
          buf.slice(
            0,
            i,
          );
        buf =
          buf.slice(
            i +
              1,
          );
        hubLines.push(
          line,
        );
        if (
          line.includes(
            'rmhos-net.',
          )
        )
          log(
            'hub',
            line,
          );
      }
    },
  );
  for (
    let i = 0;
    i <
      100 &&
    !hubLines.some(
      (
        l,
      ) =>
        l.includes(
          'listening',
        ),
    );
    i++
  )
    await sleep(
      200,
    );
  assert(
    hubLines.some(
      (
        l,
      ) =>
        l.includes(
          'listening',
        ),
    ),
    'hub did not start',
  );
}

const browser =
  await chromium.launch(
    process
      .env
      .CHROMIUM_PATH
      ? {
          executablePath:
            process
              .env
              .CHROMIUM_PATH,
        }
      : {},
  );
const ctx =
  await browser.newContext(
    {
      viewport:
        {
          width: 1280,
          height: 800,
        },
      deviceScaleFactor: 2,
      colorScheme:
        'dark',
      ignoreHTTPSErrors: true,
    },
  );
let failed =
  null;
try {
  await signIn(
    ctx,
  );
  const page =
    await ctx.newPage();
  const sockets =
    [];
  page.on(
    'websocket',
    (
      ws,
    ) => {
      if (
        !ws
          .url()
          .includes(
            '/rmhos-net/',
          )
      )
        return;
      sockets.push(
        ws
          .url()
          .replace(
            /ticket=[^&]+/,
            'ticket=…',
          ),
      );
      log(
        'page: relay socket opened',
      );
      ws.on(
        'close',
        () =>
          log(
            'page: relay socket closed',
          ),
      );
    },
  );
  let sessionAt = 0;
  page.on(
    'response',
    (
      r,
    ) => {
      if (
        !r
          .url()
          .includes(
            '/api/rmhos/session',
          )
      )
        return;
      sessionAt =
        Date.now();
      log(
        'page: GET /api/rmhos/session',
        r.status(),
      );
    },
  );
  page.on(
    'pageerror',
    (
      e,
    ) =>
      log(
        'page error:',
        String(
          e,
        ).slice(
          0,
          200,
        ),
      ),
  );
  page.on(
    'framenavigated',
    (
      f,
    ) =>
      f ===
        page.mainFrame() &&
      log(
        'page: navigated',
        f.url(),
      ),
  );
  const phase =
    () =>
      page.evaluate(
        () =>
          window.__rmhosPhase,
      );
  const toolbarText =
    () =>
      page
        .locator(
          '.rmhos-toolbar-status',
        )
        .innerText();

  await page.goto(
    `${FRONT}/rmhos`,
  );
  await page.waitForFunction(
    () =>
      [
        'running',
        'failed',
      ].includes(
        window.__rmhosPhase,
      ),
    null,
    {
      timeout: 180_000,
      polling: 200,
    },
  );
  assert.equal(
    await phase(),
    'running',
  );
  // The desktop is ready once the toolbar enables Save.
  await page
    .getByRole(
      'button',
      {
        name: 'Save',
      },
    )
    .waitFor(
      {
        state:
          'visible',
      },
    );
  await page
    .waitForFunction(
      () =>
        !document
          .querySelector(
            'button[aria-label="Save"], button',
          )
          ?.hasAttribute(
            'disabled',
          ),
      null,
      {
        timeout: 60_000,
      },
    )
    .catch(
      () => {},
    );
  log(
    'machine running; toolbar:',
    JSON.stringify(
      await toolbarText(),
    ),
  );

  if (
    MODE ===
    'off'
  ) {
    await sleep(
      3000,
    );
    assert.match(
      await toolbarText(),
      /Network off/,
    );
    assert.deepEqual(
      sockets,
      [],
      'no WebSocket to /rmhos-net/ may be opened with the network off',
    );
    await page.screenshot(
      {
        path: `${SHOTS}/rmhos-net-off.png`,
      },
    );
    log(
      'OFF OK: toolbar "Network off", no relay WebSocket, machine booted',
    );
  } else {
    await page
      .getByText(
        'Online',
        {
          exact: true,
        },
      )
      .waitFor(
        {
          timeout: 60_000,
        },
      );
    log(
      'toolbar: Online; relay sockets opened:',
      sockets.length,
    );

    // The 60 s ticket is long expired by the time the guest needs the network again.
    const wait =
      SESSION_AGE_MS -
      (Date.now() -
        sessionAt);
    if (
      wait >
      0
    ) {
      log(
        `waiting ${Math.round(wait / 1000)} s so the session is older than 2 minutes`,
      );
      await sleep(
        wait,
      );
    }
    log(
      'session age',
      Math.round(
        (Date.now() -
          sessionAt) /
          1000,
      ),
      's',
    );

    // Put the guest-side script and optional CA on the 9p share.
    let ca =
      '';
    if (
      process
        .env
        .GUEST_CA
    ) {
      const pems =
        fs
          .readFileSync(
            process
              .env
              .GUEST_CA,
            'utf8',
          )
          .match(
            /-----BEGIN CERTIFICATE-----[^-]+-----END CERTIFICATE-----/g,
          ) ??
        [];
      ca =
        pems
          .filter(
            (
              p,
            ) =>
              /Anthropic/.test(
                new X509Certificate(
                  p,
                )
                  .subject +
                  new X509Certificate(
                    p,
                  )
                    .issuer,
              ),
          )
          .join(
            '\n',
          ) +
        '\n';
      assert(
        ca.trim()
          .length >
          1,
        'GUEST_CA has no usable certificate',
      );
    }
    const cacert =
      ca
        ? '--cacert /mnt/host/sync/e2e-ca.pem'
        : '';
    const script = `#!/bin/sh
out=/mnt/host/sync/e2e-out.txt
step() { printf '== %s\\n' "$1" >>$out; }
step dns
nslookup example.com >>$out 2>&1
step curl-1
curl -sS -m 40 ${cacert} -o /dev/null -w 'http %{http_code}\\n' https://example.com >>$out 2>&1
step wait-for-reconnect
sleep 45
step curl-2-after-reconnect
curl -sS -m 40 ${cacert} -o /dev/null -w 'http %{http_code}\\n' https://example.com >>$out 2>&1
step metadata-169.254.169.254
curl -sS -m 10 -o /dev/null -w 'http %{http_code}\\n' http://169.254.169.254/ >>$out 2>&1; echo "rc=$?" >>$out
step smtp-25
nc -w 8 example.com 25 </dev/null >>$out 2>&1; echo "rc=$?" >>$out
step port-22
nc -w 8 example.com 22 </dev/null >>$out 2>&1; echo "rc=$?" >>$out
step done
`;
    await page.evaluate(
      async ({
        script,
        ca,
      }) => {
        const enc =
          new TextEncoder();
        await window.__rmhosVm.writeShareFile(
          '/sync/e2e-run.sh',
          enc.encode(
            script,
          ),
        );
        if (
          ca
        )
          await window.__rmhosVm.writeShareFile(
            '/sync/e2e-ca.pem',
            enc.encode(
              ca,
            ),
          );
        await window.__rmhosVm.writeShareFile(
          '/sync/e2e-out.txt',
          enc.encode(
            '',
          ),
        );
      },
      {
        script,
        ca,
      },
    );

    // Open a terminal and run it.
    const box =
      await page
        .locator(
          '.rmhos-screen',
        )
        .boundingBox();
    await page.mouse.click(
      box.x +
        box.width /
          2,
      box.y +
        box.height /
          2,
    );
    await page.keyboard.press(
      'Control+Alt+t',
    );
    await sleep(
      8000,
    );
    const cmd =
      'doas sh /mnt/host/sync/e2e-run.sh';
    for (const ch of cmd) {
      await page.keyboard.press(
        ch ===
          ' '
          ? 'Space'
          : ch ===
              '/'
            ? 'Slash'
            : ch ===
                '.'
              ? 'Period'
              : ch,
        {
          delay: 20,
        },
      );
      await sleep(
        20,
      );
    }
    await page.keyboard.press(
      'Enter',
    );

    // After the first curl, drop the relay socket from the front; v86 reconnects by itself.
    const read =
      () =>
        page.evaluate(
          async () =>
            new TextDecoder().decode(
              await window.__rmhosVm.readShareFile(
                '/sync/e2e-out.txt',
              ),
            ),
        );
    const until =
      async (
        re,
        ms,
      ) => {
        const end =
          Date.now() +
          ms;
        for (;;) {
          const t =
            await read().catch(
              () =>
                '',
            );
          if (
            re.test(
              t,
            )
          )
            return t;
          if (
            Date.now() >
            end
          )
            throw new Error(
              `guest output never matched ${re}:\n${t}`,
            );
          await sleep(
            1500,
          );
        }
      };
    await until(
      /== curl-1\nhttp \d+/,
      120_000,
    );
    const dropped =
      await ctx.request.post(
        `${FRONT}/__front/drop-ws`,
      );
    log(
      'dropped relay socket:',
      await dropped.text(),
    );
    const out =
      await until(
        /== done/,
        240_000,
      );
    console.log(
      '--- guest output ---\n' +
        out +
        '--- end ---',
    );
    await page.screenshot(
      {
        path: `${SHOTS}/rmhos-online-1280-dark.png`,
      },
    );

    const section =
      (
        name,
      ) =>
        out
          .split(
            `== ${name}\n`,
          )[1]
          ?.split(
            '== ',
          )[0] ??
        '';
    assert.match(
      section(
        'curl-1',
      ),
      /http 200/,
      'curl https://example.com',
    );
    assert.match(
      section(
        'curl-2-after-reconnect',
      ),
      /http 200/,
      'curl after the relay socket was dropped',
    );
    assert.match(
      section(
        'dns',
      ),
      /Name:\s+example\.com\s+Address:\s*\S+/,
      'nslookup should resolve example.com',
    );
    assert.doesNotMatch(
      section(
        'metadata-169.254.169.254',
      ),
      /http 2\d\d/,
      'metadata address must fail',
    );
    assert.doesNotMatch(
      section(
        'metadata-169.254.169.254',
      ),
      /rc=0/,
    );
    // (busybox nc exits 0 on an immediate close, so port 25 and 22 are judged by the hub's stream log.)

    const streams =
      hubLines
        .filter(
          (
            l,
          ) =>
            l.includes(
              'rmhos-net.stream',
            ),
        )
        .map(
          (
            l,
          ) =>
            JSON.parse(
              l,
            ),
        );
    // v86 resolves names itself (DoH through the hub) and dials the address, so the log names IPs.
    const onPort =
      (
        port,
      ) =>
        streams.filter(
          (
            s,
          ) =>
            s.port ===
            port,
        );
    assert(
      onPort(
        443,
      ).some(
        (
          s,
        ) =>
          s.reason ===
            'voluntary' &&
          s.down >
            0 &&
          net.isIP(
            s.host,
          ) !==
            0,
      ),
      'stream log: a relayed https stream to the address DNS returned',
    );
    const meta =
      streams.filter(
        (
          s,
        ) =>
          s.host ===
          '169.254.169.254',
      );
    assert(
      meta.length >
        0 &&
        meta.every(
          (
            s,
          ) =>
            s.reason ===
            'blocked',
        ),
      'stream log: metadata blocked',
    );
    assert(
      onPort(
        25,
      )
        .length >
        0 &&
        onPort(
          25,
        ).every(
          (
            s,
          ) =>
            s.reason ===
            'blocked',
        ),
      'stream log: port 25 blocked',
    );
    assert(
      onPort(
        22,
      )
        .length >
        0 &&
        onPort(
          22,
        ).every(
          (
            s,
          ) =>
            s.reason !==
            'blocked',
        ),
      'stream log: port 22 attempted, not blocked by us',
    );
    const opens =
      hubLines.filter(
        (
          l,
        ) =>
          l.includes(
            '"state":"open"',
          ),
      ).length;
    assert(
      opens >=
        2,
      `the relay socket should have reconnected (opens: ${opens})`,
    );
    assert.match(
      await toolbarText(),
      /Online/,
    );
    log(
      'ON OK. relay sockets opened by the page:',
      sockets.length,
      '; hub session opens:',
      opens,
    );
  }
} catch (e) {
  failed =
    e;
  console.error(
    'FAILED:',
    e.stack ??
      e,
  );
}
await browser.close();
hub?.kill(
  'SIGTERM',
);
front.close();
process.exit(
  failed
    ? 1
    : 0,
);
