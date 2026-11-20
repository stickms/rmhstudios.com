/** Politeness and identity config for every external data source the RMH Med Schools scraper talks to. */
export const MEDSCHOOLS_USER_AGENT = 'RMHStudiosMedSchools/1.0 (+https://rmhstudios.com/rmh-medschool)';

export interface SourceConfig {
  origin: string;
  userAgent: string;
  /** Minimum gap between requests on the hourly job. */
  spacingMs: number;
  /** Minimum gap between requests while backfilling. */
  backfillSpacingMs: number;
  maxConsecutiveFailures: number;
  maxRetries: number;
  retryAfterCapMs: number;
  timeoutMs: number;
  /** Extra request headers sent with every request to this source. */
  headers?: Record<string, string>;
}

/** Path of the one GraphQL endpoint on the Admit API origin. */
export const ADMIT_GRAPHQL_PATH = '/graphql';

export const SOURCES: { CYCLETRACK: SourceConfig; ADMIT: SourceConfig } = {
  CYCLETRACK: {
    origin: 'https://cycletrack.org',
    userAgent: MEDSCHOOLS_USER_AGENT,
    spacingMs: 1000,
    backfillSpacingMs: 2000,
    maxConsecutiveFailures: 3,
    maxRetries: 3,
    retryAfterCapMs: 120_000,
    timeoutMs: 15_000,
  },
  ADMIT: {
    origin: 'https://api.admit.org',
    userAgent: MEDSCHOOLS_USER_AGENT,
    spacingMs: 1000,
    backfillSpacingMs: 2000,
    maxConsecutiveFailures: 3,
    maxRetries: 3,
    retryAfterCapMs: 120_000,
    timeoutMs: 15_000,
    headers: { origin: 'https://med.admit.org' },
  },
};
