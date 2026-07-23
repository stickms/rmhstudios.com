#!/usr/bin/env node
/* eslint-disable no-console -- CI verifier reports drift diagnostics to stdout/stderr */
import process from 'node:process';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

function comparableRule(rule) {
  return stable({
    description: rule?.description,
    expression: rule?.expression,
    action: rule?.action,
    action_parameters: rule?.action_parameters,
  });
}

async function readStdin() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

try {
  const expectedEnvelope = JSON.parse(process.env.EXPECTED_RULESET || '');
  const response = JSON.parse(await readStdin());
  if (response?.success !== true) {
    const messages = Array.isArray(response?.errors)
      ? response.errors.map((error) => error?.message || JSON.stringify(error)).join('; ')
      : 'unknown Cloudflare API error';
    throw new Error(messages);
  }

  const expected = (expectedEnvelope?.rules || []).map(comparableRule);
  const actual = (response?.result?.rules || []).map(comparableRule);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error('cloudflare-cache-rules: drift detected.');
    console.error(
      `Expected rules: ${expected.map((rule) => rule.description).join(' | ') || '(none)'}`,
    );
    console.error(
      `Actual rules:   ${actual.map((rule) => rule.description).join(' | ') || '(none)'}`,
    );
    process.exit(1);
  }

  console.log('cloudflare-cache-rules: ruleset matches the committed configuration.');
} catch (error) {
  console.error(
    `cloudflare-cache-rules: verification failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
}
