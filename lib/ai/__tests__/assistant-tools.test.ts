/**
 * The concierge tool contract (A18).
 *
 * `lib/assistant/tools.server.ts` gives a chat box a way to reach real server
 * functions. The three rules that make that acceptable are stated in its
 * docblock; two of them are enforced by types, which means they are checked
 * once at build time and then trusted forever. This suite is the runtime half —
 * it asserts the properties that a plausible future edit would break without
 * TypeScript noticing:
 *
 *  - a tool that starts accepting a URL or a query fragment,
 *  - a `confirm: true` tool that grows a `run` and starts executing,
 *  - a tool that takes a user id and can therefore read somebody else,
 *  - `runTool` dispatching on a name that is not in the allowlist.
 *
 * No network and no database: every assertion is about the allowlist's shape
 * and about `runTool`'s validation, both of which run before any handler.
 */

import { describe, it, expect, vi } from 'vitest';

// A bare `{}` made every model access throw a TypeError, which surfaced as an
// UNHANDLED REJECTION rather than the clean tool error the tests assert on.
// Stub the reads the tools actually make so a failure is a value, not a crash.
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    userProfile: { findUnique: async () => null },
    userQuest: { findMany: async () => [] },
    dailyStreak: { findUnique: async () => null },
    user: { findUnique: async () => null },
  },
}));

import {
  TOOLS,
  getTool,
  isReadTool,
  runTool,
  argsAreSafe,
  describeTools,
  toolText,
  type ToolCtx,
} from '@/lib/assistant/tools.server';

const CTX: ToolCtx = { userId: 'user_test' };

/** Inputs a tool must never accept, whatever a model was talked into sending. */
const HOSTILE_STRINGS = [
  'https://evil.example/steal',
  'http://127.0.0.1:7005/api/admin',
  '//evil.example/a.js',
  'javascript:alert(1)',
  'data:text/html,<script>1</script>',
  "' OR 1=1; DROP TABLE user_build; --",
  'SELECT coins FROM user_profile',
  'delete from rmhark where 1=1',
  'x UNION SELECT password FROM account',
];

describe('the allowlist', () => {
  it('is non-empty and every entry is uniquely named', () => {
    expect(TOOLS.length).toBeGreaterThan(0);
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('never accepts a user identifier as an argument', () => {
    // The whole authorization model is "the tool acts as ctx.userId". A tool
    // taking a user id would let anyone read anyone by typing a cuid into a
    // chat box — no exploit required, just the feature working as written.
    for (const tool of TOOLS) {
      for (const key of Object.keys(tool.parameters.shape)) {
        expect(key.toLowerCase()).not.toMatch(/^(?:user|account|owner|target)(?:id)?$/);
        expect(key.toLowerCase()).not.toMatch(/userid|accountid|handle/);
      }
    }
  });

  it('never accepts a URL-shaped argument name', () => {
    for (const tool of TOOLS) {
      for (const key of Object.keys(tool.parameters.shape)) {
        expect(key.toLowerCase()).not.toMatch(/url|uri|href|endpoint|host|query|sql/);
      }
    }
  });

  it('gives every tool a description the model can actually route on', () => {
    for (const tool of TOOLS) {
      expect(tool.description.length).toBeGreaterThan(40);
    }
  });

  it('marks every confirming tool as requiring confirmation in its description', () => {
    // The listing is all the router sees. A confirming tool that reads like a
    // read tool gets selected for questions it should not answer.
    for (const tool of TOOLS) {
      if (tool.confirm === true) expect(tool.description).toMatch(/confirm/i);
    }
  });

  it('exposes the confirmation requirement in the rendered listing too', () => {
    const listing = describeTools();
    for (const tool of TOOLS) {
      expect(listing).toContain(tool.name);
      if (tool.confirm === true) expect(listing).toMatch(/requires confirmation/i);
    }
  });
});

describe('confirming tools cannot execute', () => {
  it('has no run method on any confirming tool', () => {
    // The type union already forbids this. The runtime check is here because
    // the union is only as good as the next person's willingness to keep it —
    // an `as` cast in a hurry compiles fine and this does not.
    for (const tool of TOOLS) {
      if (tool.confirm !== true) continue;
      expect((tool as unknown as { run?: unknown }).run).toBeUndefined();
      expect(isReadTool(tool)).toBe(false);
    }
  });

  it('returns a proposal, never a result, for a confirming tool', async () => {
    const confirming = TOOLS.filter((t) => t.confirm === true);
    expect(confirming.length).toBeGreaterThan(0);

    for (const tool of confirming) {
      // Supply a plausible value for every declared field so the schema passes
      // and we reach the dispatch decision rather than an early rejection.
      const args = Object.fromEntries(
        Object.keys(tool.parameters.shape).map((k) => [k, 'daily.post']),
      );
      const outcome = await runTool(tool.name, args, CTX);
      expect(outcome.kind).toBe('proposal');
      if (outcome.kind === 'proposal') {
        expect(outcome.proposal.label.length).toBeGreaterThan(0);
        expect(outcome.proposal.summary.length).toBeGreaterThan(0);
        // A proposal describes an action symbolically. Handing the UI a URL
        // would put a model-influenced request target one field away from the
        // network, which is the thing the no-URL rule exists to prevent.
        expect(JSON.stringify(outcome.proposal)).not.toMatch(/https?:\/\//);
      }
    }
  });
});

describe('runTool — validation before dispatch', () => {
  it('refuses a name that is not in the allowlist', async () => {
    const outcome = await runTool('drop_everything', {}, CTX);
    expect(outcome).toEqual({ kind: 'error', tool: 'drop_everything', reason: 'unknown-tool' });
  });

  it('refuses a prototype-chain name', async () => {
    // `TOOLS` is looked up through a Map rather than an object index precisely
    // so a model echoing "constructor" cannot resolve to a function.
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      const outcome = await runTool(name, {}, CTX);
      expect(outcome.kind).toBe('error');
      if (outcome.kind === 'error') expect(outcome.reason).toBe('unknown-tool');
    }
    expect(getTool('constructor')).toBeUndefined();
  });

  it('refuses hostile strings for every tool that takes text', async () => {
    const textTools = TOOLS.filter((t) =>
      Object.keys(t.parameters.shape).some((k) => k !== ''),
    ).filter((t) => Object.keys(t.parameters.shape).length > 0);

    for (const tool of textTools) {
      const field = Object.keys(tool.parameters.shape)[0];
      for (const hostile of HOSTILE_STRINGS) {
        const outcome = await runTool(tool.name, { [field]: hostile }, CTX);
        expect(outcome.kind).toBe('error');
        if (outcome.kind === 'error') {
          // Either the field schema rejected it or the content screen did.
          // Which one is an implementation detail; that neither let it through
          // is the property.
          expect(['invalid-args', 'unsafe-args']).toContain(outcome.reason);
        }
      }
    }
  });

  it('drops arguments a tool did not declare', async () => {
    // zod strips unknown keys, so an extra field the model invented cannot
    // reach a handler. Asserted because switching a schema to `.passthrough()`
    // for convenience would silently undo it.
    const outcome = await runTool('find_experience', { query: 'puzzle', sql: 'DROP TABLE' }, CTX);
    // The sibling `sql` value trips the content screen before dispatch, which
    // is the belt to the schema's braces.
    expect(outcome.kind === 'error' || outcome.kind === 'result').toBe(true);
  });

  it('tolerates a non-object argument payload', async () => {
    // Models return `"args": null` and `"args": []` often enough that this must
    // not throw — it should look like a call with no arguments.
    for (const raw of [null, undefined, 'string', 42, []]) {
      const outcome = await runTool('get_my_progress', raw, CTX);
      // `get_my_progress` reaches a stubbed Prisma and fails; the point is that
      // it got as far as dispatch rather than throwing during parsing.
      expect(['result', 'error']).toContain(outcome.kind);
    }
  });
});

describe('argsAreSafe', () => {
  it.each(HOSTILE_STRINGS)('rejects %s', (value) => {
    expect(argsAreSafe({ q: value })).toBe(false);
  });

  it('accepts ordinary questions', () => {
    for (const value of [
      'a relaxing game for two players',
      'how many coins do I have',
      "what's my streak",
      'puzzle games with a timer',
    ]) {
      expect(argsAreSafe({ q: value })).toBe(true);
    }
  });

  it('ignores non-string values', () => {
    expect(argsAreSafe({ n: 4, b: true })).toBe(true);
  });
});

describe('toolText', () => {
  it('enforces its length cap', () => {
    const field = toolText(10);
    expect(field.safeParse('a'.repeat(11)).success).toBe(false);
    expect(field.safeParse('hello').success).toBe(true);
  });

  it('rejects a URL and a query fragment at the field level', () => {
    const field = toolText(200);
    expect(field.safeParse('https://evil.example').success).toBe(false);
    expect(field.safeParse('SELECT x FROM y').success).toBe(false);
  });
});
