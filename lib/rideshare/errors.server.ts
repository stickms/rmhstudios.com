/**
 * Maps an unexpected server error to a safe, actionable client message. Used by
 * the rideshare endpoints so failures point at the real cause (storage config,
 * missing migrations, …) instead of a blanket "Internal Server Error".
 */
export function diagnoseServerError(error: unknown): { status: number; error: string } {
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string })?.code;

  // Object storage not configured (S3_* env vars missing).
  const envMatch = msg.match(/Missing required env var (\w+)/);
  if (envMatch) {
    return {
      status: 503,
      error: `File storage isn’t configured on the server (missing ${envMatch[1]}). Set the S3_* environment variables, or it will fall back to local disk in development.`,
    };
  }

  // Prisma: table/relation not migrated yet (P2021), or missing column (P2022).
  if (code === 'P2021' || /relation "[^"]*" does not exist|table .* does not exist/i.test(msg)) {
    return {
      status: 503,
      error: 'The rideshare database tables aren’t set up yet. Run the migrations: `pnpm db:migrate:prod` (or `pnpm db:push`).',
    };
  }
  if (code === 'P2022' || /column .* does not exist/i.test(msg)) {
    return {
      status: 503,
      error: 'The rideshare database is missing a recent column. Run the latest migrations: `pnpm db:migrate:prod`.',
    };
  }

  return { status: 500, error: 'Internal Server Error' };
}
