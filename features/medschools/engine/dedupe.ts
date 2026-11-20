import { createHmac } from 'node:crypto';
import type { MedSource } from './types';

/** HMAC-SHA256 of `source:id`, so the raw source id is never stored. */
export function dedupeHash(
  secret: string,
  source: MedSource,
  id: string,
): string {
  if (
    secret.length <
    16
  ) {
    throw new Error(
      'MEDSCHOOLS_DEDUPE_SECRET must be at least 16 characters',
    );
  }
  return createHmac(
    'sha256',
    secret,
  )
    .update(
      `${source}:${id}`,
    )
    .digest(
      'hex',
    );
}
