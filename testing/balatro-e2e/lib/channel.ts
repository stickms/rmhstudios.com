/**
 * The engine harness's file channel, page side (pure; shared by the harness page
 * and its unit tests). The Lua side is lib/balatro/lua/mp_test/harness.lua:
 *
 *   /rmh/test/cmd   page → Lua  NDJSON {"id","cmd","args"}   (Lua reads all, removes)
 *   /rmh/test/res   Lua → page  NDJSON HarnessMessage         (page reads all, removes)
 *   /rmh/test/enabled           marker: the test driver may install
 *
 * Browser-free so vitest can test it in node.
 */
import { z } from 'zod';

export const CHANNEL = {
  DIR: '/rmh/test',
  CMD: '/rmh/test/cmd',
  RES: '/rmh/test/res',
  MARKER: '/rmh/test/enabled',
} as const;

export const zSpecResult = z.object({
  name: z.string(),
  ok: z.boolean(),
  skip: z.boolean().optional(),
  msg: z.string().optional(),
  ms: z.number(),
});
export type SpecResult = z.infer<typeof zSpecResult>;

export const zHarnessMessage = z.discriminatedUnion('t', [
  z.object({ t: z.literal('ready'), version: z.string() }),
  z.object({
    t: z.literal('res'),
    id: z.string().optional(),
    ok: z.boolean(),
    data: z.unknown().optional(),
  }),
  z.object({ t: z.literal('spec'), r: zSpecResult }),
  z.object({ t: z.literal('crash'), msg: z.string() }),
]);
export type HarnessMessage = z.infer<typeof zHarnessMessage>;

export const zSpecSummary = z.object({
  passed: z.number(),
  failed: z.number(),
  skipped: z.number(),
  tests: z.array(zSpecResult),
  reports: z.record(z.string(), z.unknown()),
});
export type SpecSummary = z.infer<typeof zSpecSummary>;

const COMMAND_NAME = /^[a-z_]{1,64}$/;

/** One command line (with the trailing newline). */
export function encodeCommand(
  id: string,
  cmd: string,
  args: unknown[] | Record<string, unknown> = [],
): string {
  if (!COMMAND_NAME.test(cmd)) throw new Error(`bad command name: ${cmd}`);
  if (!/^[\w-]{1,64}$/.test(id)) throw new Error(`bad command id: ${id}`);
  const line = JSON.stringify({ id, cmd, args });
  if (line.includes('\n')) throw new Error('command line contains a newline');
  return `${line}\n`;
}

/** Splits the Lua output file into validated messages; bad lines are reported, not thrown. */
export function parseMessages(text: string): { messages: HarnessMessage[]; bad: string[] } {
  const messages: HarnessMessage[] = [];
  const bad: string[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      bad.push(line);
      continue;
    }
    const parsed = zHarnessMessage.safeParse(value);
    if (parsed.success) messages.push(parsed.data);
    else bad.push(line);
  }
  return { messages, bad };
}

/** TAP lines for a spec summary (printed by the vitest side for CI logs). */
export function toTap(summary: SpecSummary): string {
  const out = ['TAP version 13'];
  summary.tests.forEach((t, i) => {
    const n = i + 1;
    if (t.skip) out.push(`ok ${n} - ${t.name} # SKIP`);
    else if (t.ok) out.push(`ok ${n} - ${t.name} (${t.ms} ms)`);
    else {
      out.push(`not ok ${n} - ${t.name}`, '  ---');
      for (const line of (t.msg ?? '').split('\n')) out.push(`  # ${line}`);
      out.push('  ...');
    }
  });
  out.push(`1..${summary.tests.length}`);
  out.push(`# passed ${summary.passed}, failed ${summary.failed}, skipped ${summary.skipped}`);
  return out.join('\n');
}
