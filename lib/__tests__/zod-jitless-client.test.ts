import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Production's enforced CSP has no 'unsafe-eval'; zod's JIT probe
// (`new Function('')`) would be reported as a violation on every page.
// zod reads its config at schema CONSTRUCTION, so the jitless module must be
// the very first import of the client entry.
describe('client entry zod jitless', () => {
  it('imports lib/zod-jitless before anything else', () => {
    const src = readFileSync(join(process.cwd(), 'app/client.tsx'), 'utf8');
    const firstImport = src.match(/^import .*$/m)?.[0];
    expect(firstImport).toBe("import '@/lib/zod-jitless';");
  });
  it('configures jitless', () => {
    const src = readFileSync(join(process.cwd(), 'lib/zod-jitless.ts'), 'utf8');
    expect(src).toMatch(/z\.config\(\{ jitless: true \}\)/);
  });
});
