/**
 * A minimal Prisma `where` evaluator for tests: AND / OR / NOT, equality,
 * `in` / `notIn` / `not` / `lt` / `gt`, and one level of relation filter.
 * It lets a test assert on the ROWS a query would return rather than on the
 * shape of the query - which is what a visibility rule is actually about.
 */
export type Row = Record<string, unknown>;

/** Minimal Prisma `where` evaluator for the operators the timeline uses. */
export function evalWhere(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'AND') {
      const list = Array.isArray(cond) ? cond : [cond];
      if (!list.every((c) => evalWhere(row, c))) return false;
    } else if (key === 'OR') {
      if (!(cond as Row[]).some((c) => evalWhere(row, c))) return false;
    } else if (key === 'NOT') {
      if (evalWhere(row, cond as Row)) return false;
    } else if (cond && typeof cond === 'object' && 'isNot' in cond) {
      // Optional to-one relation: `isNot` also matches rows with no related record.
      const rel = row[key] as Row | null | undefined;
      if (rel && evalWhere(rel, (cond as { isNot: Row }).isNot)) return false;
    } else if (cond && typeof cond === 'object' && 'none' in cond) {
      const list = (row[key] as Row[] | undefined) ?? [];
      if (list.some((r) => evalWhere(r, (cond as { none: Row }).none))) return false;
    } else if (cond && typeof cond === 'object' && 'some' in cond) {
      const list = (row[key] as Row[] | undefined) ?? [];
      if (!list.some((r) => evalWhere(r, (cond as { some: Row }).some))) return false;
    } else if (key === 'rmhark' || key === 'user') {
      if (!evalWhere((row[key] ?? {}) as Row, cond as Row)) return false;
    } else if (!matchesField(row[key], cond)) {
      return false;
    }
  }
  return true;
}

function matchesField(value: unknown, cond: unknown): boolean {
  if (cond === null || typeof cond !== 'object' || cond instanceof Date) {
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
    return (value ?? null) === cond; // an absent field reads as NULL, as in SQL
  }
  for (const [op, arg] of Object.entries(cond)) {
    if (op === 'in' && !(arg as unknown[]).includes(value)) return false;
    if (op === 'notIn' && (arg as unknown[]).includes(value)) return false;
    if (op === 'not' && matchesField(value, arg)) return false;
    if (op === 'lt' && !((value as number) < (arg as number))) return false;
    if (op === 'gt' && !((value as number) > (arg as number))) return false;
  }
  return true;
}


/**
 * The viewer's graph, as the relation rows the exact audience predicate
 * (`audienceWhereExact`) joins through: attaches `user.followers`,
 * `user.closeFriendsOwned` and `user.creatorMemberships` to a post row so the
 * evaluator answers "does the viewer follow / sit in the circle of / support the
 * author" the way the database does.
 */
export function withAuthorGraph(
  post: Row,
  viewerId: string,
  graph: { following?: string[]; circles?: string[]; supported?: string[] },
): Row {
  const author = post.userId as string;
  const user = {
    followers: graph.following?.includes(author) ? [{ followerId: viewerId }] : [],
    closeFriendsOwned: graph.circles?.includes(author) ? [{ memberId: viewerId }] : [],
    creatorMemberships: graph.supported?.includes(author)
      ? [{ supporterId: viewerId, expiresAt: new Date(Date.now() + 86_400_000) }]
      : [],
  };
  return { ...post, user };
}
