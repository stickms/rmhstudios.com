/**
 * RMHbox — Shared Zod Validation Schemas
 *
 * Runtime validation schemas for all WebSocket payloads.
 * Used on the server to validate incoming client events,
 * and optionally on the client for pre-flight validation.
 *
 * Reference: docs/rmhbox/design-spec/core.md §21 (payload shapes)
 */

import { z } from 'zod';

// ─── Lobby Settings (partial — for create/update payloads) ───────

export const LobbySettingsSchema = z.object({
  isPublic: z.boolean().optional(),
  maxPlayers: z.number().int().min(2).max(16).optional(),
  maxSpectators: z.number().int().min(0).max(50).optional(),
  allowMidGameJoin: z.boolean().optional(),
  allowSpectatorPromotion: z.boolean().optional(),
  autoStartThreshold: z.number().int().min(2).max(16).nullable().optional(),
  gameDurationOverride: z.number().int().min(10).max(600).nullable().optional(),
});

// ─── Client → Server Event Payloads ─────────────────────────────

export const CreateLobbySchema = z.object({
  settings: LobbySettingsSchema.optional(),
});

export const JoinLobbySchema = z.object({
  lobbyId: z.string().min(1).max(64).regex(/^[A-Za-z0-9]+$/),
  asSpectator: z.boolean().optional().default(false),
});

export const LeaveLobbySchema = z.object({
  lobbyId: z.string(),
});

export const KickPlayerSchema = z.object({
  lobbyId: z.string(),
  targetUserId: z.string(),
});

export const TransferHostSchema = z.object({
  lobbyId: z.string(),
  targetUserId: z.string(),
});

export const UpdateSettingsSchema = z.object({
  lobbyId: z.string(),
  settings: LobbySettingsSchema,
});

export const ToggleReadySchema = z.object({
  lobbyId: z.string(),
});

export const RequestPromotionSchema = z.object({
  lobbyId: z.string(),
});

export const ChatSchema = z.object({
  lobbyId: z.string(),
  content: z.string().min(1).max(200).transform((s) => s.trim()).pipe(z.string().min(1)),
});

export const BrowseLobbiesSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

export const SelectGameSchema = z.object({
  lobbyId: z.string(),
  minigameId: z.string(),
});

export const StartVoteSchema = z.object({
  lobbyId: z.string(),
});

export const CastVoteSchema = z.object({
  lobbyId: z.string(),
  minigameId: z.string(),
});

export const ForceSkipSchema = z.object({
  lobbyId: z.string(),
});

export const ReadyToRenderSchema = z.object({
  lobbyId: z.string(),
});

export const GameInputSchema = z.object({
  lobbyId: z.string(),
  action: z.string().min(1).max(128),
  data: z.unknown(),
});

export const FetchLeaderboardSchema = z.object({
  period: z.enum(['all-time', 'weekly', 'monthly']),
  minigame: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
