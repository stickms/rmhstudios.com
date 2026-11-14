/**
 * Contracts for the /api/calls/** preference and credential endpoints
 * (redesign audit C1, batch 7): how calls are answered, who may ring, muted
 * callers and short-lived ICE credentials. Client-safe: every type is
 * `import type`.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { CallAnswerMode } from '@/lib/call/answer';
import type { IceServer } from '@/lib/call/ice';

export const getCallAnswerApi =
  endpoint<{
    res: {
      mode: CallAnswerMode;
      note: string;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/calls/answer',
    },
  );

/** Saves the mode, and the busy note when given (the note is normalised server-side). */
export const setCallAnswerApi =
  endpoint<{
    body: {
      mode: CallAnswerMode;
      note?:
        | string
        | undefined;
    };
    res: {
      mode: CallAnswerMode;
      note?: string;
    };
  }>()(
    {
      method:
        'PUT',
      path: '/api/calls/answer',
    },
  );

export const getCallPrivacyApi =
  endpoint<{
    res: {
      callPrivacy: string;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/calls/privacy',
    },
  );

export const setCallPrivacyApi =
  endpoint<{
    body: {
      callPrivacy: string;
    };
    res: {
      callPrivacy: string;
    };
  }>()(
    {
      method:
        'PUT',
      path: '/api/calls/privacy',
    },
  );

export interface ActiveCallMute {
  until: string;
  user: {
    id: string;
    name:
      | string
      | null;
    handle:
      | string
      | null;
  };
}

/** Active (unexpired) mutes only. */
export const listCallMutesApi =
  endpoint<{
    res: {
      mutes: ActiveCallMute[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/calls/mute',
    },
  );

export const unmuteCallerApi =
  endpoint<{
    body: {
      targetUserId: string;
    };
    res: {
      muted: false;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/calls/mute',
    },
  );

/** Short-lived relay credentials; STUN-only when no relay is configured. */
export const getCallIceApi =
  endpoint<{
    res: {
      iceServers: IceServer[];
      relayAvailable: boolean;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/calls/ice',
    },
  );
