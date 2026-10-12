/**
 * M4 — server-side slash commands. Server-only.
 *
 * Everything others must be able to trust is decided here: the dice come from
 * `crypto.randomInt`, the coin from `crypto.randomInt`, the tip from the ledger.
 * The client only ever sends the text the user typed.
 */

import { randomInt } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { ChatAccess } from '@/lib/chat-plus/access.server';
import { postChatMessage, type PostedMessage } from '@/lib/chat-plus/post.server';
import { createChecklist } from '@/lib/chat-plus/checklist.server';
import { createPoll } from '@/lib/chat-plus/polls.server';
import { sendChatTip } from '@/lib/chat-plus/tip.server';
import {
  diceText,
  getCommand,
  parseChecklist,
  parseDice,
  parsePoll,
  parseSlash,
  parseTip,
} from '@/lib/chat-plus/commands';
import type { CoinMeta, DiceMeta } from '@/lib/chat-plus/types';

export const commandSchema = z.object({ text: z.string().trim().min(2).max(2000) });

export type CommandResult =
  { ok: true; message: PostedMessage } | { ok: false; status: number; error: string };

const bad = (error: string, status = 400): CommandResult => ({ ok: false, status, error });

export async function runChatCommand(
  access: ChatAccess,
  text: string,
  senderName: string,
): Promise<CommandResult> {
  const parsed = parseSlash(text);
  const command = parsed ? getCommand(parsed.name) : undefined;
  if (!parsed || !command || command.where !== 'server' || !command.kinds.includes(access.kind)) {
    return bad('Unknown command');
  }

  switch (command.name) {
    case 'roll': {
      const dice = parseDice(parsed.args);
      if (!dice.ok) return bad(dice.error);
      const { count, sides } = dice.value;
      // randomInt is uniform and unbiased; Math.random is neither auditable nor fair.
      const rolls = Array.from({ length: count }, () => randomInt(1, sides + 1));
      const total = rolls.reduce((a, b) => a + b, 0);
      const meta: DiceMeta = { count, sides, rolls, total };
      const message = await postChatMessage(access, {
        senderId: access.viewerId,
        content: diceText(count, sides, rolls, total),
        kind: 'dice',
        meta: meta as unknown as Prisma.InputJsonValue,
      });
      return { ok: true, message };
    }
    case 'flip': {
      const result: CoinMeta['result'] = randomInt(0, 2) === 0 ? 'heads' : 'tails';
      const message = await postChatMessage(access, {
        senderId: access.viewerId,
        content: `Flipped a coin: ${result === 'heads' ? 'Heads' : 'Tails'}`,
        kind: 'coin',
        meta: { result } satisfies CoinMeta,
      });
      return { ok: true, message };
    }
    case 'poll': {
      const poll = parsePoll(parsed.args);
      if (!poll.ok) return bad(poll.error);
      return { ok: true, message: await createPoll(access, poll.value) };
    }
    case 'checklist': {
      const list = parseChecklist(parsed.args);
      if (!list.ok) return bad(list.error);
      return { ok: true, message: await createChecklist(access, list.value) };
    }
    case 'tip': {
      const tip = parseTip(parsed.args);
      if (!tip.ok) return bad(tip.error);
      const res = await sendChatTip(access, { ...tip.value, senderName });
      return res.ok ? { ok: true, message: res.message } : bad(res.error, res.status);
    }
    default:
      return bad('Unknown command');
  }
}
