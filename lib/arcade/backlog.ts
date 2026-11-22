export const PLAY_STATUSES = ['want', 'playing', 'finished', 'completed', 'dropped'] as const;
export type PlayStatus = (typeof PLAY_STATUSES)[number];
/** Statuses that may carry a completion time. */
export const FINISH_STATUSES: readonly PlayStatus[] = ['finished', 'completed'];
