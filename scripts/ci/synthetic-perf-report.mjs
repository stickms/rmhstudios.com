#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REPORT_DIR = process.env.LIGHTHOUSE_REPORT_DIR || path.join(ROOT, '.lighthouseci');
const CONFIG_PATH =
  process.env.SYNTHETIC_PERF_BANDS ||
  path.join(ROOT, 'scripts/ci/synthetic-perf-bands.json');
const WARN_ONLY = process.argv.includes('--warn-only');

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function normalizePath(urlOrPath) {
  try {
    return new URL(urlOrPath).pathname || '/';
  } catch {
    return urlOrPath || '/';
  }
}

function fmtMs(n) {
  return `${Math.round(n)}ms`;
}

function fmtCls(n) {
  return n.toFixed(3);
}

const config = readJson(CONFIG_PATH);
const byPath = new Map(
  (config.urls || []).map((entry) => [normalizePath(entry.url), entry.routeClass]),
);

const files = fs
  .readdirSync(REPORT_DIR)
  .filter((file) => file.endsWith('.report.json'))
  .map((file) => path.join(REPORT_DIR, file));

if (files.length === 0) {
  console.error(`synthetic-perf: no Lighthouse reports found in ${REPORT_DIR}`);
  process.exit(1);
}

const grouped = new Map();
for (const file of files) {
  const report = readJson(file);
  const routePath = normalizePath(report.finalUrl || report.requestedUrl || '/');
  const routeClass = byPath.get(routePath);
  if (!routeClass) continue;

  const metrics = {
    lcpMs: report?.audits?.['largest-contentful-paint']?.numericValue,
    inpMs:
      report?.audits?.['interaction-to-next-paint']?.numericValue ??
      report?.audits?.['experimental-interaction-to-next-paint']?.numericValue,
    cls: report?.audits?.['cumulative-layout-shift']?.numericValue,
    ttfbMs: report?.audits?.['server-response-time']?.numericValue,
    performanceScore: (report?.categories?.performance?.score ?? 0) * 100,
  };

  if (!grouped.has(routePath)) grouped.set(routePath, { routeClass, samples: [] });
  grouped.get(routePath).samples.push(metrics);
}

let hasBreach = false;
const rows = [];
for (const [routePath, bucket] of grouped.entries()) {
  const thresholds = config.thresholds?.[bucket.routeClass];
  if (!thresholds) continue;

  const merged = {
    lcpMs: median(bucket.samples.map((s) => s.lcpMs).filter(Number.isFinite)),
    inpMs: median(bucket.samples.map((s) => s.inpMs).filter(Number.isFinite)),
    cls: median(bucket.samples.map((s) => s.cls).filter(Number.isFinite)),
    ttfbMs: median(bucket.samples.map((s) => s.ttfbMs).filter(Number.isFinite)),
    performanceScore: median(
      bucket.samples.map((s) => s.performanceScore).filter(Number.isFinite),
    ),
  };

  const breaches = [];
  if (merged.lcpMs != null && merged.lcpMs > thresholds.lcpMs) breaches.push('LCP');
  if (merged.inpMs != null && merged.inpMs > thresholds.inpMs) breaches.push('INP');
  if (merged.cls != null && merged.cls > thresholds.cls) breaches.push('CLS');
  if (merged.ttfbMs != null && merged.ttfbMs > thresholds.ttfbMs) breaches.push('TTFB');
  if (
    merged.performanceScore != null &&
    merged.performanceScore < thresholds.performanceScore
  ) {
    breaches.push('PerformanceScore');
  }
  if (breaches.length) hasBreach = true;

  rows.push({
    routePath,
    routeClass: bucket.routeClass,
    merged,
    thresholds,
    breaches,
  });
}

if (!rows.length) {
  console.error('synthetic-perf: no configured URLs were found in generated reports.');
  process.exit(1);
}

console.log('\nSynthetic performance summary (median of Lighthouse runs)\n');
console.log('| Route | Class | LCP | INP | CLS | TTFB | Score | Breach |');
console.log('|---|---:|---:|---:|---:|---:|---:|---|');
for (const row of rows) {
  const score = row.merged.performanceScore ?? 0;
  const breach = row.breaches.length ? `❌ ${row.breaches.join(', ')}` : '✅';
  console.log(
    `| ${row.routePath} | ${row.routeClass} | ${fmtMs(row.merged.lcpMs ?? 0)} / ${fmtMs(
      row.thresholds.lcpMs,
    )} | ${fmtMs(row.merged.inpMs ?? 0)} / ${fmtMs(row.thresholds.inpMs)} | ${fmtCls(
      row.merged.cls ?? 0,
    )} / ${fmtCls(row.thresholds.cls)} | ${fmtMs(row.merged.ttfbMs ?? 0)} / ${fmtMs(
      row.thresholds.ttfbMs,
    )} | ${Math.round(score)} / ${row.thresholds.performanceScore} | ${breach} |`,
  );
}
console.log();

if (hasBreach && !WARN_ONLY) {
  console.error('synthetic-perf: regression band breach detected.');
  process.exit(1);
}
if (hasBreach) {
  console.warn('synthetic-perf: regression band breach detected (warn-only mode).');
}
