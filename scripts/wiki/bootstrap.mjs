/* eslint-disable no-console -- a CLI: stdout is its output */
/* global AbortSignal -- a Node global (18+) this lint config does not list */
/**
 * First-run setup for the Wiki.js instance behind wiki.rmhstudios.com, without
 * clicking through its setup wizard and admin area:
 *
 *   1. finish the setup wizard (creates the Wiki.js root administrator),
 *   2. sign in as that administrator,
 *   3. turn the API on,
 *   4. create the API key the site uses, and print it.
 *
 * Plain Node with no dependencies, on purpose: the production host runs the
 * stack from images and has no node_modules, so this is piped into the wikijs
 * container, which has Node and reaches the wiki on localhost:3000:
 *
 *   docker exec -i \
 *     -e WIKIJS_ADMIN_EMAIL=you@example.com -e WIKIJS_ADMIN_PASSWORD='…' \
 *     rmhstudios-prod-wikijs node - < scripts/wiki/bootstrap.mjs
 *
 * Locally: WIKIJS_URL=http://localhost:7010 WIKIJS_ADMIN_EMAIL=… \
 *          WIKIJS_ADMIN_PASSWORD=… pnpm wiki:bootstrap
 *
 * Put the printed key in the deploy env file as WIKIJS_API_KEY and redeploy
 * web; then press "Apply wiki theme" and "Add starter pages" on /admin/wiki.
 * The key is shown once and expires after three years; run this again to issue
 * a new one (steps 1 and 3 are skipped when already done). Runbook: docs/wiki.md.
 *
 * The password is read from the environment, never from argv, so it does not
 * land in the process list.
 */

// Inside the wikijs container the wiki is on its own port 3000.
const base = (process.env.WIKIJS_URL || 'http://localhost:3000').replace(/\/+$/, '');
const siteUrl = (process.env.WIKI_PUBLIC_URL || 'https://wiki.rmhstudios.com').replace(/\/+$/, '');
const email = process.env.WIKIJS_ADMIN_EMAIL ?? '';
const password = process.env.WIKIJS_ADMIN_PASSWORD ?? '';

function fail(message) {
  console.error(`wiki bootstrap failed: ${message}`);
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * True once the full wiki is answering. The setup wizard answers every path,
 * /healthz included, with its HTML page and a 200, so the status alone says
 * nothing: only the real wiki returns the JSON body.
 */
async function wikiIsUp() {
  try {
    const res = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(5_000) });
    const json = await res.json();
    return json.ok === true;
  } catch {
    return false;
  }
}

async function gql(query, variables, token) {
  const res = await fetch(`${base}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) fail(json.errors[0].message);
  if (!json.data) fail(`no data from ${base}/graphql (HTTP ${res.status})`);
  return json.data;
}

async function main() {
  if (!email || !password) fail('set WIKIJS_ADMIN_EMAIL and WIKIJS_ADMIN_PASSWORD');
  if (password.length < 8) fail('Wiki.js needs a password of at least 8 characters');

  if (await wikiIsUp()) {
    console.log('setup wizard: already done');
  } else {
    const res = await fetch(`${base}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminEmail: email,
        adminPassword: password,
        adminPasswordConfirm: password,
        siteUrl,
        telemetry: false,
      }),
    }).catch((err) => fail(`cannot reach ${base}: ${err.message}`));
    const json = await res.json().catch(() => null);
    if (!json?.ok) fail(json?.error ?? `setup answered HTTP ${res.status}`);
    console.log('setup wizard: finished, waiting for the wiki to restart');
    // Wiki.js restarts itself into normal mode after the wizard.
    for (let i = 0; i < 60 && !(await wikiIsUp()); i++) await sleep(2_000);
    if (!(await wikiIsUp())) fail('the wiki did not come back after setup');
  }

  const login = await gql(
    `mutation ($username: String!, $password: String!) {
       authentication {
         login(username: $username, password: $password, strategy: "local") {
           responseResult { succeeded message }
           jwt
         }
       }
     }`,
    { username: email, password },
  );
  const token = login.authentication.login.jwt;
  if (!token) fail(login.authentication.login.responseResult.message ?? 'sign-in was refused');

  const state = await gql(
    `mutation { authentication { setApiState(enabled: true) { responseResult { succeeded message } } } }`,
    {},
    token,
  );
  if (!state.authentication.setApiState.responseResult.succeeded) fail('could not turn the API on');
  console.log('API: on');

  const created = await gql(
    `mutation {
       authentication {
         createApiKey(name: "rmhstudios.com admin", expiration: "3y", fullAccess: true) {
           responseResult { succeeded message }
           key
         }
       }
     }`,
    {},
    token,
  );
  const key = created.authentication.createApiKey.key;
  if (!key) fail(created.authentication.createApiKey.responseResult.message ?? 'no key returned');

  console.log('\nAPI key (shown once; set it as WIKIJS_API_KEY):\n');
  console.log(key);
}

void main();
