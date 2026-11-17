/**
 * What the production dependency audit blocks on (scripts/ci/audit-prod.ts).
 *
 * The audit runs on every push to main, inside the deploy gate. An advisory can
 * be published at any moment, so a gate that blocks on every high finding
 * stops deploys that have nothing to do with it. On 2026-11-17 GHSA-fc5q-39xc-vjpf
 * (picomatch, reached through @tanstack/react-start's route generator) blocked
 * the deploy of an unrelated merge while no fixed picomatch existed at all:
 * there was nothing a pull request could change to get past it.
 *
 * So, for high and critical advisories in production dependencies:
 *   - a fix exists (a patched version is published): BLOCK. Upgrade or add a
 *     pnpm override; that is the action, and it is always available.
 *   - no fix exists yet: WARN, loudly, on every run. The moment a fix is
 *     published the same advisory becomes a block, so it cannot be forgotten.
 *   - listed in .github/audit-allowlist.json with a reason and an expiry (a fix
 *     exists but the vulnerable code is not reachable here): WARN until the
 *     expiry date, then BLOCK so the entry is reviewed again.
 * Moderate and low are reported by `pnpm audit` itself and do not gate.
 */

export interface Advisory {
  ghsa: string;
  module: string;
  severity: string;
  title: string;
  vulnerable: string;
  patched: string;
  url: string;
  paths: string[];
}

export interface AllowEntry {
  ghsa: string;
  reason: string;
  /** YYYY-MM-DD; the entry stops applying after this day. */
  expires: string;
}

export type Verdict =
  | {
      kind: 'block';
      advisory: Advisory;
      why: string;
    }
  | {
      kind: 'warn';
      advisory: Advisory;
      why: string;
    };

const GATED =
  new Set(
    [
      'high',
      'critical',
    ],
  );

/** pnpm writes "<0.0.0" (or nothing) when no fixed version has been published. */
export function hasFix(
  patched: string,
): boolean {
  const p =
    patched.trim();
  return (
    p !==
      '' &&
    p !==
      '<0.0.0'
  );
}

/** Read the advisories out of `pnpm audit --json` (npm v6 report shape). */
export function parseAudit(
  json: unknown,
): Advisory[] {
  if (
    !json ||
    typeof json !==
      'object' ||
    !(
      'advisories' in
      json
    )
  ) {
    throw new Error(
      'pnpm audit --json produced no advisories object',
    );
  }
  const advisories =
    (
      json as {
        advisories: Record<
          string,
          Record<
            string,
            unknown
          >
        >;
      }
    )
      .advisories;
  return Object.values(
    advisories,
  ).map(
    (
      a,
    ) => ({
      ghsa: String(
        a.github_advisory_id ??
          a.id ??
          '',
      ),
      module:
        String(
          a.module_name ??
            '',
        ),
      severity:
        String(
          a.severity ??
            '',
        ),
      title:
        String(
          a.title ??
            '',
        ),
      vulnerable:
        String(
          a.vulnerable_versions ??
            '',
        ),
      patched:
        String(
          a.patched_versions ??
            '',
        ),
      url: String(
        a.url ??
          '',
      ),
      paths:
        (
          (a.findings as
            | {
                paths?: string[];
              }[]
            | undefined) ??
          []
        ).flatMap(
          (
            f,
          ) =>
            f.paths ??
            [],
        ),
    }),
  );
}

/** Malformed allowlist entries are errors, not silently ignored. */
export function checkAllowlist(
  entries: unknown,
): AllowEntry[] {
  if (
    !Array.isArray(
      entries,
    )
  )
    throw new Error(
      'audit allowlist must be a JSON array',
    );
  return entries.map(
    (
      e,
      i,
    ) => {
      const entry =
        e as Partial<AllowEntry>;
      if (
        typeof entry.ghsa !==
          'string' ||
        !/^GHSA-[\w-]+$/.test(
          entry.ghsa,
        ) ||
        typeof entry.reason !==
          'string' ||
        entry.reason.trim()
          .length <
          20 ||
        typeof entry.expires !==
          'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(
          entry.expires,
        )
      ) {
        throw new Error(
          `audit allowlist entry ${i} needs { ghsa: "GHSA-…", reason: "why it is not reachable here", expires: "YYYY-MM-DD" }`,
        );
      }
      return entry as AllowEntry;
    },
  );
}

export function judge(
  advisories: Advisory[],
  allowlist: AllowEntry[],
  today: string,
): Verdict[] {
  const verdicts: Verdict[] =
    [];
  for (const advisory of advisories) {
    if (
      !GATED.has(
        advisory.severity,
      )
    )
      continue;
    const allowed =
      allowlist.find(
        (
          e,
        ) =>
          e.ghsa ===
          advisory.ghsa,
      );
    if (
      allowed &&
      allowed.expires >=
        today
    ) {
      verdicts.push(
        {
          kind: 'warn',
          advisory,
          why: `allowlisted until ${allowed.expires}: ${allowed.reason}`,
        },
      );
    } else if (
      allowed
    ) {
      verdicts.push(
        {
          kind: 'block',
          advisory,
          why: `allowlist entry expired ${allowed.expires}; review it again (fix: ${advisory.patched})`,
        },
      );
    } else if (
      !hasFix(
        advisory.patched,
      )
    ) {
      verdicts.push(
        {
          kind: 'warn',
          advisory,
          why: 'no fixed version is published yet; this becomes a block as soon as one is',
        },
      );
    } else {
      verdicts.push(
        {
          kind: 'block',
          advisory,
          why: `fixed in ${advisory.patched}: upgrade, or add a pnpm override in package.json`,
        },
      );
    }
  }
  return verdicts;
}
