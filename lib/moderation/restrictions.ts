/**
 * Per-feature timeouts — the client-safe half (ids, labels, the timeout
 * presets). The server half (`restrictions.server.ts`) reads and writes the
 * `FeatureRestriction` rows and is what every gated write path asks.
 *
 * A feature id is stored in the database, so ids are never renamed: add a new
 * one instead, and keep the old id here until no active row can carry it.
 */

export const RESTRICTABLE_FEATURES =
  [
    'post',
    'comment',
    'message',
    'community',
    'space',
    'vibe',
    'persona',
  ] as const;

export type RestrictableFeature =
  (typeof RESTRICTABLE_FEATURES)[number];

export function isRestrictableFeature(
  v: string,
): v is RestrictableFeature {
  return (
    RESTRICTABLE_FEATURES as readonly string[]
  ).includes(
    v,
  );
}

/**
 * English labels; the UI passes each through `t('restriction-feature-<id>', …)`.
 * Kept here so the server's refusal message and the admin page name a feature
 * the same way.
 */
export const FEATURE_LABELS: Record<
  RestrictableFeature,
  string
> =
  {
    post: 'Posting',
    comment:
      'Replying',
    message:
      'Direct messages',
    community:
      'Creating communities',
    space:
      'Hosting spaces',
    vibe: 'Building vibes',
    persona:
      'Creating personas',
  };

/** Timeout presets the admin dialog offers, in days; `null` is permanent. */
export const TIMEOUT_PRESETS: readonly (
  | number
  | null
)[] =
  [
    1,
    3,
    7,
    30,
    90,
    null,
  ];

/** A restriction as the admin page and the user's status page show it. */
export interface FeatureRestrictionView {
  id: string;
  feature: RestrictableFeature;
  reason: string;
  createdAt: string;
  /** null = permanent. */
  expiresAt:
    | string
    | null;
  liftedAt:
    | string
    | null;
  /** Still in force: not lifted and not expired. */
  active: boolean;
}
