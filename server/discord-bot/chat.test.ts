/**
 * /chat, @mentions and the interaction glue (port of discordbot_test.go + chat_memory_test.go),
 * driven with recorded interaction payloads against a fake Discord port: what users type into
 * Alex and what he posts back into real servers.
 */
import { describe, expect, it, vi } from 'vitest';
import { ChatService, buildChatEmbed, injectStatus, transcriptTurn, withPersona } from './chat';
import {
  CHANNEL_MEMORY_MAX_TURNS,
  cleanDiscordContent,
  mergeTurns,
  messageToTurn,
  rememberedBeyond,
  snowflakeLess,
  snowflakeTime,
  DISCORD_EPOCH_MS,
} from './chat-memory';
import { Sql } from './db';
import { DeepSeekClient } from './deepseek';
import type { DiscordPort, Message } from './discord';
import { OptionMap, canToggleAlex, interactionUser, modalValue, splitCustomId, type Interaction } from './interactions';
import { ALEX_SYSTEM_PROMPT } from './persona';

/** A snowflake for an instant (ms). */
const flake = (ms: number, seq = 0) => ((BigInt(ms - DISCORD_EPOCH_MS) << 22n) + BigInt(seq)).toString();

function fakePort(over: Partial<DiscordPort> = {}): DiscordPort & { calls: Array<[string, unknown[]]> } {
  const calls: Array<[string, unknown[]]> = [];
  const rec =
    (name: string, ret: unknown = undefined) =>
    async (...args: unknown[]) => {
      calls.push([name, args]);
      return typeof ret === 'function' ? (ret as (...a: unknown[]) => unknown)(...args) : ret;
    };
  return {
    calls,
    respond: rec('respond'),
    editOriginal: rec('editOriginal', { id: 'edited-1', channel_id: 'c' }),
    send: rec('send', (channelId: string, body: { content?: string }) => ({
      id: flake(Date.now(), 7),
      channel_id: channelId,
      author: { id: 'bot' },
      content: body.content,
    })),
    getMessages: rec('getMessages', []),
    getMessage: rec('getMessage', () => {
      throw new Error('404');
    }),
    deleteMessage: rec('deleteMessage'),
    typing: rec('typing'),
    getUser: rec('getUser', { id: 'u' }),
    getCommands: rec('getCommands', []),
    overwriteCommands: rec('overwriteCommands', []),
    updatePresence: vi.fn(),
    ...over,
  } as DiscordPort & { calls: Array<[string, unknown[]]> };
}

const silent = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

// A recorded APPLICATION_COMMAND payload (trimmed), as Discord sends /chat in a guild.
const chatInteraction: Interaction = {
  id: '1300000000000000001',
  application_id: '1484248122879377518',
  type: 2,
  token: 'tok',
  guild_id: 'g1',
  channel_id: 'c1',
  member: { user: { id: 'u1', username: 'caretaker', avatar: 'abc' }, permissions: String(1n << 13n) },
  data: { name: 'chat', options: [{ name: 'message', type: 3, value: 'yo alex' }] },
};

describe('chat embed', () => {
  it('stays inside Discord’s 6000-char budget and 25 fields', () => {
    const e = buildChatEmbed('hi', 'user', 'x'.repeat(20_000));
    const total =
      [...(e.title ?? '')].length +
      [...(e.footer?.text ?? '')].length +
      (e.fields ?? []).reduce((t, f) => t + [...f.name].length + [...f.value].length, 0);
    expect(total).toBeLessThanOrEqual(6000);
    expect(e.fields!.length).toBeLessThanOrEqual(25);
    expect(e.fields!.at(-1)!.value.endsWith('…')).toBe(true);
    for (const f of e.fields!) expect([...f.value].length).toBeLessThanOrEqual(1024);
  });

  it('keeps a short reply in one field and fills an empty one', () => {
    expect(buildChatEmbed('hi', 'u', 'short').fields!.map((f) => f.value)).toEqual(['hi', 'short']);
    expect(buildChatEmbed('hi', 'u', '').fields![1]!.value).toBe('(no response)');
  });
});

describe('persona and status injection', () => {
  it('replaces the leading system message, or prepends one', () => {
    const h = [
      { role: 'system', content: 'old' },
      { role: 'user', content: 'hi' },
    ];
    expect(withPersona(h, 'new')[0]!.content).toBe('new');
    expect(h[0]!.content).toBe('old');
    expect(withPersona([{ role: 'user', content: 'hi' }], 'p')[0]).toEqual({ role: 'system', content: 'p' });
    expect(injectStatus(h, 'STATE').map((m) => m.content)).toEqual(['old', 'STATE', 'hi']);
  });

  it('turns the bot mention into "Alex" and labels turns by author', () => {
    expect(cleanDiscordContent(' <@42> hey <@!42> ', '42')).toBe('Alex hey Alex');
    expect(transcriptTurn({ id: '1', channel_id: 'c', author: { id: '42' }, content: 'sup' }, '42')).toEqual([
      { role: 'assistant', content: 'sup' },
    ]);
    expect(transcriptTurn({ id: '1', channel_id: 'c', author: { id: '7', username: 'bo' }, content: 'sup' }, '42')).toEqual([
      { role: 'user', content: 'bo: sup' },
    ]);
    expect(transcriptTurn({ id: '1', channel_id: 'c', content: '   ' }, '42')).toEqual([]);
  });
});

describe('channel memory', () => {
  it('decodes snowflake time and orders chronologically', () => {
    const t = Date.parse('2026-11-01T00:00:00Z');
    expect(snowflakeTime(flake(t))).toBe(t);
    expect(snowflakeTime('nope')).toBe(0);
    expect(snowflakeLess(flake(t), flake(t + 1))).toBe(true);
    expect(snowflakeLess('99', '100')).toBe(true);
  });

  it('merges by id, prunes past the TTL, orders, caps', () => {
    const now = Date.now();
    const recent = (i: number) => ({ id: flake(now - 1000 + i), content: `m${i}`, name: 'a' });
    const old = { id: flake(now - 100 * 3_600_000), content: 'ancient' };
    const merged = mergeTurns([recent(2), old], [recent(1), { ...recent(2), content: 'edited' }], now);
    expect(merged.map((t) => t.content)).toEqual(['m1', 'edited']);
    const many = Array.from({ length: 120 }, (_, i) => recent(i));
    expect(mergeTurns(many, [], now)).toHaveLength(CHANNEL_MEMORY_MAX_TURNS);
  });

  it('re-injects only turns outside the live window, newest max', () => {
    const turns = ['1', '2', '3', '4'].map((id) => ({ id, content: id }));
    expect(rememberedBeyond(turns, new Set(['4']), 2).map((t) => t.id)).toEqual(['2', '3']);
    expect(messageToTurn({ id: '5', channel_id: 'c', author: { id: '42' }, content: 'x' }, '42')).toEqual({
      id: '5',
      content: 'x',
      alex: true,
    });
  });
});

describe('interaction glue (recorded payloads)', () => {
  it('reads the invoking user and options', () => {
    expect(interactionUser(chatInteraction)).toEqual({ id: 'u1', username: 'caretaker' });
    const opts = new OptionMap(chatInteraction.data!.options);
    expect(opts.str('message')).toBe('yo alex');
    expect(opts.str('missing')).toBe('');
    expect(new OptionMap([{ name: 'reset', type: 5, value: true }]).bool('reset')).toBe(true);
    expect(interactionUser({ ...chatInteraction, member: undefined, user: { id: 'dm', username: 'd' } }).id).toBe('dm');
  });

  it('splits owner-gated custom ids and reads modal values', () => {
    expect(splitCustomId('chat_continue:123')).toEqual(['chat_continue', '123']);
    expect(splitCustomId('a:b:c')).toEqual(['a', 'b:c']);
    expect(splitCustomId('solo')).toEqual(['solo', '']);
    const modal: Interaction = {
      id: 'm',
      type: 5,
      token: 't',
      data: {
        custom_id: 'chat_continue_modal:u1',
        components: [{ type: 1, components: [{ type: 4, custom_id: 'message', value: 'more' }] }],
      },
    };
    expect(modalValue(modal, 'message')).toBe('more');
    expect(modalValue(modal, 'other')).toBe('');
  });

  it('gates /alexmessages and /prompt to the bot owner, the server owner or Manage Messages', () => {
    const plain: Interaction = { ...chatInteraction, member: { user: { id: 'u2' }, permissions: '0' } };
    expect(canToggleAlex(plain, '', 'owner')).toBe(false);
    expect(canToggleAlex(plain, ' u2 ', 'owner')).toBe(true); // OWNER_ID, trimmed
    expect(canToggleAlex(plain, '', 'u2')).toBe(true); // the server's own owner
    expect(canToggleAlex(chatInteraction, '', 'owner')).toBe(true); // Manage Messages
    expect(canToggleAlex({ ...plain, member: { user: { id: 'u2' }, permissions: '8' } }, '', 'x')).toBe(true); // Administrator
  });
});

describe('ChatService against a fake Discord', () => {
  it('/chat defers, asks the model with the persona, edits in the embed + keep-talking button', async () => {
    const port = fakePort();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: ' bet 🧋 ' } }] })));
    const deepseek = new DeepSeekClient('k', 'deepseek-chat', null, fetchImpl as unknown as typeof fetch);
    const chat = new ChatService({ deepseek, sql: new Sql(null), port, logger: silent, pet: null });
    await chat.handleChat(chatInteraction, 'yo alex', true);

    expect(port.calls[0]![0]).toBe('respond');
    expect((port.calls[0]![1][1] as { type: number }).type).toBe(5); // deferred
    const sent = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.messages[0]).toEqual({ role: 'system', content: ALEX_SYSTEM_PROMPT });
    expect(sent.messages.at(-1)).toEqual({ role: 'user', content: 'yo alex' });
    expect(sent.temperature).toBe(1.3);
    expect(sent).not.toHaveProperty('presence_penalty');

    const edit = port.calls.find((c) => c[0] === 'editOriginal')!;
    const body = edit[1][1] as { embeds: Array<{ fields: Array<{ value: string }> }>; components: unknown[] };
    expect(body.embeds[0]!.fields.map((f) => f.value)).toEqual(['yo alex', 'bet 🧋']);
    expect(JSON.stringify(body.components)).toContain('chat_continue:u1');
  });

  it('/chat shows the error embed when the model is down (permanent 401, no retries)', async () => {
    const port = fakePort();
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 401 }));
    const deepseek = new DeepSeekClient('k', 'm', null, fetchImpl as unknown as typeof fetch);
    const chat = new ChatService({ deepseek, sql: new Sql(null), port, logger: silent, pet: null });
    await chat.handleChat(chatInteraction, 'hi', true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const edit = port.calls.find((c) => c[0] === 'editOriginal')!;
    expect(JSON.stringify(edit[1][1])).toContain('something broke');
  });

  it('a mention stays silent without a DeepSeek key (Go behaviour)', async () => {
    const port = fakePort();
    const chat = new ChatService({ deepseek: new DeepSeekClient('', 'm'), sql: new Sql(null), port, logger: silent, pet: null });
    const m: Message = { id: '5', channel_id: 'c1', guild_id: 'g1', author: { id: 'u1', username: 'a' }, content: '<@42> hi' };
    await chat.handleMention(m, '42');
    expect(port.calls).toEqual([]);
  });

  it('a mention falls back to an in-character line when the model fails, replying to the trigger', async () => {
    const port = fakePort();
    const fetchImpl = vi.fn(async () => new Response('bad', { status: 400 }));
    const chat = new ChatService({
      deepseek: new DeepSeekClient('k', 'm', null, fetchImpl as unknown as typeof fetch),
      sql: new Sql(null),
      port,
      logger: silent,
      pet: null,
    });
    const m: Message = { id: '5', channel_id: 'c1', guild_id: 'g1', author: { id: 'u1', username: 'a' }, content: '<@42> hi' };
    await chat.handleMention(m, '42');
    const send = port.calls.find((c) => c[0] === 'send')!;
    const body = send[1][1] as { content: string; message_reference: { message_id: string } };
    expect(body.message_reference.message_id).toBe('5');
    expect(body.content.length).toBeGreaterThan(0);
    expect(port.calls.some((c) => c[0] === 'typing')).toBe(true);
  });
});
