import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// curl is the only external boundary: a stand-in serves each probed path.
function smoke(fakeCurl: string) {
  const dir = mkdtempSync(join(tmpdir(), 'rmh-smoke-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'bin'));
  writeFileSync(join(dir, 'bin/curl'), `#!/bin/bash\n${fakeCurl}\n`, { mode: 0o755 });
  return spawnSync('/bin/bash', [resolve('deploy/smoke-test.sh')], {
    env: {
      PATH: `${join(dir, 'bin')}:/usr/bin:/bin`,
      BASE_URL: 'http://smoke.test',
      ORIGIN_HOST: '',
    },
    encoding: 'utf8',
    timeout: 10_000,
  });
}

const pages = `
for last; do :; done
case "$last" in
  */blog/rss.xml) printf '<rss>\\0\\n200' ;;
  */sitemap.xml) printf '<sitemapindex>\\n200' ;;
  */api/ready) printf 'ok\\n200' ;;
  *) printf '<html>\\0\\n200' ;;
esac`;

describe.skipIf(process.platform === 'win32')('deploy smoke test', () => {
  // A NUL byte in a probed body made bash print "ignored null byte in input"
  // on every probe attempt, flooding the deploy log during the bake.
  it('tolerates NUL bytes in a response without warning', () => {
    const result = smoke(pages);
    expect(result.stderr).not.toContain('null byte');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('ok   /');
  });
  it('still fails a probe whose page is unreachable', () => {
    const result = smoke('exit 7');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('FAIL / — HTTP 000');
  });
  it('still fails a 200 whose body lacks the expected marker', () => {
    const result = smoke(`printf 'maintenance\\n200'`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("body lacks '<html'");
  });
});
