/** Contracts for /api/moderation/{report,block,mute} (redesign audit C1). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { ReportInput } from '@/lib/moderation/report-schema';

export const reportContentApi =
  endpoint<{
    body: ReportInput;
    res: {
      success: true;
      alreadyReported?: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/moderation/report',
    },
  );

/** The ids the caller has blocked, newest first. */
export const listBlockedUsersApi =
  endpoint<{
    res: {
      blocked: string[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/moderation/block',
    },
  );

export const toggleBlockApi =
  endpoint<{
    body: {
      targetUserId: string;
    };
    res: {
      success: true;
      blocked: boolean;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/moderation/block',
    },
  );

export const toggleMuteApi =
  endpoint<{
    body: {
      targetUserId: string;
    };
    res: {
      success: true;
      muted: boolean;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/moderation/mute',
    },
  );
