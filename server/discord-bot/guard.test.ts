/**
 * The blast-radius guard. This is what lets a live test run on the shared production token
 * without the bot reading or writing anything outside one channel, so every rule is a row here.
 */
import { describe, expect, it } from 'vitest';
import { checkRoute, filterDispatch, loadGuardConfig, prefixTestContent, restricted, testMode } from './guard';

const SELF = '1484248122879377518';
const TEST_GUILD = '1473857118409982034';
const OTHER_GUILD = '478743674826784769';
const TEST_CHANNEL = '111';
const OTHER_CHANNEL = '222';

const prod = loadGuardConfig({});
const guildOnly = loadGuardConfig({ DISCORD_BOT_GUILD_ALLOWLIST: TEST_GUILD });
const test = loadGuardConfig({ DISCORD_BOT_GUILD_ALLOWLIST: TEST_GUILD, DISCORD_BOT_CHANNEL_ALLOWLIST: TEST_CHANNEL });

const msg = (over: Record<string, unknown>) => ({
  id: '9',
  guild_id: TEST_GUILD,
  channel_id: TEST_CHANNEL,
  author: { id: 'u1', username: 'someone' },
  content: 'hello',
  ...over,
});

describe('inbound filter', () => {
  it('passes everything in production (no allowlist)', () => {
    expect(restricted(prod)).toBe(false);
    const d = msg({ guild_id: OTHER_GUILD });
    expect(filterDispatch(prod, 'MESSAGE_CREATE', d, SELF)).toBe(d);
    expect(filterDispatch(prod, 'MESSAGE_CREATE', msg({ guild_id: undefined }), SELF)).not.toBeNull();
  });

  it('drops other guilds and guild-less events (DMs) under a guild allowlist', () => {
    expect(filterDispatch(guildOnly, 'MESSAGE_CREATE', msg({ guild_id: OTHER_GUILD }), SELF)).toBeNull();
    expect(filterDispatch(guildOnly, 'MESSAGE_CREATE', msg({ guild_id: undefined }), SELF)).toBeNull();
    expect(filterDispatch(guildOnly, 'INTERACTION_CREATE', { id: 'i', guild_id: OTHER_GUILD }, SELF)).toBeNull();
    expect(filterDispatch(guildOnly, 'GUILD_CREATE', { id: OTHER_GUILD }, SELF)).toBeNull();
    expect(filterDispatch(guildOnly, 'GUILD_CREATE', { id: TEST_GUILD }, SELF)).not.toBeNull();
    expect(filterDispatch(guildOnly, 'MESSAGE_CREATE', msg({}), SELF)).not.toBeNull();
  });

  it('keeps only allowlisted guilds in READY', () => {
    const ready = filterDispatch(guildOnly, 'READY', { user: { id: SELF }, guilds: [{ id: TEST_GUILD }, { id: OTHER_GUILD }] }, SELF) as {
      guilds: Array<{ id: string }>;
    };
    expect(ready.guilds.map((g) => g.id)).toEqual([TEST_GUILD]);
  });

  it('in test mode, drops every real user event before any handler', () => {
    expect(testMode(test)).toBe(true);
    // A person's message, even in the test channel.
    expect(filterDispatch(test, 'MESSAGE_CREATE', msg({}), SELF)).toBeNull();
    // Any message in another channel of the same guild.
    expect(filterDispatch(test, 'MESSAGE_CREATE', msg({ channel_id: OTHER_CHANNEL, author: { id: SELF } }), SELF)).toBeNull();
    expect(filterDispatch(test, 'INTERACTION_CREATE', { guild_id: TEST_GUILD, channel_id: TEST_CHANNEL }, SELF)).toBeNull();
    expect(filterDispatch(test, 'TYPING_START', { guild_id: TEST_GUILD, channel_id: TEST_CHANNEL, user_id: 'u1' }, SELF)).toBeNull();
    expect(
      filterDispatch(test, 'MESSAGE_REACTION_ADD', { guild_id: TEST_GUILD, channel_id: TEST_CHANNEL, user_id: 'u1' }, SELF),
    ).toBeNull();
    expect(filterDispatch(test, 'PRESENCE_UPDATE', { guild_id: TEST_GUILD, user: { id: 'u1' } }, SELF)).toBeNull();
    expect(filterDispatch(test, 'VOICE_STATE_UPDATE', { guild_id: TEST_GUILD, user_id: 'u1' }, SELF)).toBeNull();
    expect(filterDispatch(test, 'GUILD_MEMBER_UPDATE', { guild_id: TEST_GUILD, user: { id: 'u1' } }, SELF)).toBeNull();
  });

  it('in test mode, hands only our own "[test] trigger" message on, as a person would send it', () => {
    const own = msg({ author: { id: SELF, bot: true }, content: '[test] trigger <@x> hi' });
    const out = filterDispatch(test, 'MESSAGE_CREATE', own, SELF) as { author: { bot: boolean } };
    expect(out.author.bot).toBe(false);
    // Our own reply never loops back into a handler.
    expect(filterDispatch(test, 'MESSAGE_CREATE', msg({ author: { id: SELF, bot: true }, content: '[test] yo' }), SELF)).toBeNull();
  });

  it('in test mode, strips the guild sync to metadata', () => {
    const g = filterDispatch(
      test,
      'GUILD_CREATE',
      {
        id: TEST_GUILD,
        channels: [{ id: TEST_CHANNEL }],
        members: [{ user: { id: 'u1' } }, { user: { id: SELF } }],
        presences: [{ user: { id: 'u1' }, status: 'online' }],
        voice_states: [{ user_id: 'u1', channel_id: '5' }],
      },
      SELF,
    ) as { members: Array<{ user: { id: string } }>; presences: unknown[]; voice_states: unknown[]; channels: unknown[] };
    expect(g.members.map((m) => m.user.id)).toEqual([SELF]);
    expect(g.presences).toEqual([]);
    expect(g.voice_states).toEqual([]);
    expect(g.channels).toHaveLength(1);
  });
});

describe('outbound check', () => {
  const ctx = { selfId: SELF, channelGuild: (c: string) => (c === TEST_CHANNEL || c === OTHER_CHANNEL ? TEST_GUILD : OTHER_GUILD) };
  const ok = (cfg: typeof prod, method: string, route: string) => checkRoute(cfg, { method, route }, ctx).ok;

  it('allows everything in production', () => {
    expect(ok(prod, 'PUT', '/applications/1/commands')).toBe(true);
    expect(ok(prod, 'POST', '/channels/999/messages')).toBe(true);
  });

  it('never writes GLOBAL application commands while restricted', () => {
    for (const cfg of [guildOnly, test]) {
      for (const m of ['PUT', 'POST', 'PATCH', 'DELETE']) expect(ok(cfg, m, '/applications/1/commands'), m).toBe(false);
      expect(ok(cfg, 'GET', '/applications/1/commands')).toBe(true);
    }
  });

  it('keeps guild commands to the allowlisted guild, and off entirely in test mode', () => {
    expect(ok(guildOnly, 'PUT', `/applications/1/guilds/${TEST_GUILD}/commands`)).toBe(true);
    expect(ok(guildOnly, 'PUT', `/applications/1/guilds/${OTHER_GUILD}/commands`)).toBe(false);
    expect(ok(test, 'PUT', `/applications/1/guilds/${TEST_GUILD}/commands`)).toBe(false);
    expect(ok(test, 'GET', `/applications/1/guilds/${TEST_GUILD}/commands`)).toBe(true);
  });

  it('posts only into allowlisted channels', () => {
    expect(ok(guildOnly, 'POST', `/channels/${OTHER_CHANNEL}/messages`)).toBe(true);
    expect(ok(guildOnly, 'POST', '/channels/333/messages')).toBe(false); // a channel of another guild
    expect(ok(test, 'POST', `/channels/${TEST_CHANNEL}/messages`)).toBe(true);
    expect(ok(test, 'POST', `/channels/${OTHER_CHANNEL}/messages`)).toBe(false);
    expect(ok(test, 'DELETE', `/channels/${TEST_CHANNEL}/messages/5`)).toBe(true);
  });

  it('refuses user lookups (other than ourselves) and unknown routes in test mode', () => {
    expect(ok(test, 'GET', '/users/169194892269060096')).toBe(false);
    expect(ok(test, 'GET', `/users/${SELF}`)).toBe(true);
    // No DM channel, no profile edit (name/avatar are shared with production).
    expect(ok(test, 'POST', '/users/@me/channels')).toBe(false);
    expect(ok(guildOnly, 'POST', '/users/@me/channels')).toBe(false);
    expect(ok(guildOnly, 'PATCH', '/users/@me')).toBe(false);
    expect(ok(guildOnly, 'GET', '/users/169194892269060096')).toBe(true);
    expect(ok(test, 'GET', '/gateway/bot')).toBe(true);
    expect(ok(test, 'POST', '/stickers')).toBe(false);
  });

  it('prefixes test posts', () => {
    expect(prefixTestContent({ content: 'yo' }).content).toBe('[test] yo');
    expect(prefixTestContent({ content: undefined, embeds: [] }).content).toBe('[test]');
    expect(prefixTestContent({ content: '[test] x' }).content).toBe('[test] x');
  });
});
