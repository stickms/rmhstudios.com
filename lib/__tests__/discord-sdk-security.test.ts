import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const sdkRoot = dirname(require.resolve('@discord/embedded-app-sdk/package.json'));
type Validator = typeof import('zod/v3');
type PublicSdk = typeof import('@discord/embedded-app-sdk');

async function load<T>(file: string, format: string): Promise<T> {
  const path = join(sdkRoot, 'output', `${file}.${format}`);
  return format === 'cjs' ? require(path) : import(/* @vite-ignore */ pathToFileURL(path).href);
}

describe.each(['mjs', 'cjs'])('Discord embedded validator (%s)', (format) => {
  it('rejects oversized max/length arrays before reading any element', async () => {
    const z = await load<Validator>('lib/zod/lib/index', format);
    const visit = vi.fn(() => true);
    const element = z.string().refine(visit);
    for (const schema of [
      z.array(element).max(2, 'too many'),
      z.array(element).length(2, 'too many'),
    ]) {
      const input = new Array(100_000);
      Object.defineProperty(input, 0, {
        get: () => {
          throw new Error('oversized array element visited');
        },
      });
      const result = schema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues).toEqual([
          expect.objectContaining({ code: 'too_big', message: 'too many' }),
        ]);
      expect((await schema.safeParseAsync(input)).success).toBe(false);
    }
    expect(visit).not.toHaveBeenCalled();
  });

  it('rejects oversized sets before refinements or iteration', async () => {
    const z = await load<Validator>('lib/zod/lib/index', format);
    const visit = vi.fn(() => true);
    const element = z.string().refine(visit);
    const input = new Set(['a', 'b', 'c']);
    for (const schema of [z.set(element).max(2), z.set(element).size(2)]) {
      const result = schema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues).toHaveLength(1);
      expect((await schema.safeParseAsync(input)).success).toBe(false);
    }
    expect(visit).not.toHaveBeenCalled();
  });

  it('retains valid parsing, nested error paths and lower-bound validation', async () => {
    const z = await load<Validator>('lib/zod/lib/index', format);
    expect(z.array(z.string()).max(2).parse(['a', 'b'])).toEqual(['a', 'b']);
    expect(
      await z
        .set(z.string())
        .size(2)
        .parseAsync(new Set(['a', 'b'])),
    ).toEqual(new Set(['a', 'b']));
    const result = z.object({ list: z.array(z.string()).max(1) }).safeParse({ list: ['a', 'b'] });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]).toMatchObject({ code: 'too_big', path: ['list'] });
    expect(z.array(z.string()).length(2).safeParse(['a']).success).toBe(false);
    expect(z.array(z.string()).max(2).safeParse([1]).success).toBe(false);
  });

  it('keeps real SDK response schemas usable', async () => {
    const sdk = await load<PublicSdk>('index', format);
    expect(sdk.Responses.AuthorizeResponse.parse({ code: 'auth-code' })).toEqual({
      code: 'auth-code',
    });
    expect(sdk.Responses.AuthorizeResponse.safeParse({ code: 42 }).success).toBe(false);
    expect(typeof sdk.DiscordSDK).toBe('function');
    expect(typeof sdk.patchUrlMappings).toBe('function');
  });
});

it('resolves SDK declarations through the published v3 compatibility API', () => {
  const sdkRequire = createRequire(join(sdkRoot, 'package.json'));
  expect(JSON.parse(readFileSync(sdkRequire.resolve('zod/package.json'), 'utf8')).version).toBe(
    '4.6.7',
  );
  expect(readFileSync(join(sdkRoot, 'output/schema/common.d.ts'), 'utf8')).toContain(
    "from 'zod/v3'",
  );
  expect(sdkRequire('zod/v3').z.string().parse('compatible')).toBe('compatible');
});

it('makes the security patch available before image installation and part of cache identity', () => {
  const dockerfile = readFileSync(join(process.cwd(), 'Dockerfile'), 'utf8');
  const copy = dockerfile.indexOf('COPY patches ./patches/');
  expect(copy).toBeGreaterThan(0);
  expect(copy).toBeLessThan(dockerfile.indexOf('pnpm install --frozen-lockfile'));
  expect(
    readFileSync(join(process.cwd(), '.github/actions/setup-deps/action.yml'), 'utf8'),
  ).toContain("'patches/*.patch'");
});
