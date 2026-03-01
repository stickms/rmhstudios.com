/**
 * RmhTube — Structured Logger
 * Delegates to the shared logger factory for consistent formatting.
 */
import { createLogger } from '../shared/logger';

export const logger = createLogger('rmhtube');
