/** Bundle entry for the generated body script (scripts/build-prepaint.ts). */
import { bodyStep } from './body';

try {
  bodyStep();
} catch {
  /* never block paint */
}
