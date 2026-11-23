import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * Coverage of account deletion over the schema: every model with a relation to `User` is classified in
 * `ERASURE_REGISTRY`, and what the registry says matches what `anonymizeAccount` records. The schema is parsed here
 * (`@prisma/internals` is not a dependency).
 */

interface Op {
  model: string;
  method: string;
  args: unknown;
}

const prismaMock = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => (args: unknown) => ({
          model: name,
          method,
          args,
        }),
      },
    );
  return new Proxy(
    {
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    } as Record<string, unknown>,
    {
      get: (t, key: string) => (key in t ? t[key] : model(key)),
    },
  );
});
vi.mock('@/lib/prisma.server', () => ({
  prisma: prismaMock,
}));

// The med schools pre-step runs its own transaction; this file records the erasure batch, so the pre-step is stubbed
// (its behaviour is held by `medschools-erasure.test.ts`).
vi.mock('@features/medschools/api/share-sync.server', () => ({
  eraseSharedMedEvents: vi.fn(async () => ({ events: 0 })),
}));

import { anonymizeAccount } from '@/lib/account/deletion.server';
import { ERASURE_REGISTRY, TODO_CEILING } from '@/lib/account/erasure-registry';

// ── The schema parser ────────────────────────────────────────────────────────────────────────────────────────────

interface ParsedRelation {
  /** The model the relation points at. */
  target: string;
  onDelete: string | null;
}
interface ParsedModel {
  name: string;
  /** Relations to `User` (a field typed `User`, `User?` or `User[]` with `@relation`). */
  userRelations: ParsedRelation[];
  /** Every `@relation` field, by target model. */
  relations: ParsedRelation[];
}

/** Drop a `//` comment unless it sits inside a string literal. */
function stripComment(line: string): string {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && line[i - 1] !== '\\') inString = !inString;
    else if (!inString && c === '/' && line[i + 1] === '/') return line.slice(0, i);
  }
  return line;
}

export function parseSchema(source: string): ParsedModel[] {
  const models: ParsedModel[] = [];
  let current: ParsedModel | null = null;
  let pending = '';
  for (const raw of source.split('\n')) {
    const line = stripComment(raw).trim();
    if (!current) {
      const m = /^model\s+(\w+)\s*\{/.exec(line);
      if (m)
        current = {
          name: m[1]!,
          userRelations: [],
          relations: [],
        };
      continue;
    }
    if (line === '}') {
      models.push(current);
      current = null;
      pending = '';
      continue;
    }
    if (!line) continue;
    // A field can wrap over several lines inside its parentheses.
    pending = pending ? `${pending} ${line}` : line;
    if ((pending.match(/\(/g) ?? []).length !== (pending.match(/\)/g) ?? []).length) continue;
    const field = pending;
    pending = '';
    if (field.startsWith('@@')) continue;
    const f = /^(\w+)\s+(\w+)(\[\]|\?)?\s*(.*)$/.exec(field);
    if (!f || !f[4]!.includes('@relation')) continue;
    const onDelete = /onDelete:\s*(\w+)/.exec(f[4]!)?.[1] ?? null;
    const rel = {
      target: f[2]!,
      onDelete,
    };
    current.relations.push(rel);
    if (f[2] === 'User') current.userRelations.push(rel);
  }
  return models;
}

function schemaFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return schemaFiles(path);
    return name.endsWith('.prisma') ? [path] : [];
  });
}

const allModels = schemaFiles(join(process.cwd(), 'prisma/schema')).flatMap((f) =>
  parseSchema(readFileSync(f, 'utf8')),
);
// The `User` model is anonymised in place and is not an entry of its own.
const memberModels = allModels.filter((m) => m.name !== 'User' && m.userRelations.length > 0);
const modelNames = new Set(allModels.map((m) => m.name));

/** The Prisma client accessor: the model name with its first letter lowered (`RMHark` is `rMHark`). */
const accessor = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);

// ── The recorded run ─────────────────────────────────────────────────────────────────────────────────────────────

async function recordAnonymize(): Promise<Op[]> {
  const fn = prismaMock.$transaction as ReturnType<typeof vi.fn>;
  fn.mockClear();
  await anonymizeAccount('user-1');
  return fn.mock.calls[0]![0] as Op[];
}

const methodsOn = (ops: Op[], model: string) =>
  new Set(ops.filter((o) => o.model === accessor(model)).map((o) => o.method));

const ERASING = ['deleteMany', 'delete'];
const UPDATING = ['updateMany', 'update'];

describe('the schema parser', () => {
  it('reads a model with two relations to User and keeps their onDelete', () => {
    const [m] = parseSchema(`
model Notification {
  id      String @id
  userId  String
  actorId String?
  user  User  @relation("UserNotifications", fields: [userId], references: [id], onDelete: Cascade)
  actor User? @relation("UserNotificationActor", fields: [actorId], references: [id], onDelete: SetNull)
  @@map("notification")
}`);
    expect(m!.name).toBe('Notification');
    expect(m!.userRelations).toEqual([
      {
        target: 'User',
        onDelete: 'Cascade',
      },
      {
        target: 'User',
        onDelete: 'SetNull',
      },
    ]);
  });

  it('reads a model with a composite @@id and a relation to another model', () => {
    const [m] = parseSchema(`
model KeywordAlertHit {
  userId   String
  rmheetId String
  user  User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  post  RMHark @relation(fields: [rmheetId], references: [id], onDelete: Cascade)
  @@id([userId, rmheetId])
}`);
    expect(m!.userRelations).toHaveLength(1);
    expect(m!.relations.map((r) => r.target)).toEqual(['User', 'RMHark']);
  });

  it('ignores a commented-out field and a // inside a comment', () => {
    const [m] = parseSchema(`
model Thing {
  id String @id
  // user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  note String // the owner User @relation(...)
}`);
    expect(m!.userRelations).toEqual([]);
  });

  it('reads a relation wrapped over several lines and an optional or list User', () => {
    const models = parseSchema(`
model Wrapped {
  id String @id
  author User? @relation(
    fields: [authorId],
    references: [id],
    onDelete: SetNull
  )
}
model Many {
  id String @id
  users User[] @relation("A")
}`);
    expect(models[0]!.userRelations).toEqual([
      {
        target: 'User',
        onDelete: 'SetNull',
      },
    ]);
    expect(models[1]!.userRelations).toEqual([
      {
        target: 'User',
        onDelete: null,
      },
    ]);
  });

  it('does not count a field that is only typed like a User model name', () => {
    const [m] = parseSchema(`
model Other {
  id String @id
  profile UserProfile @relation(fields: [pid], references: [id])
}`);
    expect(m!.userRelations).toEqual([]);
  });
});

describe('erasure coverage of the schema', () => {
  it('finds the member-referencing models (a parse that found few would make every check vacuous)', () => {
    expect(memberModels.length).toBeGreaterThan(300);
    expect(memberModels.map((m) => m.name)).toEqual(expect.arrayContaining(['Notification', 'ReadingHighlight']));
  });

  it('classifies every model that has a User relation', () => {
    const missing = memberModels.map((m) => m.name).filter((n) => !(n in ERASURE_REGISTRY));
    expect(missing, `no ERASURE_REGISTRY entry for: ${missing.join(', ')}`).toEqual([]);
  });

  it('has no entry for a model that no longer exists', () => {
    const gone = Object.keys(ERASURE_REGISTRY).filter((n) => !modelNames.has(n));
    expect(gone, `ERASURE_REGISTRY names models that are not in the schema: ${gone.join(', ')}`).toEqual([]);
  });

  it('has no entry for a model without a User relation', () => {
    const names = new Set(memberModels.map((m) => m.name));
    const extra = Object.keys(ERASURE_REGISTRY).filter((n) => !names.has(n));
    expect(extra, `entries without a User relation: ${extra.join(', ')}`).toEqual([]);
  });

  it('gives every decision a known value and every entry a reason', () => {
    const decisions = ['erase', 'deidentify', 'cascade', 'keep', 'owner', 'todo'];
    for (const [name, e] of Object.entries(ERASURE_REGISTRY)) {
      expect(decisions, name).toContain(e.decision);
      expect(e.reason.trim().length, `${name} needs a reason`).toBeGreaterThan(10);
    }
  });

  it('records an erase on every `erase` model in anonymizeAccount', async () => {
    const ops = await recordAnonymize();
    for (const [name, e] of Object.entries(ERASURE_REGISTRY)) {
      if (e.decision !== 'erase') continue;
      const got = methodsOn(ops, name);
      expect(
        ERASING.some((m) => got.has(m)),
        `${name} is 'erase' but anonymizeAccount records no deleteMany or delete on it`,
      ).toBe(true);
    }
  });

  it('records an update on every `deidentify` model in anonymizeAccount', async () => {
    const ops = await recordAnonymize();
    for (const [name, e] of Object.entries(ERASURE_REGISTRY)) {
      if (e.decision !== 'deidentify') continue;
      const got = methodsOn(ops, name);
      expect(
        UPDATING.some((m) => got.has(m)),
        `${name} is 'deidentify' but anonymizeAccount records no updateMany or update on it`,
      ).toBe(true);
    }
  });

  it('touches no keep, todo or cascade model in anonymizeAccount', async () => {
    const ops = await recordAnonymize();
    for (const [name, e] of Object.entries(ERASURE_REGISTRY)) {
      if (['keep', 'todo', 'cascade'].includes(e.decision)) {
        expect(methodsOn(ops, name).size, `${name} is '${e.decision}' but anonymizeAccount touches it`).toBe(0);
      }
    }
  });

  it('only lets a cascade entry name an erased parent that its rows really cascade from', () => {
    for (const [name, e] of Object.entries(ERASURE_REGISTRY)) {
      if (e.decision !== 'cascade') continue;
      expect(e.parent, `${name} needs a parent`).toBeTruthy();
      const parent = ERASURE_REGISTRY[e.parent!];
      expect(parent?.decision, `${name}'s parent ${e.parent} must be an erase entry`).toBe('erase');
      expect(parent?.scope, `${name}'s parent ${e.parent} must erase every row, not a scope`).toBeUndefined();
      const model = allModels.find((m) => m.name === name)!;
      expect(
        model.userRelations.every((r) => r.onDelete === 'Cascade'),
        `${name}'s relation to User must be onDelete: Cascade`,
      ).toBe(true);
      expect(
        model.relations.some((r) => r.target === e.parent && r.onDelete === 'Cascade'),
        `${name} must have an onDelete: Cascade relation to ${e.parent}`,
      ).toBe(true);
    }
  });

  it('keeps scope and parent on the decisions they belong to', () => {
    for (const [name, e] of Object.entries(ERASURE_REGISTRY)) {
      if (e.scope !== undefined) expect(e.decision, `${name}.scope`).toBe('erase');
      if (e.parent !== undefined) expect(e.decision, `${name}.parent`).toBe('cascade');
    }
  });

  it('holds the todo count to the ceiling (it may fall, never rise)', () => {
    const todo = Object.values(ERASURE_REGISTRY).filter((e) => e.decision === 'todo').length;
    expect(
      todo,
      `${todo} todo entries, ceiling ${TODO_CEILING}: classify the new model instead of deferring it`,
    ).toBeLessThanOrEqual(TODO_CEILING);
    // The ceiling is also kept honest: lowering the count without lowering it leaves room for a new todo.
    expect(TODO_CEILING, 'lower TODO_CEILING to the current count').toBe(todo);
  });
});

describe('docs/account-deletion.md', () => {
  const page = readFileSync(join(process.cwd(), 'docs/account-deletion.md'), 'utf8');
  const sections: Record<string, string> = {};
  for (const part of page.split(/^## /m).slice(1)) {
    sections[part.slice(0, part.indexOf('\n')).trim()] = part;
  }
  const heading = (decision: string) =>
    decision === 'keep'
      ? 'Kept on purpose'
      : decision === 'owner'
        ? 'Owner decision'
        : decision === 'todo'
          ? 'TODO'
          : 'Erased';

  it('lists every registry model under its group heading with its decision', () => {
    for (const [name, e] of Object.entries(ERASURE_REGISTRY)) {
      const section = sections[heading(e.decision)];
      expect(section, `no "## ${heading(e.decision)}" section`).toBeDefined();
      expect(section, `${name} is not listed under "${heading(e.decision)}"`).toContain(
        `| \`${name}\` | ${e.decision} |`,
      );
    }
  });

  it('lists nothing that is not in the registry', () => {
    const listed = [...page.matchAll(/^\| `(\w+)` \| (\w+) \|/gm)].map((m) => m[1]!);
    for (const name of listed)
      expect(ERASURE_REGISTRY, `${name} is listed but not in the registry`).toHaveProperty(name);
    expect(new Set(listed).size).toBe(Object.keys(ERASURE_REGISTRY).length);
  });
});
