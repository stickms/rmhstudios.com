import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * Coverage of account deletion over the models that hold a member's id in a plain column (sprint 14 18). The relation
 * registry's coverage test (`erasure-coverage.test.ts`) only sees models with a relation to `User`; this one parses
 * the same schema for the others. The schema is parsed with the schema-aware fakes' parser (`lib/db/query-shape.ts`).
 */

interface Op {
  model: string;
  method: string;
  args: unknown;
}

const prismaMock = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy({}, { get: (_t, method: string) => (args: unknown) => ({ model: name, method, args }) });
  return new Proxy({ $transaction: vi.fn(async (ops: unknown[]) => ops) } as Record<string, unknown>, {
    get: (t, key: string) => (key in t ? t[key] : model(key)),
  });
});
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

// The med schools pre-step runs its own transaction; this file records the erasure batch (see erasure-coverage.test.ts).
vi.mock('@features/medschools/api/share-sync.server', () => ({
  eraseSharedMedEvents: vi.fn(async () => ({ events: 0 })),
}));

import { anonymizeAccount } from '@/lib/account/deletion.server';
import { ERASURE_REGISTRY, MEMBER_COLUMN_PATTERN, PLAIN_MEMBER_COLUMNS } from '@/lib/account/erasure-registry';
import { parseSchemaSource } from '@/lib/db/query-shape';

// ── The scan ─────────────────────────────────────────────────────────────────────────────────────────────────────

type RawModel = ReturnType<typeof parseSchemaSource>['models'][number];

/** A model's `String` columns that mean "a member's id", for a model with no field typed `User`. */
function plainMemberColumns(models: readonly RawModel[]): Map<string, string[]> {
  const names = new Set(models.map((m) => m.name));
  const found = new Map<string, string[]>();
  for (const m of models) {
    if (m.name === 'User' || m.fields.some((f) => f.type === 'User')) continue;
    const cols = m.fields
      .filter((f) => f.type === 'String' && !f.list && !names.has(f.type) && MEMBER_COLUMN_PATTERN.test(f.name))
      .map((f) => f.name);
    if (cols.length > 0) found.set(m.name, cols);
  }
  return found;
}

/** What the coverage pass reports, one line per problem naming the model. */
function coverageProblems(
  scan: ReadonlyMap<string, string[]>,
  registry: Record<string, { columns: string[] }>,
): string[] {
  const problems: string[] = [];
  for (const [model, cols] of scan) {
    const entry = registry[model];
    if (!entry) {
      problems.push(`${model} has a plain member column (${cols.join(', ')}) and no PLAIN_MEMBER_COLUMNS entry`);
      continue;
    }
    const missing = cols.filter((c) => !entry.columns.includes(c));
    if (missing.length > 0) problems.push(`${model}: the entry does not name ${missing.join(', ')}`);
  }
  return problems;
}

function schemaFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return schemaFiles(path);
    return name.endsWith('.prisma') ? [path] : [];
  });
}

const allModels = schemaFiles(join(process.cwd(), 'prisma/schema')).flatMap(
  (f) => parseSchemaSource(readFileSync(f, 'utf8')).models,
);
const byName = new Map(allModels.map((m) => [m.name, m]));
const scan = plainMemberColumns(allModels);

/** The model's `@@map` table name. */
const tableOf = (m: RawModel) =>
  m.blockAttributes.map((a) => /^@@map\(\s*"([^"]+)"/.exec(a)?.[1]).find((x): x is string => !!x);

/** The 37 models of the specification's two tables: the scan's floor, so a broken parser fails loudly. */
const SPECIFIED = [
  'SecurityReport',
  'CommunityMemberEvent',
  'CommunityMemberNote',
  'CommunityModAction',
  'TournamentPayout',
  'AccountErasureAttempt',
  'ReleaseNote',
  'DiscordAlexCaretaker',
  'DiscordChatSession',
  'DoctrineIncident',
  'DoctrineSafehouseContent',
  'EventUpdate',
  'RMHboxMatch',
  'RMHboxMatchPlayer',
  'SSLobby',
  'SSLobbyMember',
  'SSPlayerMatch',
  'BlogPostRevision',
  'ReadingHighlightPassage',
  'ChatRemoval',
  'LadderWorkerLease',
  'RmhStudySession',
  'RmhTubeChatMessage',
  'RmhTypeMatch',
  'RmhTypeMatchPlayer',
  'PostLifecycle',
  'StudioProjectRevision',
  'StudioProjectShareOpen',
  'FollowEvent',
  'CommunityChallenge',
  'CommunityCensus',
  'ModMacro',
  'TargetedNotice',
  'CommunityGoal',
  'EventOccurrenceOverride',
  'CanvasEvent',
  'StudioChallenge',
];

// ── The recorded run ─────────────────────────────────────────────────────────────────────────────────────────────

async function recordAnonymize(): Promise<Op[]> {
  const fn = prismaMock.$transaction as ReturnType<typeof vi.fn>;
  fn.mockClear();
  await anonymizeAccount('user-1');
  return fn.mock.calls[0]![0] as Op[];
}
const accessor = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);
const methodsOn = (ops: Op[], model: string) =>
  new Set(ops.filter((o) => o.model === accessor(model)).map((o) => o.method));
const ERASING = ['deleteMany', 'delete'];
const UPDATING = ['updateMany', 'update'];

describe('the plain-column scan', () => {
  it('finds every model of the specification (a parse that found few would make every check vacuous)', () => {
    expect(scan.size).toBeGreaterThanOrEqual(SPECIFIED.length);
    expect([...scan.keys()]).toEqual(expect.arrayContaining(SPECIFIED));
  });

  it('matches the names of both specification tables and nothing that is not a member column', () => {
    for (const name of [
      'userId',
      'authorId',
      'ownerId',
      'actorId',
      'reporterId',
      'creatorId',
      'createdById',
      'followerId',
      'followingId',
      'firstReporterId',
      'hostUserId',
      'winnerUserId',
      'targetUserId',
      'discordUserId',
      'updatedById',
      'invitedById',
      'hostId',
      'senderId',
      'recipientId',
      'referenceId',
    ]) {
      expect(MEMBER_COLUMN_PATTERN.test(name), name).toBe(true);
    }
    for (const name of ['id', 'userName', 'chatId', 'tournamentId', 'userIdHash', 'byUser']) {
      expect(MEMBER_COLUMN_PATTERN.test(name), name).toBe(false);
    }
  });

  it('fails a fixture model with a plain authorId column and no entry, naming the model', () => {
    const fixture = parseSchemaSource(`
model Poem {
  id       String @id
  authorId String
  title    String
  @@map("poem")
}
model Haiku {
  id          String @id
  createdById String?
}
model Sonnet {
  id       String @id
  authorId String
  author   User   @relation(fields: [authorId], references: [id])
}
model Limerick {
  id       String @id
  chatId   String
}`).models;
    const found = plainMemberColumns(fixture);
    expect([...found.keys()]).toEqual(['Poem', 'Haiku']);
    const problems = coverageProblems(found, PLAIN_MEMBER_COLUMNS);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('Poem');
    expect(problems[0]).toContain('authorId');
    expect(problems[1]).toContain('Haiku');
  });

  it('fails an entry that does not name every matching column of its model', () => {
    const problems = coverageProblems(new Map([['Poem', ['authorId', 'createdById']]]), {
      Poem: { columns: ['authorId'] },
    });
    expect(problems).toEqual(['Poem: the entry does not name createdById']);
  });
});

describe('PLAIN_MEMBER_COLUMNS', () => {
  it('classifies every model with a plain member column', () => {
    expect(coverageProblems(scan, PLAIN_MEMBER_COLUMNS)).toEqual([]);
  });

  it('has no entry for a model that no longer exists or that has a relation to User', () => {
    const gone = Object.keys(PLAIN_MEMBER_COLUMNS).filter((n) => !byName.has(n));
    expect(gone, `entries for models that are not in the schema: ${gone.join(', ')}`).toEqual([]);
    const related = Object.keys(PLAIN_MEMBER_COLUMNS).filter((n) => !scan.has(n));
    expect(
      related,
      `entries the scan does not find (a User relation, or no matching column): ${related.join(', ')}`,
    ).toEqual([]);
  });

  it('shares no model with the relation registry', () => {
    const both = Object.keys(PLAIN_MEMBER_COLUMNS).filter((n) => n in ERASURE_REGISTRY);
    expect(both).toEqual([]);
  });

  it('names columns the model has, as String columns', () => {
    for (const [name, e] of Object.entries(PLAIN_MEMBER_COLUMNS)) {
      expect(e.columns.length, `${name} needs at least one column`).toBeGreaterThan(0);
      for (const c of e.columns) {
        const f = byName.get(name)?.fields.find((x) => x.name === c);
        expect(f, `${name}.${c} is not a column of the model`).toBeDefined();
        expect(f!.type, `${name}.${c}`).toBe('String');
      }
    }
  });

  it('has no todo or owner entry, and gives every entry a reason', () => {
    const decisions = ['erase', 'deidentify', 'cascade', 'keep', 'not-member'];
    for (const [name, e] of Object.entries(PLAIN_MEMBER_COLUMNS)) {
      expect(decisions, name).toContain(e.decision);
      expect(e.reason.trim().length, `${name} needs a reason`).toBeGreaterThan(10);
    }
  });

  it('keeps scope, parent, also and raw on the decisions they belong to', () => {
    for (const [name, e] of Object.entries(PLAIN_MEMBER_COLUMNS)) {
      if (e.scope !== undefined) expect(e.decision, `${name}.scope`).toBe('erase');
      if (e.parent !== undefined) expect(e.decision, `${name}.parent`).toBe('cascade');
      if (e.also !== undefined) expect(e.decision, `${name}.also`).toBe('erase');
      if (e.raw !== undefined) expect(e.decision, `${name}.raw`).toBe('deidentify');
      if (e.decision === 'cascade') expect(e.parent, `${name} needs a parent`).toBeTruthy();
    }
  });

  it('records an erase on every `erase` model in anonymizeAccount', async () => {
    const ops = await recordAnonymize();
    for (const [name, e] of Object.entries(PLAIN_MEMBER_COLUMNS)) {
      if (e.decision !== 'erase') continue;
      expect(
        ERASING.some((m) => methodsOn(ops, name).has(m)),
        `${name} is 'erase' but anonymizeAccount records no deleteMany or delete on it`,
      ).toBe(true);
      if (e.also === 'deidentify')
        expect(
          UPDATING.some((m) => methodsOn(ops, name).has(m)),
          `${name} also de-identifies but anonymizeAccount records no updateMany or update on it`,
        ).toBe(true);
    }
  });

  it('records an update on every `deidentify` model in anonymizeAccount (a Prisma operation, or the raw SQL it names)', async () => {
    const ops = await recordAnonymize();
    for (const [name, e] of Object.entries(PLAIN_MEMBER_COLUMNS)) {
      if (e.decision !== 'deidentify') continue;
      if (!e.raw) {
        expect(
          UPDATING.some((m) => methodsOn(ops, name).has(m)),
          `${name} is 'deidentify' but anonymizeAccount records no updateMany or update on it`,
        ).toBe(true);
        continue;
      }
      // Raw SQL cannot be recorded (the stub has no `$executeRaw`): hold the statement in its source, on the real table.
      expect(tableOf(byName.get(name)!), `${name}: raw.table is not the model's @@map`).toBe(e.raw.table);
      const source = readFileSync(join(process.cwd(), e.raw.file), 'utf8');
      for (const c of e.columns) {
        expect(
          new RegExp(`UPDATE "${e.raw.table}" SET[^\`]*"${c}"`).test(source),
          `${name}: ${e.raw.file} has no UPDATE "${e.raw.table}" that sets "${c}"`,
        ).toBe(true);
      }
    }
  });

  it('touches no keep, cascade or not-member model in anonymizeAccount', async () => {
    const ops = await recordAnonymize();
    for (const [name, e] of Object.entries(PLAIN_MEMBER_COLUMNS)) {
      if (['keep', 'cascade', 'not-member'].includes(e.decision)) {
        expect(methodsOn(ops, name).size, `${name} is '${e.decision}' but anonymizeAccount touches it`).toBe(0);
      }
    }
  });

  it('only lets a cascade entry name an erased parent that its rows really cascade from', () => {
    for (const [name, e] of Object.entries(PLAIN_MEMBER_COLUMNS)) {
      if (e.decision !== 'cascade') continue;
      expect(ERASURE_REGISTRY[e.parent!]?.decision, `${name}'s parent ${e.parent} must be an erase entry`).toBe(
        'erase',
      );
      const model = byName.get(name)!;
      const link = model.fields.find((f) => f.type === e.parent);
      expect(link, `${name} has no relation to ${e.parent}`).toBeDefined();
      expect(
        /onDelete:\s*Cascade/.test(model.fieldAttributes.get(link!.name) ?? ''),
        `${name}'s relation to ${e.parent} must be onDelete: Cascade`,
      ).toBe(true);
    }
  });

  it('writes no raw SQL inside the transaction that this registry decides (Prisma operations only)', async () => {
    const ops = await recordAnonymize();
    for (const o of ops) {
      expect(typeof o.method, JSON.stringify(o)).toBe('string');
      expect(o.model.startsWith('$'), `${o.model}.${o.method} is raw SQL inside the transaction`).toBe(false);
    }
  });
});

describe('docs/account-deletion.md (plain member columns)', () => {
  const page = readFileSync(join(process.cwd(), 'docs/account-deletion.md'), 'utf8');
  const section = page.split(/^## /m).find((p) => p.startsWith('Plain member columns')) ?? '';

  it('has a section that lists every plain-column model with its columns and decision', () => {
    expect(section, 'no "## Plain member columns" section').not.toBe('');
    for (const [name, e] of Object.entries(PLAIN_MEMBER_COLUMNS)) {
      const cols = e.columns.map((c) => `\`${c}\``).join(', ');
      const decision = e.also ? `${e.decision} and ${e.also}` : e.decision;
      expect(section, `${name} is not listed`).toContain(`| \`${name}\` | ${cols} | ${decision} |`);
    }
  });

  it('lists nothing that is not in the registry', () => {
    const listed = [...section.matchAll(/^\| `(\w+)` \|/gm)].map((m) => m[1]!);
    for (const name of listed)
      expect(PLAIN_MEMBER_COLUMNS, `${name} is listed but not in the registry`).toHaveProperty(name);
    expect(new Set(listed).size).toBe(Object.keys(PLAIN_MEMBER_COLUMNS).length);
  });
});
