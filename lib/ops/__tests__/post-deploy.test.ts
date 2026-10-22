import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SeriesRow } from '../alarm-rules';
import { guardVerdict } from '../post-deploy';

// The post-deploy guard can redeploy the previous release on its own, so both
// halves are pinned: when the verdict says roll back, and what the script does.

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const rows = (from: number, n: number, p95: number): SeriesRow[] =>
  Array.from({ length: n }, (_, i) => ({
    at: new Date(from + i * MIN),
    metric: 'http.latency',
    dim: 'ssr',
    count: 30,
    p50: null,
    p95,
    p99: null,
    value: null,
  }));

describe('guardVerdict', () => {
  it('rolls back when page p95 breaches on minutes after the deploy', () => {
    const since = NOW - 10 * MIN;
    const v = guardVerdict([], rows(since, 10, 4000), since, NOW);
    expect(v.rollback).toBe(true);
    expect(v.reasons[0]).toMatch(/^A09 /);
  });

  it('ignores a spike that happened before the deploy', () => {
    const since = NOW - 2 * MIN;
    const v = guardVerdict(
      [],
      [...rows(NOW - 10 * MIN, 8, 9000), ...rows(since, 2, 300)],
      since,
      NOW,
    );
    expect(v.rollback).toBe(false);
  });

  it('respects a mute from /admin/alarms', () => {
    const since = NOW - 10 * MIN;
    const muted = [
      {
        key: 'A09|http.latency|ssr|p95|10m',
        threshold: null,
        muted: true,
        updatedBy: 'u',
        updatedAt: new Date(),
      },
    ];
    expect(guardVerdict(muted, rows(since, 10, 4000), since, NOW).rollback).toBe(false);
  });
});

describe('post-deploy-guard.sh', () => {
  const SCRIPT = resolve(__dirname, '../../../deploy/post-deploy-guard.sh');

  function harness(verdicts: string[], headAfter?: { at: number; sha: string }) {
    const dir = mkdtempSync(join(tmpdir(), 'guard-'));
    mkdirSync(join(dir, 'deploy'));
    mkdirSync(join(dir, 'bin'));
    copyFileSync(SCRIPT, join(dir, 'deploy/post-deploy-guard.sh'));
    const stub = (path: string, body: string) => {
      writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
      chmodSync(path, 0o755);
    };
    writeFileSync(join(dir, 'verdicts'), verdicts.join('\n') + '\n');
    stub(
      join(dir, 'bin/curl'),
      `n=$(cat ${dir}/n 2>/dev/null || echo 0); n=$((n+1)); echo $n > ${dir}/n; sed -n "\${n}p" ${dir}/verdicts`,
    );
    stub(
      join(dir, 'bin/git'),
      `n=$(cat ${dir}/n 2>/dev/null || echo 0); ${headAfter ? `[ "$n" -ge ${headAfter.at} ] && { echo ${headAfter.sha}; exit 0; };` : ''} echo abc1234`,
    );
    stub(join(dir, 'deploy/oncall-send.sh'), `echo "send $*" >> ${dir}/log`);
    stub(
      join(dir, 'deploy.sh'),
      `echo "deploy $* POST_DEPLOY_GUARD=$POST_DEPLOY_GUARD ALLOW_OLDER_DEPLOY=$ALLOW_OLDER_DEPLOY" >> ${dir}/log`,
    );
    const out = execFileSync(
      'bash',
      [join(dir, 'deploy/post-deploy-guard.sh'), 'abc1234', 'prev999', '1800000000'],
      {
        env: {
          PATH: `${join(dir, 'bin')}:/usr/bin:/bin`,
          INTERNAL_API_SECRET: 's',
          GUARD_INTERVAL_SECONDS: '0',
          GUARD_MINUTES: '6',
        },
      },
    ).toString();
    const log = existsSync(join(dir, 'log')) ? readFileSync(join(dir, 'log'), 'utf8') : '';
    return { out, log };
  }
  const ok = '{"rollback":false,"reasons":[]}';
  const bad = '{"rollback":true,"reasons":["A09 Page response time high (ssr): 4.0 s > 2.5 s"]}';

  it('a healthy release is left alone and its D05 is resolved', () => {
    const { log } = harness([ok, ok, ok, ok, ok, ok]);
    expect(log).not.toMatch(/^deploy /m);
    expect(log).toMatch(/send alert resolved D05/);
  });

  it('two bad minutes after the minimum wait → page and redeploy the previous release, guard off', () => {
    const { log } = harness([ok, ok, bad, bad]);
    expect(log).toMatch(/send alert firing D05 2 .*abc1234/);
    expect(log).toMatch(/deploy production prev999 POST_DEPLOY_GUARD=0 ALLOW_OLDER_DEPLOY=1/);
  });

  it('a single bad minute, or bad minutes before the minimum wait, do not roll back', () => {
    expect(harness([bad, ok, ok, bad, ok, ok]).log).not.toMatch(/^deploy /m);
    expect(harness([bad, bad, ok, ok, ok, ok]).log).not.toMatch(/^deploy /m);
  });

  it('stands down when a newer deploy moves HEAD', () => {
    const { out, log } = harness([bad, bad, bad, bad, bad, bad], { at: 1, sha: 'fff0000' });
    expect(out).toMatch(/newer deploy/);
    expect(log).not.toMatch(/^deploy /m);
  });
});
