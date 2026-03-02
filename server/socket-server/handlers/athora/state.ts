/**
 * Athora — In-Memory Room State
 *
 * Tracks which users are in which rooms, their positions, and stand visitors.
 * This replaces Redis for single-server deployments.
 */

export interface AthoraRoomUser {
  id: string;
  name: string;
  image: string | null;
  avatarConfig: unknown;
  x: number;
  y: number;
  facing: string;
  availability: string;
  interestTags: string[];
  socketId: string;
}

// room:users — Map<roomId, Map<userId, AthoraRoomUser>>
const roomUsers = new Map<string, Map<string, AthoraRoomUser>>();

// user → roomId mapping
const userRoom = new Map<string, string>();

// stand visitors — Map<standId, Set<userId>>
const standVisitors = new Map<string, Set<string>>();

// ─── Room Users ──────────────────────────────────────────────────

export function getRoomUsers(roomId: string): Map<string, AthoraRoomUser> {
  let users = roomUsers.get(roomId);
  if (!users) {
    users = new Map();
    roomUsers.set(roomId, users);
  }
  return users;
}

export function addRoomUser(roomId: string, user: AthoraRoomUser): void {
  getRoomUsers(roomId).set(user.id, user);
  userRoom.set(user.id, roomId);
}

export function removeRoomUser(roomId: string, userId: string): void {
  const users = roomUsers.get(roomId);
  if (users) {
    users.delete(userId);
    if (users.size === 0) roomUsers.delete(roomId);
  }
  userRoom.delete(userId);
}

export function getUserRoom(userId: string): string | null {
  return userRoom.get(userId) ?? null;
}

export function updateRoomUserPosition(
  roomId: string,
  userId: string,
  x: number,
  y: number,
  facing: string,
): void {
  const user = getRoomUsers(roomId).get(userId);
  if (user) {
    user.x = x;
    user.y = y;
    user.facing = facing;
  }
}

export function getRoomUserCount(roomId: string): number {
  return roomUsers.get(roomId)?.size ?? 0;
}

// ─── Stand Visitors ──────────────────────────────────────────────

export function addStandVisitor(standId: string, userId: string): number {
  let visitors = standVisitors.get(standId);
  if (!visitors) {
    visitors = new Set();
    standVisitors.set(standId, visitors);
  }
  visitors.add(userId);
  return visitors.size;
}

export function removeStandVisitor(standId: string, userId: string): number {
  const visitors = standVisitors.get(standId);
  if (visitors) {
    visitors.delete(userId);
    if (visitors.size === 0) standVisitors.delete(standId);
    return visitors.size;
  }
  return 0;
}

export function getStandVisitorCount(standId: string): number {
  return standVisitors.get(standId)?.size ?? 0;
}
