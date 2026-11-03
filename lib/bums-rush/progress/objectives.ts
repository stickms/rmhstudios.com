/**
 * `LevelResult.objectiveIds` (strings) → the stored objective bitmask.
 *
 * The bit position is the objective's index in the level's AUTHORED order, so
 * the client (which records a solo clear) and the server (which validates it)
 * must use the same rule. Pure and client-safe; both sides import it from here.
 */
export function objectiveIdsToBitmask(
  objectiveIds: readonly string[],
  objectives: readonly { id: string }[],
): number {
  let mask = 0;
  objectives.forEach((objective, index) => {
    if (objectiveIds.includes(objective.id)) mask |= 1 << index;
  });
  return mask;
}
