/**
 * Client-only zod configuration. MUST be the first import of `app/client.tsx`:
 * zod decides whether an object schema may use its JIT fast path when the
 * schema is CONSTRUCTED, so the config has to exist before any schema module
 * evaluates.
 *
 * Production serves an enforced Content-Security-Policy with no
 * `'unsafe-eval'` (deploy/apache/rmhstudios.conf). zod v4 probes
 * `new Function('')` to see whether the JIT is allowed; the throw is swallowed
 * and it falls back to the interpreted parser, so nothing breaks - but the
 * browser still reports the probe as a `securitypolicyviolation` (and Firefox /
 * Chromium log "Evaluating a string as JavaScript violates ... unsafe-eval"
 * on every page that touches zod). Declaring `jitless` skips the probe: same
 * behaviour, no false alarm in the CSP report stream.
 */
import { z } from 'zod';

z.config({ jitless: true });
