/**
 * Phase 1 — Section 4: Zod Validation Schemas
 *
 * Tests that each shared Zod schema correctly accepts valid payloads
 * and rejects invalid ones.
 */

import { describe, it, expect } from 'vitest';
import {
  CreateLobbySchema,
  JoinLobbySchema,
  LeaveLobbySchema,
  KickPlayerSchema,
  TransferHostSchema,
  UpdateSettingsSchema,
  ToggleReadySchema,
  RequestPromotionSchema,
  ChatSchema,
  BrowseLobbiesSchema,
  SelectGameSchema,
  StartVoteSchema,
  CastVoteSchema,
  ForceSkipSchema,
  ReadyToRenderSchema,
  GameInputSchema,
  FetchLeaderboardSchema,
  LobbySettingsSchema,
} from '../../../lib/rmhbox/schemas';

describe('CreateLobbySchema', () => {
  it('should accept empty payload', () => {
    expect(CreateLobbySchema.safeParse({}).success).toBe(true);
  });

  it('should accept payload with partial settings', () => {
    const result = CreateLobbySchema.safeParse({ settings: { isPublic: true, maxPlayers: 4 } });
    expect(result.success).toBe(true);
  });

  it('should reject maxPlayers below 2', () => {
    const result = CreateLobbySchema.safeParse({ settings: { maxPlayers: 1 } });
    expect(result.success).toBe(false);
  });

  it('should reject maxPlayers above 16', () => {
    const result = CreateLobbySchema.safeParse({ settings: { maxPlayers: 17 } });
    expect(result.success).toBe(false);
  });

  it('should accept null autoStartThreshold', () => {
    const result = CreateLobbySchema.safeParse({ settings: { autoStartThreshold: null } });
    expect(result.success).toBe(true);
  });
});

describe('JoinLobbySchema', () => {
  it('should accept valid lobby ID', () => {
    const result = JoinLobbySchema.safeParse({ lobbyId: 'ABC123' });
    expect(result.success).toBe(true);
  });

  it('should accept lobby ID with asSpectator flag', () => {
    const result = JoinLobbySchema.safeParse({ lobbyId: 'ABC123', asSpectator: true });
    expect(result.success).toBe(true);
  });

  it('should default asSpectator to false', () => {
    const result = JoinLobbySchema.safeParse({ lobbyId: 'ABC123' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.asSpectator).toBe(false);
    }
  });

  it('should reject empty lobby ID', () => {
    const result = JoinLobbySchema.safeParse({ lobbyId: '' });
    expect(result.success).toBe(false);
  });

  it('should reject lobby ID with special characters', () => {
    const result = JoinLobbySchema.safeParse({ lobbyId: 'ABC-123!' });
    expect(result.success).toBe(false);
  });

  it('should reject lobby ID over 64 characters', () => {
    const result = JoinLobbySchema.safeParse({ lobbyId: 'A'.repeat(65) });
    expect(result.success).toBe(false);
  });

  it('should reject missing lobbyId', () => {
    const result = JoinLobbySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('LeaveLobbySchema', () => {
  it('should accept valid lobby ID', () => {
    expect(LeaveLobbySchema.safeParse({ lobbyId: 'XYZ789' }).success).toBe(true);
  });

  it('should reject missing lobbyId', () => {
    expect(LeaveLobbySchema.safeParse({}).success).toBe(false);
  });
});

describe('KickPlayerSchema', () => {
  it('should accept valid payload', () => {
    const result = KickPlayerSchema.safeParse({ lobbyId: 'ABC123', targetUserId: 'user-1' });
    expect(result.success).toBe(true);
  });

  it('should reject missing targetUserId', () => {
    const result = KickPlayerSchema.safeParse({ lobbyId: 'ABC123' });
    expect(result.success).toBe(false);
  });
});

describe('TransferHostSchema', () => {
  it('should accept valid payload', () => {
    const result = TransferHostSchema.safeParse({ lobbyId: 'ABC123', targetUserId: 'user-2' });
    expect(result.success).toBe(true);
  });
});

describe('UpdateSettingsSchema', () => {
  it('should accept valid settings update', () => {
    const result = UpdateSettingsSchema.safeParse({
      lobbyId: 'ABC123',
      settings: { isPublic: true },
    });
    expect(result.success).toBe(true);
  });

  it('should reject maxSpectators above 50', () => {
    const result = UpdateSettingsSchema.safeParse({
      lobbyId: 'ABC123',
      settings: { maxSpectators: 51 },
    });
    expect(result.success).toBe(false);
  });

  it('should reject non-integer maxPlayers', () => {
    const result = UpdateSettingsSchema.safeParse({
      lobbyId: 'ABC123',
      settings: { maxPlayers: 4.5 },
    });
    expect(result.success).toBe(false);
  });
});

describe('ToggleReadySchema', () => {
  it('should accept valid lobbyId', () => {
    expect(ToggleReadySchema.safeParse({ lobbyId: 'ABC123' }).success).toBe(true);
  });
});

describe('RequestPromotionSchema', () => {
  it('should accept valid lobbyId', () => {
    expect(RequestPromotionSchema.safeParse({ lobbyId: 'ABC123' }).success).toBe(true);
  });
});

describe('ChatSchema', () => {
  it('should accept valid chat message', () => {
    const result = ChatSchema.safeParse({ lobbyId: 'ABC123', content: 'Hello!' });
    expect(result.success).toBe(true);
  });

  it('should trim whitespace from content', () => {
    const result = ChatSchema.safeParse({ lobbyId: 'ABC123', content: '  Hello!  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toBe('Hello!');
    }
  });

  it('should reject empty content', () => {
    const result = ChatSchema.safeParse({ lobbyId: 'ABC123', content: '' });
    expect(result.success).toBe(false);
  });

  it('should reject content over 200 characters', () => {
    const result = ChatSchema.safeParse({ lobbyId: 'ABC123', content: 'A'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('should reject whitespace-only content after trim', () => {
    const result = ChatSchema.safeParse({ lobbyId: 'ABC123', content: '   ' });
    // After transform(trim), "   " becomes "", which fails the piped min(1)
    expect(result.success).toBe(false);
  });
});

describe('BrowseLobbiesSchema', () => {
  it('should accept empty payload with defaults', () => {
    const result = BrowseLobbiesSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
    }
  });

  it('should accept custom limit', () => {
    const result = BrowseLobbiesSchema.safeParse({ limit: 50 });
    expect(result.success).toBe(true);
  });

  it('should reject limit over 50', () => {
    const result = BrowseLobbiesSchema.safeParse({ limit: 51 });
    expect(result.success).toBe(false);
  });

  it('should reject limit of 0', () => {
    const result = BrowseLobbiesSchema.safeParse({ limit: 0 });
    expect(result.success).toBe(false);
  });

  it('should accept cursor string', () => {
    const result = BrowseLobbiesSchema.safeParse({ cursor: 'abc123' });
    expect(result.success).toBe(true);
  });
});

describe('SelectGameSchema', () => {
  it('should accept valid payload', () => {
    const result = SelectGameSchema.safeParse({ lobbyId: 'ABC123', minigameId: 'rhyme-time' });
    expect(result.success).toBe(true);
  });
});

describe('StartVoteSchema', () => {
  it('should accept valid lobbyId', () => {
    expect(StartVoteSchema.safeParse({ lobbyId: 'ABC123' }).success).toBe(true);
  });
});

describe('CastVoteSchema', () => {
  it('should accept valid vote', () => {
    const result = CastVoteSchema.safeParse({ lobbyId: 'ABC123', minigameId: 'wiki-race' });
    expect(result.success).toBe(true);
  });
});

describe('ForceSkipSchema', () => {
  it('should accept valid lobbyId', () => {
    expect(ForceSkipSchema.safeParse({ lobbyId: 'ABC123' }).success).toBe(true);
  });
});

describe('ReadyToRenderSchema', () => {
  it('should accept valid lobbyId', () => {
    expect(ReadyToRenderSchema.safeParse({ lobbyId: 'ABC123' }).success).toBe(true);
  });
});

describe('GameInputSchema', () => {
  it('should accept valid game input', () => {
    const result = GameInputSchema.safeParse({
      lobbyId: 'ABC123',
      action: 'submit_answer',
      data: { answer: 'cat' },
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty action', () => {
    const result = GameInputSchema.safeParse({
      lobbyId: 'ABC123',
      action: '',
      data: {},
    });
    expect(result.success).toBe(false);
  });

  it('should reject action over 128 characters', () => {
    const result = GameInputSchema.safeParse({
      lobbyId: 'ABC123',
      action: 'A'.repeat(129),
      data: {},
    });
    expect(result.success).toBe(false);
  });

  it('should accept unknown data types', () => {
    const result = GameInputSchema.safeParse({
      lobbyId: 'ABC123',
      action: 'click',
      data: [1, 2, 3],
    });
    expect(result.success).toBe(true);
  });

  it('should accept null data', () => {
    const result = GameInputSchema.safeParse({
      lobbyId: 'ABC123',
      action: 'click',
      data: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('FetchLeaderboardSchema', () => {
  it('should accept valid period', () => {
    const result = FetchLeaderboardSchema.safeParse({ period: 'all-time' });
    expect(result.success).toBe(true);
  });

  it('should accept weekly period', () => {
    expect(FetchLeaderboardSchema.safeParse({ period: 'weekly' }).success).toBe(true);
  });

  it('should accept monthly period', () => {
    expect(FetchLeaderboardSchema.safeParse({ period: 'monthly' }).success).toBe(true);
  });

  it('should reject invalid period', () => {
    expect(FetchLeaderboardSchema.safeParse({ period: 'yearly' }).success).toBe(false);
  });

  it('should accept optional minigame filter', () => {
    const result = FetchLeaderboardSchema.safeParse({ period: 'all-time', minigame: 'rhyme-time' });
    expect(result.success).toBe(true);
  });

  it('should accept optional limit', () => {
    const result = FetchLeaderboardSchema.safeParse({ period: 'all-time', limit: 10 });
    expect(result.success).toBe(true);
  });
});

describe('LobbySettingsSchema', () => {
  it('should accept fully empty settings (all optional)', () => {
    expect(LobbySettingsSchema.safeParse({}).success).toBe(true);
  });

  it('should accept valid full settings', () => {
    const result = LobbySettingsSchema.safeParse({
      isPublic: true,
      maxPlayers: 10,
      maxSpectators: 30,
      allowMidGameJoin: true,
      allowSpectatorPromotion: false,
      autoStartThreshold: 6,
      gameDurationOverride: 120,
    });
    expect(result.success).toBe(true);
  });

  it('should reject gameDurationOverride below 10', () => {
    expect(LobbySettingsSchema.safeParse({ gameDurationOverride: 5 }).success).toBe(false);
  });

  it('should reject gameDurationOverride above 600', () => {
    expect(LobbySettingsSchema.safeParse({ gameDurationOverride: 601 }).success).toBe(false);
  });
});
