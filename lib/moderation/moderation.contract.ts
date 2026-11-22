/** Contracts for /api/moderation/{report,block,mute} (redesign audit C1). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { ReportInput } from '@/lib/moderation/report-schema';

export const reportContentApi = endpoint<{
  body: ReportInput;
  res: {
    success: true;
    alreadyReported?: true;
  };
}>()({
  method: 'POST',
  path: '/api/moderation/report',
});

/** The ids the caller has blocked, newest first. */
export const listBlockedUsersApi = endpoint<{
  res: {
    blocked: string[];
  };
}>()({
  method: 'GET',
  path: '/api/moderation/block',
});

export const toggleBlockApi = endpoint<{
  body: {
    targetUserId: string;
    /** Explicit intent (s05-14): true blocks, false unblocks, absent flips the current state. */
    block?: boolean | undefined;
  };
  res: {
    success: true;
    blocked: boolean;
  };
}>()({
  method: 'POST',
  path: '/api/moderation/block',
});

export const toggleMuteApi = endpoint<{
  body: {
    targetUserId: string;
    /** Explicit intent (s05-14): true mutes, false unmutes, absent flips the current state. */
    mute?: boolean | undefined;
    /**
     * How long the mute lasts (s10-10). Absent means until the member unmutes. On an account that is already muted it
     * changes the end ("Extend"). The end is worked out on the server.
     */
    duration?: 'day' | 'week' | 'month' | 'forever' | undefined;
  };
  res: {
    success: true;
    muted: boolean;
    /** ISO end of a timed mute that is now in force; null when it has none or the account is not muted. */
    expiresAt?: string | null | undefined;
  };
}>()({
  method: 'POST',
  path: '/api/moderation/mute',
});
