/**
 * Where focus goes in a sprint run, by the machine's state: Start before the run, the sheet during
 * it, the end action (Play again, Try again) once it can be pressed. While the result is saving,
 * Play again is disabled and cannot take focus, so focus waits (null) and moves when the save
 * answers.
 */
import type { SprintState } from '@/lib/rmhmusic/learn/sprint/machine';

export type SprintFocus =
  | 'start'
  | 'sheet'
  | 'end'
  | null;

export function focusOf(
  kind: SprintState['kind'],
): SprintFocus {
  switch (
    kind
  ) {
    case 'ready':
      return 'start';
    case 'countdown':
    case 'asking':
    case 'feedback':
      return 'sheet';
    case 'saving':
      return null;
    case 'complete':
    case 'saved':
    case 'failed':
    case 'signed-out':
      return 'end';
  }
}
