/** Socket event names for host-set slow mode (S3). One trio per chat surface. */
export type SlowModeScope = 'tube' | 'music' | 'space';

export function slowModeEvents(scope: SlowModeScope) {
  return {
    SET: `safety:slowmode:${scope}:set`,
    STATE: `safety:slowmode:${scope}:state`,
    REJECTED: `safety:slowmode:${scope}:rejected`,
  } as const;
}

/** Cooldown choices offered to hosts (seconds). 0 = off. */
export const SLOW_MODE_CHOICES_S = [0, 5, 10, 30, 60, 300] as const;

export interface SlowModeStatePayload {
  roomId: string;
  cooldownMs: number;
  autoEngaged: boolean;
}
export interface SlowModeRejectedPayload {
  roomId: string;
  reason: 'cooldown' | 'new-account';
  retryInMs: number;
}
