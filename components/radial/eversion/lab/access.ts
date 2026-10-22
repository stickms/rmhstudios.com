/**
 * Who may open the eversion harness (`/eversion-lab`, T26).
 *
 * Admins only. The single exception is a developer's own machine: outside a
 * production build, `EVERSION_LAB_OPEN=1` skips the session check so the e2e
 * (`testing/e2e/eversion-lab.mjs`) can drive the route without a database or a
 * seeded admin. In production the flag is ignored whatever the environment
 * says, so it cannot open the route to the public by misconfiguration.
 *
 * Pure so it can be tested; the route's `beforeLoad` server function supplies
 * the real inputs.
 */
export function labAccessAllowed(input: {
  nodeEnv: string | undefined;
  openFlag: string | undefined;
  isAdmin: boolean;
}): boolean {
  if (input.nodeEnv !== 'production' && input.openFlag === '1') return true;
  return input.isAdmin;
}
