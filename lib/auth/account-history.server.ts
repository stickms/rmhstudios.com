/**
 * Does an account have any history? Used only by the empty-account merge
 * (`consolidation.server.ts`): an account may be folded into another and then
 * deleted only when deleting it loses nothing.
 *
 * The list of places to look is read from the database itself: every foreign
 * key that points at `user(id)`. A hand-kept list of "activity tables" would be
 * out of date the day someone adds a game; the catalogue cannot be. Anything a
 * user has done that is stored against their id is in one of those tables.
 *
 * Fail closed: if the check cannot finish (statement timeout, any error), the
 * caller treats the account as having history.
 */
import { prisma } from '@/lib/prisma.server';

/**
 * Tables whose rows a new account gets without doing anything, or that the
 * merge itself handles:
 *  - `account`, `passkey`: the sign-in methods. They are what moves.
 *  - `session`: ended when the merge starts; deleted with the account.
 * Measured against a real sign-up (email and provider) followed by a visit to
 * the home page, settings and `/account/connect`; see the design doc.
 */
export const EMPTY_ACCOUNT_ALLOWED_TABLES: ReadonlySet<string> =
  new Set(
    [
      'account',
      'passkey',
      'session',
    ],
  );

/** One statement checks every table; this bounds it on a large database. */
const CHECK_TIMEOUT_MS = 5_000;

interface UserReference {
  /** Quoted, schema-qualified table name, safe to splice into SQL. */
  table: string;
  /** Quoted column name, safe to splice into SQL. */
  column: string;
  /** Bare table name, for the allowlist and for reporting. */
  name: string;
  /** Whether an index leads with this column (a cheap lookup). */
  indexed: boolean;
}

let referencesPromise: Promise<
  UserReference[]
> | null =
  null;

/**
 * Every single-column foreign key to `user(id)`. Read once per process: the
 * schema only changes with a deploy, which restarts the process.
 */
function userReferences(): Promise<
  UserReference[]
> {
  referencesPromise ??=
    prisma.$queryRaw<
      UserReference[]
    >`
      SELECT quote_ident(ns.nspname) || '.' || quote_ident(cl.relname) AS "table",
             quote_ident(att.attname) AS "column",
             cl.relname AS "name",
             EXISTS (
               SELECT 1 FROM pg_index ix
                WHERE ix.indrelid = con.conrelid AND ix.indkey[0] = con.conkey[1]
             ) AS "indexed"
        FROM pg_constraint con
        JOIN pg_class cl ON cl.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
       WHERE con.contype = 'f'
         AND con.confrelid = 'public."user"'::regclass
         AND array_length(con.conkey, 1) = 1
       ORDER BY 4 DESC, 1, 2`.catch(
      (
        error: unknown,
      ) => {
        referencesPromise =
          null;
        throw error;
      },
    );
  return referencesPromise;
}

/**
 * A table (outside the allowlist) that holds rows for this user, as a one-item
 * array, or an empty array when the account has no history. `null` means the
 * check did not finish, which callers must treat as "has history".
 *
 * It stops at the first table with a row, and the indexed columns come first,
 * so an account with history (nearly every account that opens Settings) costs a
 * handful of index lookups; only a genuinely empty account reads every table.
 */
export async function findAccountHistory(
  userId: string,
): Promise<
  | string[]
  | null
> {
  try {
    const refs =
      (
        await userReferences()
      ).filter(
        (
          r,
        ) =>
          !EMPTY_ACCOUNT_ALLOWED_TABLES.has(
            r.name,
          ),
      );
    if (
      refs.length ===
      0
    )
      return [];
    // Identifiers come from the catalogue above, already quoted by
    // quote_ident; the user id is the one bound parameter ($1).
    const sql = `SELECT i FROM (${refs
      .map(
        (
          r,
          i,
        ) =>
          `SELECT ${i} AS i WHERE EXISTS (SELECT 1 FROM ${r.table} WHERE ${r.column} = $1)`,
      )
      .join(
        ' UNION ALL ',
      )}) AS hit LIMIT 1`;
    const rows =
      await prisma.$transaction(
        async (
          tx,
        ) => {
          await tx.$executeRawUnsafe(
            `SET LOCAL statement_timeout = ${CHECK_TIMEOUT_MS}`,
          );
          return tx.$queryRawUnsafe<
            Array<{
              i: number;
            }>
          >(
            sql,
            userId,
          );
        },
      );
    return [
      ...new Set(
        rows.map(
          (
            row,
          ) =>
            refs[
              Number(
                row.i,
              )
            ]
              ?.name ??
            'unknown',
        ),
      ),
    ];
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          level:
            'error',
          event:
            'account.history_check_failed',
          message:
            error instanceof
            Error
              ? error.message
              : String(
                  error,
                ),
        },
      ),
    );
    return null;
  }
}
