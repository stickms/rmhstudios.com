/**
 * The token gate, the cron wiring, the B07 heartbeat and the dispatch router — the pieces that decide
 * whether this process touches the production bot at all, and what it does with a real user's event.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/prisma.server', () => ({ prisma: null }));

import { DiscordBot, commandsToRegister, intentsFor, loadBotConfig, mentionTarget } from './bot';
import {
  DISCORD_BOT_QUEUES,
  HEARTBEAT_RETENTION_SECONDS,
  discordBotCrons,
  gatewayHeartbeat,
  registerDiscordBot,
} from './jobs';
import { slashCommands } from './interactions';

afterEach(() => {
  vi.unstubAllEnvs();
});

function fakeBoss() {
  const calls: string[] = [];
  return {
    calls,
    createQueue: vi.fn(async (n: string) => void calls.push(`create ${n}`)),
    schedule: vi.fn(async (n: string, cron: string) => void calls.push(`schedule ${n} ${cron}`)),
    unschedule: vi.fn(async (n: string) => void calls.push(`unschedule ${n}`)),
    work: vi.fn(async (n: string) => void calls.push(`work ${n}`)),
    send: vi.fn(async () => undefined),
  };
}

describe('token gate', () => {
  it('idles without a token and drops every schedule a run with one left', async () => {
    vi.stubEnv('DISCORD_BOT_TOKEN', '');
    vi.stubEnv('DISCORD_ACTIVITY_BOT_TOKEN', '');
    const boss = fakeBoss();
    await registerDiscordBot(boss);
    expect(boss.work).not.toHaveBeenCalled();
    expect(boss.schedule).not.toHaveBeenCalled();
    // The heartbeat queue included: status reads a scheduled heartbeat as "the bot should be online".
    expect(boss.unschedule.mock.calls.map((c) => c[0]).sort()).toEqual(Object.values(DISCORD_BOT_QUEUES).sort());
  });

  it('maps the Go tickers onto offset crons', () => {
    expect(discordBotCrons({})).toEqual({
      'discord-bot.care-tick': '6-59/10 * * * *',
      'discord-bot.watch-flush': '* * * * *',
      'discord-bot.watch-identity': '23 * * * *',
      'discord-bot.watch-summary': '11-59/30 * * * *',
      'discord-bot.gateway-heartbeat': '* * * * *',
    });
    expect(discordBotCrons({ ALEX_TICK_INTERVAL: '1m' })['discord-bot.care-tick']).toBe('* * * * *');
  });
});

describe('B07 gateway heartbeat', () => {
  it('completes only while the gateway is READY', async () => {
    await expect(gatewayHeartbeat({ isReady: () => true })).resolves.toBeUndefined();
    // A throw is what makes pg-boss record the minute as `failed`, which status reads as "not connected".
    await expect(gatewayHeartbeat({ isReady: () => false })).rejects.toThrow(/not ready/);
  });

  it('tracks a freshly built bot as not ready until READY is dispatched', async () => {
    const bot = new DiscordBot(loadBotConfig({ DISCORD_BOT_TOKEN: 'x' }), null);
    await expect(gatewayHeartbeat(bot)).rejects.toThrow();
    bot.onDispatch('READY', { user: { id: 'self', username: 'Alex' }, application: { id: 'app' }, guilds: [] });
    await expect(gatewayHeartbeat(bot)).resolves.toBeUndefined();
  });

  it('keeps a day of heartbeat rows, enough for the status read', () => {
    expect(HEARTBEAT_RETENTION_SECONDS).toBe(86_400);
  });
});

describe('gateway setup', () => {
  it('asks for privileged intents only when the tracker needs them', () => {
    const base = intentsFor({ messageContent: false }, null);
    expect(base).toBe((1 << 0) | (1 << 9));
    expect(intentsFor({ messageContent: true }, null) & (1 << 15)).not.toBe(0);
    const watch = intentsFor({ messageContent: false }, { storeContent: true });
    for (const bit of [7, 8, 10, 11, 15]) expect(watch & (1 << bit), `bit ${bit}`).not.toBe(0);
  });

  it('keeps Entry Point commands on a bulk overwrite', () => {
    const out = commandsToRegister([{ name: 'launch', description: '', type: 4 }, { name: 'old', description: '' }]);
    expect(out.map((c) => c.name)).toEqual([...slashCommands().map((c) => c.name), 'launch']);
  });

  it('answers mentions and replies to Alex only', () => {
    const base = { id: '1', channel_id: 'c', guild_id: 'g', author: { id: 'u' } };
    expect(mentionTarget({ ...base, mentions: [{ id: 'bot' }] }, 'bot')).toBe(true);
    expect(mentionTarget({ ...base, referenced_message: { id: '0', channel_id: 'c', author: { id: 'bot' } } }, 'bot')).toBe(true);
    expect(mentionTarget({ ...base, mentions: [{ id: 'other' }] }, 'bot')).toBe(false);
    expect(mentionTarget({ ...base, mentions: [{ id: 'bot' }] }, '')).toBe(false);
  });

  it('reads the Go env names', () => {
    const cfg = loadBotConfig({ DISCORD_ACTIVITY_BOT_TOKEN: 't', DEEPSEEK_MODEL: '' });
    expect(cfg.token).toBe('t');
    expect(cfg.deepseekModel).toBe('deepseek-chat');
    expect(cfg.imageBaseURL).toBe('https://rmhstudios.com');
  });
});

describe('dispatch router in test mode', () => {
  function testBot() {
    vi.stubEnv('DISCORD_BOT_GUILD_ALLOWLIST', 'g');
    vi.stubEnv('DISCORD_BOT_CHANNEL_ALLOWLIST', 'c');
    vi.stubEnv('DISCORD_WATCH_USER_IDS', 'none');
    const bot = new DiscordBot(loadBotConfig({ DISCORD_BOT_TOKEN: 'x' }), null);
    bot.onDispatch('READY', { user: { id: 'self', username: 'Alex' }, application: { id: 'app' }, guilds: [] });
    return bot;
  }

  it('drops a real user mentioning Alex in the test channel before any handler', () => {
    const bot = testBot();
    const spy = vi.spyOn(bot.chat, 'handleMention');
    bot.onDispatch('MESSAGE_CREATE', {
      id: '2',
      channel_id: 'c',
      guild_id: 'g',
      author: { id: 'person', username: 'p' },
      mentions: [{ id: 'self' }],
      content: '<@self> hi',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('handles our own "[test] trigger" message as a mention', async () => {
    const bot = testBot();
    const spy = vi.spyOn(bot.chat, 'handleMention').mockResolvedValue();
    bot.onDispatch('MESSAGE_CREATE', {
      id: '3',
      channel_id: 'c',
      guild_id: 'g',
      author: { id: 'self', username: 'Alex', bot: true },
      mentions: [{ id: 'self' }],
      content: '[test] trigger <@self> hi',
    });
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });

  it('refuses global command registration while restricted', async () => {
    const bot = testBot();
    const put = vi.spyOn(bot.port, 'overwriteCommands');
    await bot.registerCommands();
    expect(put).not.toHaveBeenCalled();
  });
});
