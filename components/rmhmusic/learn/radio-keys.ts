/**
 * The Sound dialog's radio-group keyboard (WAI-ARIA radio group, plan §4), pure so it is a unit
 * test: the arrow keys (and Home / End) move focus between the rows, wrapping; Space or Enter picks
 * the focused row. Moving does not pick: picking a sound loads its samples and plays it, which
 * should take a deliberate key, not every arrow press. Any other key is left to the browser.
 */
export type RadioKeyAction =
  | {
      kind: 'move';
      index: number;
    }
  | {
      kind: 'select';
    };

export function radioKey(
  key: string,
  index: number,
  count: number,
): RadioKeyAction | null {
  if (
    count <=
    0
  )
    return null;
  switch (
    key
  ) {
    case 'ArrowDown':
    case 'ArrowRight':
      return {
        kind: 'move',
        index:
          (index +
            1) %
          count,
      };
    case 'ArrowUp':
    case 'ArrowLeft':
      return {
        kind: 'move',
        index:
          (index -
            1 +
            count) %
          count,
      };
    case 'Home':
      return {
        kind: 'move',
        index: 0,
      };
    case 'End':
      return {
        kind: 'move',
        index:
          count -
          1,
      };
    case ' ':
    case 'Enter':
      return {
        kind: 'select',
      };
    default:
      return null;
  }
}
