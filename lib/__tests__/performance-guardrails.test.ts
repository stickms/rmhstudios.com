import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { classifyRumRoute, getRumRouteLabel, getRumThreshold } from '@/lib/rum-slo';

const repoRoot = process.cwd();
const bundleBudgetScript = path.join(repoRoot, 'scripts/ci/bundle-budget.ts');
const syntheticScript = path.join(repoRoot, 'scripts/ci/synthetic-perf-report.mjs');
const cloudflareScript = path.join(repoRoot, 'scripts/ci/verify-cloudflare-cache-rules.mjs');
const rumReportScript = path.join(repoRoot, 'scripts/ci/rum-slo-report.mjs');
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'rmh-perf-guardrails-'));
  tempDirs.push(dir);
  return dir;
}

function lighthouseReport(requestedUrl: string, overrides: Record<string, number> = {}) {
  return {
    requestedUrl,
    finalUrl: 'https://rmhstudios.com/canonical-redirect',
    audits: {
      'largest-contentful-paint': { numericValue: overrides.lcpMs ?? 1500 },
      'total-blocking-time': { numericValue: overrides.tbtMs ?? 100 },
      'cumulative-layout-shift': { numericValue: overrides.cls ?? 0.03 },
      'server-response-time': { numericValue: overrides.ttfbMs ?? 300 },
    },
    categories: { performance: { score: overrides.performanceScore ?? 0.9 } },
  };
}

function syntheticConfig(urls: Array<{ url: string; routeClass: string }>) {
  return {
    lighthouseRuns: 1,
    urls,
    thresholds: {
      core: {
        lcpMs: 2500,
        tbtMs: 300,
        cls: 0.1,
        ttfbMs: 800,
        performanceScore: 80,
      },
      content: {
        lcpMs: 3000,
        tbtMs: 400,
        cls: 0.15,
        ttfbMs: 1000,
        performanceScore: 75,
      },
    },
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('RUM route SLOs', () => {
  it('classifies whole path segments without prefix collisions', () => {
    expect(classifyRumRoute('/')).toBe('core');
    expect(classifyRumRoute('/profile/user-1?tab=posts')).toBe('core');
    expect(classifyRumRoute('/profiled')).toBe('interactive');
    expect(classifyRumRoute('/u/user-1/post/post-1')).toBe('core');
    expect(classifyRumRoute('/library/book/')).toBe('content');
    expect(classifyRumRoute('/library-card')).toBe('interactive');
    expect(classifyRumRoute('/rmhbox/room')).toBe('realtime');
  });

  it('returns only configured metric thresholds', () => {
    expect(getRumThreshold('core', 'lcp')).toBe(2500);
    expect(getRumThreshold('content', 'unknown')).toBeNull();
  });

  it('removes dynamic route segments from the metric label', () => {
    expect(getRumRouteLabel('/u/private-handle/post/secret-id')).toBe('/u');
    expect(getRumRouteLabel('/library/book-slug')).toBe('/library');
  });
});

describe('bundle budget', () => {
  it('fails closed in strict mode when build output is missing', () => {
    const dir = makeTempDir();
    const result = spawnSync(process.execPath, ['--import=tsx', bundleBudgetScript, '--strict'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, BUNDLE_BUDGET_ROOT: dir },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Strict mode cannot verify budgets');
  });

  it('measures the TanStack Start root manifest without double-counting entry scripts', () => {
    const dir = makeTempDir();
    mkdirSync(path.join(dir, '.output/public/assets'), { recursive: true });
    mkdirSync(path.join(dir, '.output/server'), { recursive: true });
    mkdirSync(path.join(dir, 'scripts/ci'), { recursive: true });
    writeFileSync(path.join(dir, '.output/public/assets/entry.js'), 'export const value = 1;');
    writeFileSync(path.join(dir, '.output/public/assets/lazy.js'), 'export const lazy = 2;');
    writeFileSync(path.join(dir, '.output/public/assets/root.css'), 'html{color:black}');
    writeFileSync(
      path.join(dir, '.output/server/_tanstack-start-manifest_test.mjs'),
      `export const tsrStartManifest = () => ({ routes: { __root__: {
        preloads: ["/assets/entry.js"],
        scripts: [{ attrs: { src: "/assets/entry.js" } }],
        css: ["/assets/root.css"]
      } } });`,
    );
    writeFileSync(
      path.join(dir, 'scripts/ci/perf-budgets.json'),
      JSON.stringify({
        brotli_kb: {
          platform_shell_eager_js: 1,
          platform_eager_css: 1,
          total_client_js_warn: 1,
        },
      }),
    );

    const result = spawnSync(process.execPath, ['--import=tsx', bundleBudgetScript, '--strict'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, BUNDLE_BUDGET_ROOT: dir },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('entry manifest tanstack-start');
  });
});

describe('synthetic performance report', () => {
  it('discovers LHCI lhr JSON and maps by requested URL before redirects', () => {
    const dir = makeTempDir();
    const configPath = path.join(dir, 'config.json');
    const routeUrl = 'https://rmhstudios.com/library';
    writeFileSync(
      configPath,
      JSON.stringify(syntheticConfig([{ url: routeUrl, routeClass: 'content' }])),
    );
    // LHCI uses lhr-*.json rather than direct Lighthouse's *.report.json.
    const reportsDir = makeTempDir();
    writeFileSync(path.join(reportsDir, 'lhr-1.json'), JSON.stringify(lighthouseReport(routeUrl)));

    const result = spawnSync(process.execPath, [syntheticScript], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        LIGHTHOUSE_REPORT_DIR: reportsDir,
        SYNTHETIC_PERF_BANDS: configPath,
      },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('| /library | content | 1/1 |');
  });

  it('fails closed when a configured route has no complete report', () => {
    const dir = makeTempDir();
    const configPath = path.join(dir, 'config.json');
    const reportsDir = makeTempDir();
    writeFileSync(
      configPath,
      JSON.stringify(
        syntheticConfig([
          { url: 'https://rmhstudios.com/', routeClass: 'core' },
          { url: 'https://rmhstudios.com/library', routeClass: 'content' },
        ]),
      ),
    );
    writeFileSync(
      path.join(reportsDir, 'lhr-1.json'),
      JSON.stringify(lighthouseReport('https://rmhstudios.com/')),
    );

    const result = spawnSync(process.execPath, [syntheticScript], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        LIGHTHOUSE_REPORT_DIR: reportsDir,
        SYNTHETIC_PERF_BANDS: configPath,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Samples 0/1');
  });
});

describe('Cloudflare cache-rule drift verifier', () => {
  it('ignores Cloudflare metadata but detects semantic rule changes', () => {
    const expected = {
      rules: [
        {
          description: 'cache images',
          expression: 'http.request.uri.path eq "/image"',
          action: 'set_cache_settings',
          action_parameters: { cache: true, edge_ttl: { mode: 'respect_origin' } },
        },
      ],
    };
    const response = {
      success: true,
      result: {
        rules: [
          {
            id: 'cloudflare-generated',
            version: '7',
            ...expected.rules[0],
          },
        ],
      },
    };
    const pass = spawnSync(process.execPath, [cloudflareScript], {
      cwd: repoRoot,
      encoding: 'utf8',
      input: JSON.stringify(response),
      env: { ...process.env, EXPECTED_RULESET: JSON.stringify(expected) },
    });
    expect(pass.status, pass.stderr).toBe(0);

    response.result.rules[0].action_parameters = {
      ...response.result.rules[0].action_parameters,
      cache: false,
    };
    const fail = spawnSync(process.execPath, [cloudflareScript], {
      cwd: repoRoot,
      encoding: 'utf8',
      input: JSON.stringify(response),
      env: { ...process.env, EXPECTED_RULESET: JSON.stringify(expected) },
    });
    expect(fail.status).toBe(1);
    expect(fail.stderr).toContain('drift detected');
  });
});

describe('aggregate RUM report', () => {
  it('turns structured metric logs into a strict percentile gate', () => {
    const lines = Array.from({ length: 20 }, (_, index) => {
      const metric = {
        routeClass: 'core',
        name: 'LCP',
        value: index >= 18 ? 5000 : 1000,
      };
      return `[server] [rum:metric] ${JSON.stringify(metric)}`;
    }).join('\n');

    const result = spawnSync(process.execPath, [rumReportScript, '--strict', '--min-samples=20'], {
      cwd: repoRoot,
      encoding: 'utf8',
      input: lines,
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('| core | LCP | 20 |');
    expect(result.stderr).toContain('aggregate SLO breach');
  });
});
