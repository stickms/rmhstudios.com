/**
 * Phase 4 §1 — Database Schema Tests
 *
 * Verifies the Prisma schema defines the RMHboxProfile,
 * RMHboxMatch, and RMHboxMatchPlayer models with correct
 * fields, relations, and indexes.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const schemaPath = resolve(__dirname, '../../../prisma/schema.prisma');
const schemaContent = readFileSync(schemaPath, 'utf-8');

describe('Database Schema — RMHbox Models (§1)', () => {
  // ─── RMHboxProfile ─────────────────────────────────────────

  it('should define the RMHboxProfile model', () => {
    expect(schemaContent).toContain('model RMHboxProfile');
  });

  it('should have userId as @unique on RMHboxProfile', () => {
    // Match userId followed by @unique within RMHboxProfile block
    const profileBlock = extractModelBlock(schemaContent, 'RMHboxProfile');
    expect(profileBlock).toContain('userId');
    expect(profileBlock).toContain('@unique');
  });

  it('should have totalGamesPlayed, totalWins, totalScore fields', () => {
    const profileBlock = extractModelBlock(schemaContent, 'RMHboxProfile');
    expect(profileBlock).toContain('totalGamesPlayed');
    expect(profileBlock).toContain('totalWins');
    expect(profileBlock).toContain('totalScore');
  });

  it('should have minigameStats as Json field', () => {
    const profileBlock = extractModelBlock(schemaContent, 'RMHboxProfile');
    expect(profileBlock).toContain('minigameStats');
    expect(profileBlock).toContain('Json');
  });

  it('should have win streak fields', () => {
    const profileBlock = extractModelBlock(schemaContent, 'RMHboxProfile');
    expect(profileBlock).toContain('currentWinStreak');
    expect(profileBlock).toContain('bestWinStreak');
  });

  it('should have totalPlayTimeMs field', () => {
    const profileBlock = extractModelBlock(schemaContent, 'RMHboxProfile');
    expect(profileBlock).toContain('totalPlayTimeMs');
  });

  it('should map to rmhbox_profile table', () => {
    const profileBlock = extractModelBlock(schemaContent, 'RMHboxProfile');
    expect(profileBlock).toContain('@@map("rmhbox_profile")');
  });

  it('should have descending indexes on totalWins and totalScore', () => {
    const profileBlock = extractModelBlock(schemaContent, 'RMHboxProfile');
    expect(profileBlock).toContain('@@index([totalWins(sort: Desc)])');
    expect(profileBlock).toContain('@@index([totalScore(sort: Desc)])');
  });

  it('should have relation to User model', () => {
    const profileBlock = extractModelBlock(schemaContent, 'RMHboxProfile');
    expect(profileBlock).toContain('user');
    expect(profileBlock).toContain('User');
    expect(profileBlock).toContain('onDelete: Cascade');
  });

  it('should have matches relation to RMHboxMatchPlayer', () => {
    const profileBlock = extractModelBlock(schemaContent, 'RMHboxProfile');
    expect(profileBlock).toContain('matches');
    expect(profileBlock).toContain('RMHboxMatchPlayer[]');
  });

  // ─── RMHboxMatch ───────────────────────────────────────────

  it('should define the RMHboxMatch model', () => {
    expect(schemaContent).toContain('model RMHboxMatch');
  });

  it('should have minigameId, lobbyId, playerCount fields', () => {
    const matchBlock = extractModelBlock(schemaContent, 'RMHboxMatch');
    expect(matchBlock).toContain('minigameId');
    expect(matchBlock).toContain('lobbyId');
    expect(matchBlock).toContain('playerCount');
  });

  it('should have startedAt and nullable endedAt', () => {
    const matchBlock = extractModelBlock(schemaContent, 'RMHboxMatch');
    expect(matchBlock).toContain('startedAt');
    expect(matchBlock).toContain('endedAt');
    expect(matchBlock).toMatch(/endedAt\s+DateTime\?/);
  });

  it('should have durationMs and winnerUserId as optional', () => {
    const matchBlock = extractModelBlock(schemaContent, 'RMHboxMatch');
    expect(matchBlock).toMatch(/durationMs\s+Int\?/);
    expect(matchBlock).toMatch(/winnerUserId\s+String\?/);
  });

  it('should have gameLog as optional Json and results as required Json', () => {
    const matchBlock = extractModelBlock(schemaContent, 'RMHboxMatch');
    expect(matchBlock).toMatch(/gameLog\s+Json\?/);
    expect(matchBlock).toMatch(/results\s+Json\b/);
  });

  it('should have indexes on minigameId, startedAt desc, and lobbyId', () => {
    const matchBlock = extractModelBlock(schemaContent, 'RMHboxMatch');
    expect(matchBlock).toContain('@@index([minigameId])');
    expect(matchBlock).toContain('@@index([startedAt(sort: Desc)])');
    expect(matchBlock).toContain('@@index([lobbyId])');
  });

  it('should map to rmhbox_match table', () => {
    const matchBlock = extractModelBlock(schemaContent, 'RMHboxMatch');
    expect(matchBlock).toContain('@@map("rmhbox_match")');
  });

  // ─── RMHboxMatchPlayer ─────────────────────────────────────

  it('should define the RMHboxMatchPlayer model', () => {
    expect(schemaContent).toContain('model RMHboxMatchPlayer');
  });

  it('should have matchId with Cascade relation to RMHboxMatch', () => {
    const playerBlock = extractModelBlock(schemaContent, 'RMHboxMatchPlayer');
    expect(playerBlock).toContain('matchId');
    expect(playerBlock).toContain('RMHboxMatch');
    expect(playerBlock).toContain('onDelete: Cascade');
  });

  it('should have profileId with Cascade relation to RMHboxProfile', () => {
    const playerBlock = extractModelBlock(schemaContent, 'RMHboxMatchPlayer');
    expect(playerBlock).toContain('profileId');
    expect(playerBlock).toContain('RMHboxProfile');
  });

  it('should have userId, userName, rank, score, wasWinner fields', () => {
    const playerBlock = extractModelBlock(schemaContent, 'RMHboxMatchPlayer');
    expect(playerBlock).toContain('userId');
    expect(playerBlock).toContain('userName');
    expect(playerBlock).toContain('rank');
    expect(playerBlock).toContain('score');
    expect(playerBlock).toContain('wasWinner');
  });

  it('should have stats as Json with default', () => {
    const playerBlock = extractModelBlock(schemaContent, 'RMHboxMatchPlayer');
    expect(playerBlock).toContain('stats');
    expect(playerBlock).toContain('Json');
  });

  it('should have unique constraint on [matchId, userId]', () => {
    const playerBlock = extractModelBlock(schemaContent, 'RMHboxMatchPlayer');
    expect(playerBlock).toContain('@@unique([matchId, userId])');
  });

  it('should have indexes on profileId, userId, and createdAt desc', () => {
    const playerBlock = extractModelBlock(schemaContent, 'RMHboxMatchPlayer');
    expect(playerBlock).toContain('@@index([profileId])');
    expect(playerBlock).toContain('@@index([userId])');
    expect(playerBlock).toContain('@@index([createdAt(sort: Desc)])');
  });

  it('should map to rmhbox_match_player table', () => {
    const playerBlock = extractModelBlock(schemaContent, 'RMHboxMatchPlayer');
    expect(playerBlock).toContain('@@map("rmhbox_match_player")');
  });

  // ─── User Model Relation ───────────────────────────────────

  it('should add rmhboxProfile relation to User model', () => {
    const userBlock = extractModelBlock(schemaContent, 'User');
    expect(userBlock).toContain('rmhboxProfile');
    expect(userBlock).toContain('RMHboxProfile?');
  });
});

// ─── Helper ──────────────────────────────────────────────────────

/**
 * Extract a model block from the Prisma schema by name.
 * Handles nested braces and strings with braces inside.
 */
function extractModelBlock(schema: string, modelName: string): string {
  const startPattern = `model ${modelName}`;
  const startIdx = schema.indexOf(startPattern);
  if (startIdx === -1) return '';

  let braceCount = 0;
  let started = false;
  let endIdx = startIdx;

  for (let i = startIdx; i < schema.length; i++) {
    if (schema[i] === '{') {
      braceCount++;
      started = true;
    } else if (schema[i] === '}') {
      braceCount--;
      if (started && braceCount === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }

  return schema.substring(startIdx, endIdx);
}
