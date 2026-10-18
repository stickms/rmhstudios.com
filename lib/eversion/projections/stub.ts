/**
 * Builds a {@link Projection} whose every method throws "not implemented".
 *
 * The five projection files are owned by three different tasks (T04, T05, T06)
 * and each replaces its own file wholesale, so the stub shape lives here once
 * rather than being copied five times. This file is deleted by whichever task
 * lands the last projection (T06 in the plan's ordering, but any of them if the
 * order changes) — the contracts test then no longer needs it.
 */

import { notImplemented, type TaskId } from '../not-implemented';
import type { Projection, ProjectionId } from '../types';

export function stubProjection(id: ProjectionId, task: TaskId): Projection {
  return {
    id,
    fit: () => notImplemented(`${id}.fit`, task),
    forward: () => notImplemented(`${id}.forward`, task),
    extended: () => notImplemented(`${id}.extended`, task),
    inverse: () => notImplemented(`${id}.inverse`, task),
    singular: () => notImplemented(`${id}.singular`, task),
  };
}
