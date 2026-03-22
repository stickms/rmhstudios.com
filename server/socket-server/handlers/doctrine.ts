/**
 * Doctrine Engine — Socket.IO Handler
 *
 * Real-time events for: puzzle leaderboards, incident alerts, Sahur mode.
 */

import type { Server, Socket } from 'socket.io';

// Namespace all doctrine events under "doctrine:" to avoid collisions
export function registerDoctrineHandlers(io: Server, socket: Socket): void {
  // Join puzzle room for live leaderboard updates
  socket.on('doctrine:join:puzzle', (puzzleId: string) => {
    if (typeof puzzleId !== 'string' || puzzleId.length > 50) return;
    socket.join(`doctrine:puzzle:${puzzleId}`);

    // Broadcast live player count
    const room = io.sockets.adapter.rooms.get(`doctrine:puzzle:${puzzleId}`);
    const count = room?.size ?? 0;
    io.to(`doctrine:puzzle:${puzzleId}`).emit('doctrine:players:count', { puzzleId, count });
  });

  // Leave puzzle room
  socket.on('doctrine:leave:puzzle', (puzzleId: string) => {
    if (typeof puzzleId !== 'string') return;
    socket.leave(`doctrine:puzzle:${puzzleId}`);
  });

  // Join incidents room for live alerts
  socket.on('doctrine:join:incidents', () => {
    socket.join('doctrine:incidents');
  });

  socket.on('doctrine:leave:incidents', () => {
    socket.leave('doctrine:incidents');
  });

  // Join Sahur room for activation broadcasts
  socket.on('doctrine:join:sahur', (timezone: string) => {
    if (typeof timezone !== 'string' || timezone.length > 100) return;
    socket.join(`doctrine:sahur:${timezone}`);
    socket.join('doctrine:sahur');
  });

  socket.on('doctrine:leave:sahur', () => {
    socket.leave('doctrine:sahur');
  });
}

export function handleDoctrineDisconnect(io: Server, socket: Socket): void {
  // Room cleanup is automatic in Socket.IO when a socket disconnects
  // No additional cleanup needed
}

// ─── Server-side emitters (called from API routes or workers via HTTP) ─────

/**
 * Broadcast a leaderboard update to users watching a specific puzzle.
 */
export function emitLeaderboardUpdate(
  io: Server,
  puzzleId: string,
  data: { userId: string; score: number; rank: number },
): void {
  io.to(`doctrine:puzzle:${puzzleId}`).emit('doctrine:leaderboard:update', data);
}

/**
 * Broadcast a new incident to the incidents room.
 */
export function emitNewIncident(
  io: Server,
  incident: { id: string; codename: string; severity: string; title: string },
): void {
  io.to('doctrine:incidents').emit('doctrine:incident:new', incident);
}

/**
 * Broadcast an incident timeline update.
 */
export function emitIncidentUpdate(
  io: Server,
  data: { incidentId: string; type: string; message: string },
): void {
  io.to('doctrine:incidents').emit('doctrine:incident:update', data);
}

/**
 * Broadcast Sahur Mode activation to a specific timezone.
 */
export function emitSahurActivate(
  io: Server,
  timezone: string,
  config: { xpMultiplier: number; greeting: string; minutesRemaining: number },
): void {
  io.to(`doctrine:sahur:${timezone}`).emit('doctrine:sahur:activate', config);
}

/**
 * Broadcast Sahur Mode deactivation.
 */
export function emitSahurDeactivate(io: Server, timezone: string): void {
  io.to(`doctrine:sahur:${timezone}`).emit('doctrine:sahur:deactivate', {});
}
