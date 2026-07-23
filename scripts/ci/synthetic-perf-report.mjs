#!/usr/bin/env node
/* eslint-disable no-console -- CI reporter intentionally writes a human-readable summary */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REPORT_DIR = process.env.LIGHTHOUSE_REPORT_DIR || path.join(ROOT, '.lighthouseci');
const CONFIG_PATH =
  process.env.SYNTHETIC_PERF_BANDS || path.join(ROOT, 'scripts/ci/synthetic-perf-bands.json');
// Warn-only mode logs regression-band breaches without failing the caller. The
// scheduled workflow passes this explicitly because performance is monitored,
// not used as a merge or deployment gate.
const WARN_ONLY = process.argv.includes('--warn-only');
const REQUIRED_METRICS = ['lcpMs', 'tbtMs', 'cls', 'ttfbMs', 'performanceScore'];

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizePath(urlOrPath) {
  let pathname;
  try {
    pathname = new URL(urlOrPath).pathname || '/';
  } catch {
    pathname = String(urlOrPath || '/').split(/[?#]/, 1)[0] || '/';
  }
  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  return pathname === '/' ? pathname : pathname.replace(/\/+$/, '');
}

function fmtMs(value) {
  return value == null ? 'missing' : `${Math.round(value)}ms`;
}

function fmtCls(value) {
  return value == null ? 'missing' : value.toFixed(3);
}

function loadConfig() {
  const config = readJson(CONFIG_PATH);
  if (!Number.isInteger(config.lighthouseRuns) || config.lighthouseRuns < 1) {
    throw new Error('lighthouseRuns must be a positive integer');
  }
  if (!Array.isArray(config.urls) || config.urls.length === 0) {
    throw new Error('urls must contain at least one configured probe');
  }

  const seen = new Set();
  for (const entry of config.urls) {
    const routePath = normalizePath(entry?.url);
    if (seen.has(routePath)) throw new Error(`duplicate configured route: ${routePath}`);
    seen.add(routePath);

    const thresholds = config.thresholds?.[entry?.routeClass];
    if (!thresholds) {
      throw new Error(`missing thresholds for route class: ${String(entry?.routeClass)}`);
    }
    for (const metric of REQUIRED_METRICS) {
      if (!Number.isFinite(thresholds[metric])) {
        throw new Error(`missing numeric ${metric} threshold for ${entry.routeClass}`);
      }
    }
  }
  return config;
}

function findLighthouseReports() {
  if (!fs.existsSync(REPORT_DIR)) return [];
  const reports = [];
  for (const file of fs.readdirSync(REPORT_DIR)) {
    if (!file.endsWith('.json')) continue;
    const filePath = path.join(REPORT_DIR, file);
    try {
      const report = readJson(filePath);
      // LHCI collect writes lhr-*.json. Direct Lighthouse writes *.report.json.
      // Detect reports by shape so either output convention works while helper
      // files such as manifest.json and assertion-results.json are ignored.
      if (report?.audits && report?.categories?.performance) reports.push(report);
    } catch {
      // A non-report JSON helper should not invalidate otherwise complete runs.
    }
  }
  return reports;
}

function toMetrics(report) {
  return {
    lcpMs: report?.audits?.['largest-contentful-paint']?.numericValue,
    tbtMs: report?.audits?.['total-blocking-time']?.numericValue,
    cls: report?.audits?.['cumulative-layout-shift']?.numericValue,
    ttfbMs: report?.audits?.['server-response-time']?.numericValue,
    performanceScore: Number.isFinite(report?.categories?.performance?.score)
      ? report.categories.performance.score * 100
      : null,
  };
}

function appendStepSummary(markdown) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) fs.appendFileSync(summaryPath, markdown);
}

function main() {
  const config = loadConfig();
  const reports = findLighthouseReports();
  if (reports.length === 0) {
    throw new Error(`no Lighthouse reports found in ${REPORT_DIR}`);
  }

  const byPath = new Map(
    config.urls.map((entry) => [
      normalizePath(entry.url),
      { routeClass: entry.routeClass, samples: [] },
    ]),
  );

  for (const report of reports) {
    // requestedUrl preserves the configured route when the production site
    // redirects to a canonical URL. finalUrl is only a fallback.
    const routePath = normalizePath(report.requestedUrl || report.finalUrl || '/');
    const bucket = byPath.get(routePath);
    if (bucket) bucket.samples.push(toMetrics(report));
  }

  let hasBreach = false;
  const rows = [];
  for (const entry of config.urls) {
    const routePath = normalizePath(entry.url);
    const bucket = byPath.get(routePath);
    const thresholds = config.thresholds[entry.routeClass];
    const merged = {};
    const breaches = [];

    if (bucket.samples.length < config.lighthouseRuns) {
      breaches.push(`Samples ${bucket.samples.length}/${config.lighthouseRuns}`);
    }

    for (const metric of REQUIRED_METRICS) {
      const values = bucket.samples.map((sample) => sample[metric]).filter(Number.isFinite);
      merged[metric] = median(values);
      if (values.length < config.lighthouseRuns) breaches.push(`${metric} missing`);
    }

    if (merged.lcpMs != null && merged.lcpMs > thresholds.lcpMs) breaches.push('LCP');
    if (merged.tbtMs != null && merged.tbtMs > thresholds.tbtMs) breaches.push('TBT');
    if (merged.cls != null && merged.cls > thresholds.cls) breaches.push('CLS');
    if (merged.ttfbMs != null && merged.ttfbMs > thresholds.ttfbMs) breaches.push('TTFB');
    if (merged.performanceScore != null && merged.performanceScore < thresholds.performanceScore) {
      breaches.push('Performance score');
    }

    const uniqueBreaches = [...new Set(breaches)];
    if (uniqueBreaches.length) hasBreach = true;
    rows.push({
      routePath,
      routeClass: entry.routeClass,
      sampleCount: bucket.samples.length,
      merged,
      thresholds,
      breaches: uniqueBreaches,
    });
  }

  const lines = [
    '## Synthetic performance summary',
    '',
    `Median of ${config.lighthouseRuns} Lighthouse run(s) per configured route.`,
    '',
    '| Route | Class | Runs | LCP | TBT | CLS | TTFB | Score | Result |',
    '|---|---|---:|---:|---:|---:|---:|---:|---|',
  ];
  for (const row of rows) {
    const result = row.breaches.length ? `FAIL: ${row.breaches.join(', ')}` : 'PASS';
    lines.push(
      `| ${row.routePath} | ${row.routeClass} | ${row.sampleCount}/${config.lighthouseRuns} | ` +
        `${fmtMs(row.merged.lcpMs)} / ${fmtMs(row.thresholds.lcpMs)} | ` +
        `${fmtMs(row.merged.tbtMs)} / ${fmtMs(row.thresholds.tbtMs)} | ` +
        `${fmtCls(row.merged.cls)} / ${fmtCls(row.thresholds.cls)} | ` +
        `${fmtMs(row.merged.ttfbMs)} / ${fmtMs(row.thresholds.ttfbMs)} | ` +
        `${row.merged.performanceScore == null ? 'missing' : Math.round(row.merged.performanceScore)} / ` +
        `${row.thresholds.performanceScore} | ${result} |`,
    );
  }
  lines.push('');

  const markdown = `${lines.join('\n')}\n`;
  console.log(markdown);
  appendStepSummary(markdown);

  if (hasBreach && !WARN_ONLY) {
    console.error('synthetic-perf: regression band breach or incomplete probe detected.');
    return 1;
  }
  if (hasBreach) {
    console.warn(
      'synthetic-perf: regression band breach or incomplete probe detected (warn-only mode).',
    );
  }
  return 0;
}

try {
  process.exit(main());
} catch (error) {
  const message = `synthetic-perf: unable to evaluate reports: ${
    error instanceof Error ? error.message : String(error)
  }`;
  if (WARN_ONLY) {
    console.warn(`${message} (warn-only mode).`);
    process.exit(0);
  }
  console.error(message);
  process.exit(1);
}
