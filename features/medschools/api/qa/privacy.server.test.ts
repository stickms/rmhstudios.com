import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * R12: nothing about a question or its answer is stored, cached or logged. These read the source, because the thing
 * to hold is the absence of a call, and a behavioural test only sees the calls it knew to make.
 */
const files = [
  ...globSync('features/medschools/api/qa/*.server.ts'),
  'features/medschools/api/medschools.me.ask.server.ts',
]
  .map(String)
  .filter((f) => !/\.test\./.test(f))
  .sort();
const read = (f: string) => readFileSync(f, 'utf8');
/** Comments say what the module does not do; the pins are about code. */
const code = (f: string) =>
  read(f)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('Q&A privacy pins (R12)', () => {
  it('finds the files', () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  it('writes nothing but the reservation rows: no create, update, upsert or delete on any model elsewhere', () => {
    for (const f of files.filter((x) => !x.endsWith('budget.server.ts'))) {
      expect(code(f), f).not.toMatch(
        /\b(prisma|tx)\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/,
      );
      expect(code(f), f).not.toMatch(/\$executeRaw|\$queryRawUnsafe/);
    }
  });

  it('lets the budget module write only fixed-field ledger rows with no text, and delete only its own lease', () => {
    const src = code('features/medschools/api/qa/budget.server.ts');
    // Every create takes `ledgerRow(userId, <constant prompt id>)`: user, task, 'none', 'reservation', zeros.
    const creates = src.match(/\.create\(\{[^}]*\}/g) ?? [];
    expect(creates).toHaveLength(2);
    for (const c of creates) expect(c).toMatch(/data: ledgerRow\(userId, QA_(ASK|LOCK)_PROMPT_ID\)/);
    expect(src.match(/\.(update|updateMany|upsert|createMany)\(/g)).toBeNull();
    expect(src.match(/\.deleteMany\(\{ where: \{ id: leaseId \} \}\)/g)).toHaveLength(1);
    expect(src.match(/\.deleteMany\(/g)).toHaveLength(1);
    const row = /const ledgerRow = [\s\S]*?\}\);/.exec(src)![0];
    expect(row).not.toMatch(/question|text|answer|body/i);
    expect(src).not.toMatch(/\$queryRawUnsafe/);
  });

  it('caches nothing about a question: the one cache is the school directory, in freshness', () => {
    for (const f of files) {
      const src = code(f);
      if (f.endsWith('freshness.server.ts')) {
        expect(src).toMatch(/cached\(/);
        // A constant key: nothing about the caller or the question is in it.
        expect(src).toMatch(/cached\(\s*'medschools:qa:directory'/);
        continue;
      }
      expect(src, f).not.toMatch(/\bcached\w*\(|\blruL1\(|microCache|putL1\(|redis/i);
    }
  });

  it('logs no text: a console call never mentions the question, facts, text, segments or the answer', () => {
    for (const f of files) {
      for (const m of code(f).matchAll(/console\.\w+\(([^;]*)\)/g)) {
        expect(m[1], `${f}: ${m[0]}`).not.toMatch(/\b(question|facts?|text|segments?|answer|citations?)\b/i);
      }
    }
  });

  it('the endpoint declares no cache', () => {
    expect(code('features/medschools/api/medschools.me.ask.server.ts')).not.toMatch(/\bcache\s*:/);
  });
});
