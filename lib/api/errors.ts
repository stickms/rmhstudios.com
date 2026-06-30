/**
 * Stable error code catalog for the developer API.
 *
 * Every non-2xx response is `{ error: { type, code, message, request_id } }`.
 * `code` is the precise, machine-stable reason; `type` is the broad category a
 * client can branch on (mirrors the Stripe-style two-level taxonomy). This
 * module is pure so it can be unit-tested and reused by the OpenAPI generator.
 */

export type ApiErrorType =
  | 'invalid_request_error'
  | 'authentication_error'
  | 'authorization_error'
  | 'not_found_error'
  | 'conflict_error'
  | 'rate_limit_error'
  | 'api_error';

/** code → broad category. Unknown codes fall back to `api_error`. */
export const ERROR_TYPES: Record<string, ApiErrorType> = {
  invalid_request: 'invalid_request_error',
  invalid_media: 'invalid_request_error',
  payload_too_large: 'invalid_request_error',
  unprocessable: 'invalid_request_error',
  missing_key: 'authentication_error',
  invalid_key: 'authentication_error',
  key_expired: 'authentication_error',
  insufficient_scope: 'authorization_error',
  subscription_required: 'authorization_error',
  account_suspended: 'authorization_error',
  feature_not_available: 'authorization_error',
  forbidden: 'authorization_error',
  not_found: 'not_found_error',
  method_not_allowed: 'invalid_request_error',
  conflict: 'conflict_error',
  idempotency_conflict: 'conflict_error',
  rate_limited: 'rate_limit_error',
  quota_exceeded: 'rate_limit_error',
  internal_error: 'api_error',
};

/** Suggested HTTP status for a code (used when a caller doesn't override it). */
export const DEFAULT_STATUS: Record<string, number> = {
  invalid_request: 400,
  invalid_media: 400,
  unprocessable: 422,
  payload_too_large: 413,
  missing_key: 401,
  invalid_key: 401,
  key_expired: 401,
  insufficient_scope: 403,
  subscription_required: 403,
  account_suspended: 403,
  feature_not_available: 403,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  idempotency_conflict: 409,
  rate_limited: 429,
  quota_exceeded: 429,
  internal_error: 500,
};

export function errorType(code: string): ApiErrorType {
  return ERROR_TYPES[code] ?? 'api_error';
}

export function defaultStatus(code: string): number {
  return DEFAULT_STATUS[code] ?? 500;
}

/** Build the standardized error body. */
export function errorBody(code: string, message: string, requestId: string) {
  return { error: { type: errorType(code), code, message, request_id: requestId } };
}
