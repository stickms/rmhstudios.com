/**
 * Athora — Spatial Networking Platform
 * Shared type definitions used across client and server.
 */

// ─── Enums (mirroring Prisma) ────────────────────────────────────

export type AthoraAvailability =
  | "OPEN_TO_CHAT"
  | "BROWSING"
  | "IN_MEETING"
  | "PITCHING"
  | "DO_NOT_DISTURB"
  | "AFK";

export type AthoraDirection =
  | "NORTH"
  | "SOUTH"
  | "EAST"
  | "WEST"
  | "NORTHEAST"
  | "NORTHWEST"
  | "SOUTHEAST"
  | "SOUTHWEST";

export type AthoraRoomCategory =
  | "GENERAL"
  | "TECH"
  | "DESIGN"
  | "BUSINESS"
  | "HIRING"
  | "GAMING"
  | "MUSIC"
  | "ART"
  | "EDUCATION"
  | "LOCAL"
  | "SOCIAL"
  | "CUSTOM";

export type AthoraRoomTemplate =
  | "OPEN_FLOOR"
  | "CONFERENCE"
  | "TRADE_SHOW"
  | "LOUNGE"
  | "CLASSROOM"
  | "CUSTOM";

export type AthoraMessageType = "TEXT" | "IMAGE" | "LINK" | "EMOTE" | "SYSTEM";

export type AthoraStandMediaType = "IMAGE" | "VIDEO" | "IFRAME" | "PDF" | "LINK";

// ─── Shared Payloads ─────────────────────────────────────────────

export interface UserBrief {
  id: string;
  name: string;
  image: string | null;
}

export interface RoomConfig {
  id: string;
  name: string;
  mapWidth: number;
  mapHeight: number;
  template: AthoraRoomTemplate;
  tileMapData: unknown;
  backgroundUrl: string | null;
}

export interface RoomUserPayload extends UserBrief {
  avatarConfig: unknown;
  x: number;
  y: number;
  facing: AthoraDirection;
  availability: AthoraAvailability;
  interestTags: string[];
}

export interface RoomStatePayload {
  room: RoomConfig;
  users: RoomUserPayload[];
  stands: StandPayload[];
  conversations: ConversationPayload[];
  myPosition: { x: number; y: number };
}

export interface StandPayload {
  id: string;
  title: string;
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  posX: number;
  posY: number;
  width: number;
  height: number;
  tier: string;
  style: unknown;
  media: StandMediaPayload[];
  leadCaptureEnabled: boolean;
  queueEnabled: boolean;
}

export interface StandMediaPayload {
  id: string;
  type: AthoraStandMediaType;
  url: string;
  caption: string | null;
}

export interface ConversationPayload {
  id: string;
  topic: string | null;
  isOpen: boolean;
  anchorX: number;
  anchorY: number;
  members: UserBrief[];
}

export interface ProximityMsgPayload {
  id: string;
  senderId: string;
  senderName: string;
  senderImage: string | null;
  content: string;
  timestamp: string;
}

export interface ConversationMsgPayload extends ProximityMsgPayload {
  conversationId: string;
  type: AthoraMessageType;
}

export interface JoinRequestPayload {
  requestId: string;
  conversationId: string;
  requester: UserBrief;
  topic: string | null;
  message: string | null;
}

export interface QueueEntry {
  userId: string;
  name: string;
  position: number;
  status: string;
}

// ─── Socket Event Types ──────────────────────────────────────────

export interface AthoraClientToServerEvents {
  // Room
  "athora:room:join": (data: { roomId: string }) => void;
  "athora:room:leave": (data: { roomId: string }) => void;
  "athora:room:move": (data: {
    roomId: string;
    x: number;
    y: number;
    facing: AthoraDirection;
  }) => void;
  "athora:room:status": (data: { availability: AthoraAvailability }) => void;

  // Chat
  "athora:chat:proximity": (data: { roomId: string; content: string }) => void;
  "athora:chat:conversation": (data: {
    conversationId: string;
    content: string;
    type?: AthoraMessageType;
  }) => void;
  "athora:chat:typing": (data: {
    conversationId?: string;
    roomId?: string;
  }) => void;

  // Conversation bubbles
  "athora:conversation:create": (data: {
    roomId: string;
    topic?: string;
    isOpen?: boolean;
    targetUserId?: string;
  }) => void;
  "athora:conversation:invite": (data: {
    conversationId: string;
    userId: string;
  }) => void;
  "athora:conversation:request": (data: {
    conversationId: string;
    message?: string;
  }) => void;
  "athora:conversation:respond": (data: {
    requestId: string;
    accept: boolean;
  }) => void;
  "athora:conversation:leave": (data: { conversationId: string }) => void;

  // Stands
  "athora:stand:visit": (data: { standId: string }) => void;
  "athora:stand:leave": (data: { standId: string }) => void;
  "athora:stand:queue:join": (data: { standId: string }) => void;
  "athora:stand:queue:leave": (data: { standId: string }) => void;
}

export interface AthoraServerToClientEvents {
  // Room
  "athora:room:user_joined": (data: RoomUserPayload) => void;
  "athora:room:user_left": (data: { userId: string }) => void;
  "athora:room:user_moved": (data: {
    userId: string;
    x: number;
    y: number;
    facing: AthoraDirection;
  }) => void;
  "athora:room:user_status": (data: {
    userId: string;
    availability: AthoraAvailability;
  }) => void;
  "athora:room:state": (data: RoomStatePayload) => void;

  // Chat
  "athora:chat:proximity_msg": (data: ProximityMsgPayload) => void;
  "athora:chat:conversation_msg": (data: ConversationMsgPayload) => void;
  "athora:chat:typing": (data: {
    userId: string;
    conversationId?: string;
  }) => void;

  // Conversations
  "athora:conversation:created": (data: ConversationPayload) => void;
  "athora:conversation:user_joined": (data: {
    conversationId: string;
    user: UserBrief;
  }) => void;
  "athora:conversation:user_left": (data: {
    conversationId: string;
    userId: string;
  }) => void;
  "athora:conversation:request_received": (
    data: JoinRequestPayload
  ) => void;
  "athora:conversation:request_response": (data: {
    requestId: string;
    accepted: boolean;
  }) => void;
  "athora:conversation:ended": (data: { conversationId: string }) => void;

  // Stands
  "athora:stand:visitor_count": (data: {
    standId: string;
    count: number;
  }) => void;
  "athora:stand:queue_update": (data: {
    standId: string;
    queue: QueueEntry[];
  }) => void;

  // Errors
  "athora:error": (data: { code: string; message: string }) => void;
}

// ─── Map Types ───────────────────────────────────────────────────

export interface MapRoom {
  id: string;
  name: string;
  slug: string;
  latitude: number;
  longitude: number;
  category: AthoraRoomCategory;
  currentCount: number;
  capacity: number;
  isPinned: boolean;
  owner: { name: string; image: string | null };
}

export interface ViewportBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface MapCluster {
  city: string | null;
  country: string | null;
  lat: number;
  lng: number;
  roomCount: number;
  totalPeople: number;
}

// ─── Current User Context ────────────────────────────────────────

export interface CurrentUser {
  id: string;
  name: string;
  image: string | null;
  avatarConfig: unknown;
  availability: AthoraAvailability;
  interestTags: string[];
  currentRoomId: string | null;
}
