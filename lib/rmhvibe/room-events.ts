/**
 * Vibe room events (Discord Activity): everyone in one Activity instance joins
 * one room on the games hub, the host picks the vibe, and multiplayer vibes
 * relay small messages. Client-safe; imported by the hub and the client.
 */

export const VIBE_ROOM_C2S =
  {
    JOIN: 'vibe:room:join',
    LEAVE:
      'vibe:room:leave',
    SELECT:
      'vibe:room:select',
    AWAY: 'vibe:room:away',
    ACTIVE:
      'vibe:room:active',
    SEND: 'vibe:room:send',
  } as const;

export const VIBE_ROOM_S2C =
  {
    STATE:
      'vibe:room:state',
    MESSAGE:
      'vibe:room:message',
    ERROR:
      'vibe:room:error',
  } as const;

export const VIBE_ROOM_LIMITS =
  {
    /** Members per room. */
    MAX_MEMBERS: 25,
    /** `JSON.stringify(data).length` of one relayed message. */
    MAX_MESSAGE_CHARS: 2048,
    INSTANCE_ID:
      /^[A-Za-z0-9_-]{1,64}$/,
  } as const;

export type VibeRoomErrorCode =
  | 'AUTH'
  | 'FULL'
  | 'NOT_HOST'
  | 'BAD_SLUG'
  | 'TOO_LARGE'
  | 'RATE';

export type VibeRoomMember =
  {
    sid: string;
    name: string;
    avatarUrl:
      | string
      | null;
    linked: boolean;
    away: boolean;
  };

export type VibeRoomState =
  {
    instanceId: string;
    slug:
      | string
      | null;
    hostSid:
      | string
      | null;
    members: VibeRoomMember[];
  };

export type VibeRoomMessage =
  {
    fromSid: string;
    data: unknown;
  };
