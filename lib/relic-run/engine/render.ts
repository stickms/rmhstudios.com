/**
 * Top-down canvas renderer for Relic Run.
 */

import type { EngineState } from './types';
import { ROOM_WIDTH, ROOM_HEIGHT, PLAYER_RADIUS, ENEMY_RADIUS, MELEE_RANGE } from './types';

export function render(ctx: CanvasRenderingContext2D, state: Readonly<EngineState>): void {
  const { player, enemies } = state;

  // Room background (dungeon floor)
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, ROOM_WIDTH, ROOM_HEIGHT);

  // Room border (walls)
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, ROOM_WIDTH - 4, ROOM_HEIGHT - 4);

  // Enemies
  for (const e of enemies) {
    if (e.health <= 0) continue;
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(e.x, e.y, ENEMY_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Health bar
    const barW = ENEMY_RADIUS * 2;
    const barH = 4;
    ctx.fillStyle = '#450a0a';
    ctx.fillRect(e.x - barW / 2, e.y - ENEMY_RADIUS - 8, barW, barH);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(e.x - barW / 2, e.y - ENEMY_RADIUS - 8, barW * (e.health / 30), barH);
  }

  // Player (swordsman: circle + direction arc for facing)
  ctx.fillStyle = '#3b82f6';
  ctx.beginPath();
  ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1d4ed8';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Facing indicator (small arc)
  ctx.strokeStyle = '#93c5fd';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(
    player.x,
    player.y,
    PLAYER_RADIUS + 4,
    player.facing - 0.4,
    player.facing + 0.4
  );
  ctx.stroke();

  // Melee attack flash (when on cooldown and recently attacked, show range)
  if (player.attackCooldown > 0 && player.attackCooldown < 0.15) {
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x, player.y, MELEE_RANGE + ENEMY_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Player health (party health) - bar at top
  const barW = 200;
  const barH = 12;
  const barX = ROOM_WIDTH / 2 - barW / 2;
  const barY = 8;
  ctx.fillStyle = '#334155';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = player.health > 50 ? '#22c55e' : player.health > 25 ? '#eab308' : '#ef4444';
  ctx.fillRect(barX, barY, barW * Math.max(0, player.health / 100), barH);
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, barH);
}
