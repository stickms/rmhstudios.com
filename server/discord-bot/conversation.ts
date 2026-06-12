import type OpenAI from 'openai';

export interface ConversationState {
  branchName: string;
  worktreePath: string;
  discordUserId: string;
  discordUsername: string;
  channelId: string;
  history: OpenAI.Chat.ChatCompletionMessageParam[];
  deletedFilesThisSession: string[];
  lockedAt: number | null;
}

export const sessions = new Map<string, ConversationState>();

export function sanitizeUsername(username: string): string {
  return (
    username
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'user'
  );
}

export function makeBranchName(discordUsername: string): string {
  return `rmhbot/${sanitizeUsername(discordUsername)}-${Math.floor(Date.now() / 1000)}`;
}

export function isSessionLocked(state: ConversationState): boolean {
  if (!state.lockedAt) return false;
  // Auto-unlock after 5 minutes (assume previous run crashed)
  if (Date.now() - state.lockedAt > 5 * 60_000) {
    state.lockedAt = null;
    return false;
  }
  return true;
}
