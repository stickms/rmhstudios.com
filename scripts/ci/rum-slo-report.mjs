#!/usr/bin/env node
/* eslint-disable no-console -- CLI reporter intentionally writes tables and JSON */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const STRICT = process.argv.includes('--strict');
const JSON_OUTPUT = process.argv.includes('--json');
/**
 * Split every row by device form factor.
 *
 * Off by default because it divides each row's sample count three ways and a
 * thin window would report INSUFFICIENT everywhere. On when you are asking the
 * question this dimension was added for — "is mobile slower than desktop, and
 * on which metric" — which a pooled percentile structurally cannot answer.
 */
const BY_DEVICE = process.argv.includes('--by-device');
const minSamplesArg = process.argv.find((arg) => arg.startsWith('--min-samples='));
const p95MultiplierArg = process.argv.find((arg) => arg.startsWith('--p95-multiplier='));
const MIN_SAMPLES = Number.parseInt(minSamplesArg?.split('=', 2)[1] || '20', 10);
const P95_MULTIPLIER = Number.parseFloat(p95MultiplierArg?.split('=', 2)[1] || '1.25');
const INPUTS = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));

if (!Number.isInteger(MIN_SAMPLES) || MIN_SAMPLES < 1) {
  throw new Error('--min-samples must be a positive integer');
}
if (!Number.isFinite(P95_MULTIPLIER) || P95_MULTIPLIER < 1) {
  throw new Error('--p95-multiplier must be at least 1');
}

const thresholds = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib/rum-slo-bands.json'), 'utf8'));

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function parseSamples(text) {
  const samples = [];
  for (const line of text.split(/\r?\n/)) {
    const marker = line.indexOf('[rum:metric]');
    if (marker < 0) continue;
    const jsonStart = line.indexOf('{', marker);
    if (jsonStart < 0) continue;
    try {
      const sample = JSON.parse(line.slice(jsonStart));
      if (
        typeof sample?.routeClass === 'string' &&
        typeof sample?.name === 'string' &&
        Number.isFinite(sample?.value)
      ) {
        samples.push(sample);
      }
    } catch {
      // Ignore unrelated/truncated log lines; sample counts expose lost data.
    }
  }
  return samples;
}

async function readInput() {
  if (INPUTS.length) {
    return INPUTS.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  }
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

function formatValue(metric, value) {
  if (value == null) return 'missing';
  return metric === 'CLS' ? value.toFixed(3) : `${Math.round(value)}ms`;
}

const samples = parseSamples(await readInput());
if (!samples.length) {
  console.error('rum-slo: no [rum:metric] samples found.');
  process.exit(1);
}

const grouped = new Map();
for (const sample of samples) {
  const threshold = thresholds?.[sample.routeClass]?.[sample.name];
  if (!Number.isFinite(threshold)) continue;
  // A client cached from before the device dimension shipped sends no form
  // factor. Bucketing those as `unknown` keeps them in the report — dropping
  // them would silently shrink the population every time the beacon changes.
  const device = BY_DEVICE ? sample.formFactor || 'unknown' : null;
  const key = BY_DEVICE
    ? `${sample.routeClass}:${sample.name}:${device}`
    : `${sample.routeClass}:${sample.name}`;
  if (!grouped.has(key)) {
    grouped.set(key, {
      routeClass: sample.routeClass,
      metric: sample.name,
      device,
      threshold,
      values: [],
    });
  }
  grouped.get(key).values.push(sample.value);
}

const rows = [...grouped.values()]
  .map((group) => {
    const p50 = percentile(group.values, 0.5);
    const p75 = percentile(group.values, 0.75);
    const p95 = percentile(group.values, 0.95);
    const enoughSamples = group.values.length >= MIN_SAMPLES;
    const p75Breach = p75 > group.threshold;
    const p95Breach = p95 > group.threshold * P95_MULTIPLIER;
    return {
      routeClass: group.routeClass,
      metric: group.metric,
      ...(group.device ? { device: group.device } : {}),
      samples: group.values.length,
      threshold: group.threshold,
      p50,
      p75,
      p95,
      enoughSamples,
      p75Breach,
      p95Breach,
      pass: enoughSamples && !p75Breach && !p95Breach,
    };
  })
  .sort(
    (a, b) =>
      a.routeClass.localeCompare(b.routeClass) ||
      a.metric.localeCompare(b.metric) ||
      (a.device || '').localeCompare(b.device || ''),
  );

if (JSON_OUTPUT) {
  console.log(
    JSON.stringify({ minSamples: MIN_SAMPLES, p95Multiplier: P95_MULTIPLIER, rows }, null, 2),
  );
} else {
  const deviceCol = BY_DEVICE ? ' Device |' : '';
  const deviceSep = BY_DEVICE ? '---|' : '';
  console.log('\nRUM SLO summary\n');
  console.log(
    `| Class |${deviceCol} Metric | Samples | p50 | p75 / budget | p95 / severe band | Result |`,
  );
  console.log(`|---|${deviceSep}---|---:|---:|---:|---:|---|`);
  for (const row of rows) {
    const result = !row.enoughSamples
      ? `INSUFFICIENT (<${MIN_SAMPLES})`
      : row.pass
        ? 'PASS'
        : `FAIL${row.p75Breach ? ' p75' : ''}${row.p95Breach ? ' p95' : ''}`;
    console.log(
      `| ${row.routeClass} |${BY_DEVICE ? ` ${row.device} |` : ''} ${row.metric} | ${row.samples} | ` +
        `${formatValue(row.metric, row.p50)} | ` +
        `${formatValue(row.metric, row.p75)} / ${formatValue(row.metric, row.threshold)} | ` +
        `${formatValue(row.metric, row.p95)} / ${formatValue(row.metric, row.threshold * P95_MULTIPLIER)} | ` +
        `${result} |`,
    );
  }
  console.log();
  if (BY_DEVICE) {
    // The whole point of the split: state the gap outright rather than leaving
    // the reader to diff two rows by eye.
    const byMetric = new Map();
    for (const row of rows) {
      if (!byMetric.has(row.metric)) byMetric.set(row.metric, {});
      byMetric.get(row.metric)[row.device] = row.p75;
    }
    const gaps = [...byMetric.entries()]
      .filter(([, d]) => Number.isFinite(d.mobile) && Number.isFinite(d.desktop) && d.desktop > 0)
      .map(([metric, d]) => ({ metric, ratio: d.mobile / d.desktop }));
    if (gaps.length) {
      console.log('Mobile / desktop p75 ratio (>1 means mobile is slower):\n');
      for (const { metric, ratio } of gaps.sort((a, b) => b.ratio - a.ratio)) {
        console.log(`  ${metric.padEnd(6)} ${ratio.toFixed(2)}×`);
      }
      console.log();
    }
  }
}

if (STRICT && rows.some((row) => !row.pass)) {
  console.error('rum-slo: aggregate SLO breach or insufficient sample count.');
  process.exit(1);
}
