/**
 * A minimal Prisma `where` evaluator for tests: AND / OR / NOT, equality,
 * `in` / `notIn` / `not` / `lt` / `gt`, and one level of relation filter.
 * It lets a test assert on the ROWS a query would return rather than on the
 * shape of the query - which is what a visibility rule is actually about.
 */
export type Row = Record<string, any>;

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
    } else if (key === 'rmhark') {
      if (!evalWhere(row.rmhark, cond as Row)) return false;
    } else if (!matchesField(row[key], cond)) {
      return false;
    }
  }
  return true;
}

function matchesField(value: any, cond: any): boolean {
  if (cond === null || typeof cond !== 'object' || cond instanceof Date) {
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
    return value === cond;
  }
  for (const [op, arg] of Object.entries(cond)) {
    if (op === 'in' && !(arg as any[]).includes(value)) return false;
    if (op === 'notIn' && (arg as any[]).includes(value)) return false;
    if (op === 'not' && matchesField(value, arg)) return false;
    if (op === 'lt' && !(value < (arg as any))) return false;
    if (op === 'gt' && !(value > (arg as any))) return false;
  }
  return true;
}

