/**
 * RmhTube — Per-Socket Rate Limiter
 * Delegates to the shared factory for consistent bounded-memory rate limiting.
 */
import { createRateLimiter } from '../shared/rate-limit';
import { config } from './config';

const limiter = createRateLimiter(config.SOCKET_RATE_LIMITS);

export const checkRateLimit = limiter.check;
export const cleanupRateLimits = limiter.cleanup;
