import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));

import {
  buildRecapEmbed,
  computePuzzleMeta,
  type RecapParticipant,
} from '../lights-out/recap-embed';
import {
  RECAP_CRON,
  RECAP_QUEUE,
  processDueRecaps,
  recapSettings,
  registerRecapCron,
  type DueChannel,
  type RecapRepo,
} from '../lights-out/recap.server';

const P = (
  username: string,
  status: string,
  moves: number | null = null,
  ratingEmoji: string | null = null,
  ratingLabel: string | null = null,
): RecapParticipant => ({ username, status, moves, ratingEmoji, ratingLabel });

describe('buildRecapEmbed', () => {
  it('ranks, medals and counts exactly like the Go embed', () => {
    const embed = buildRecapEmbed(
      [
        P('alice', 'completed', 3, '⭐', 'Genius'),
        P('bob', 'completed', 5),
        P('carol', 'completed', 7),
        P('dave', 'completed', 9),
        P('erin', 'playing'),
        P('frank', 'playing'),
      ],
      '2026-01-15',
      'guild123',
      'app456',
      'https://rmhstudios.com',
      new Date('2026-01-16T00:00:00Z'),
    )!;
    expect(embed.color).toBe(0xf59e0b);
    expect(embed.title).toContain('Lights Out');
    expect(embed.footer.text).toBe('Lights Out · Daily Puzzle');
    expect(embed.timestamp).toBe('2026-01-16T00:00:00.000Z');
    const d = embed.description;
    expect(d).toContain('**6** players attempted');
    expect(d).toContain('🥇 **alice** — ⭐ 3 moves (Genius)');
    expect(d).toContain('🥈 **bob** — 💡 5 moves');
    expect(d).toContain('🥉 **carol** — 💡 7 moves');
    expect(d).toContain('▪️ **dave** — 💡 9 moves');
    expect(d).toContain('🏳️ 2 players did not finish');
    expect(d).toContain('[▶️ Play today’s puzzle](https://discord.com/activities/app456)');
    // `.filter(Boolean)` drops every blank line.
    expect(d).not.toContain('\n\n');
    expect(embed.image.url).toBe(
      'https://rmhstudios.com/api/discord/activity-image?type=leaderboard&guildId=guild123&dateKey=2026-01-15&recap=1',
    );
  });

  it('uses singular forms and omits the play link without an app id', () => {
    const embed = buildRecapEmbed(
      [P('solo', 'completed', 1)],
      '2026-01-15',
      'g',
      '',
      'https://x.test',
    )!;
    expect(embed.description).toContain('1 move');
    expect(embed.description).not.toContain('1 moves');
    expect(embed.description).toContain('**1** player attempted');
    expect(embed.description).not.toContain('discord.com/activities');
  });

  it('returns null for no participants', () => {
    expect(buildRecapEmbed([], '2026-01-15', 'g', 'a', 's')).toBeNull();
  });
});

describe('computePuzzleMeta', () => {
  it('is deterministic and picks the shape by date seed', () => {
    const a = computePuzzleMeta('2026-01-15');
    expect(computePuzzleMeta('2026-01-15')).toEqual(a);
    // seed 20260115 % 16 = 3 -> the 4x4 rectangle.
    expect(a.shapeLabel).toBe('4×4');
    expect(a.optimal).not.toBeNull();
    expect(a.optimal!).toBeGreaterThan(0);
  });
  it('falls back to the date key for garbage', () => {
    expect(computePuzzleMeta('nope')).toEqual({ shapeLabel: 'nope', optimal: null });
  });
});

describe('recapSettings', () => {
  it('keeps the Go env names and fallbacks', () => {
    expect(
      recapSettings({
        DISCORD_ACTIVITY_CLIENT_ID: 'a',
        VITE_BETTER_AUTH_URL: 'https://b.test//',
      } as never),
    ).toEqual({
      appId: 'a',
      siteUrl: 'https://b.test',
    });
    expect(
      recapSettings({
        VITE_DISCORD_ACTIVITY_CLIENT_ID: 'v',
        DISCORD_ACTIVITY_CLIENT_ID: 'a',
        SITE_URL: 'https://s.test/',
      } as never),
    ).toEqual({ appId: 'v', siteUrl: 'https://s.test' });
    expect(recapSettings({} as never)).toEqual({ appId: '', siteUrl: 'https://rmhstudios.com' });
  });
});

const CH: DueChannel = { id: 'c1', guildId: 'g1', channelId: 'ch1', recapDateKey: '2026-01-15' };
const quiet = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function fakeRepo(
  opts: {
    due?: DueChannel[];
    players?: RecapParticipant[];
    clearOk?: boolean;
    clearThrows?: boolean;
  } = {},
) {
  const repo: RecapRepo = {
    dueChannels: vi.fn(async () => opts.due ?? [CH]),
    participants: vi.fn(async () => opts.players ?? [P('a', 'completed', 2)]),
    clear: vi.fn(async () => {
      if (opts.clearThrows) throw new Error('db down');
      return opts.clearOk ?? true;
    }),
    restore: vi.fn(async () => undefined),
  };
  return repo;
}
const run = (repo: RecapRepo, post: (c: string) => Promise<number>) =>
  processDueRecaps({
    repo,
    post,
    settings: { appId: 'app', siteUrl: 'https://x.test' },
    log: quiet,
  });

describe('processDueRecaps', () => {
  it('claims then posts, and counts it', async () => {
    const repo = fakeRepo();
    const post = vi.fn(async () => 200);
    expect(await run(repo, post)).toEqual({ due: 1, posted: 1 });
    expect(post).toHaveBeenCalledWith(
      'ch1',
      expect.objectContaining({ title: expect.any(String) }),
    );
    expect(repo.clear).toHaveBeenCalledWith('c1', '2026-01-15');
    expect(repo.restore).not.toHaveBeenCalled();
  });
  it('clears without posting when nobody played', async () => {
    const repo = fakeRepo({ players: [] });
    const post = vi.fn(async () => 200);
    await run(repo, post);
    expect(post).not.toHaveBeenCalled();
    expect(repo.clear).toHaveBeenCalledTimes(1);
  });
  it('403/404 stay cleared', async () => {
    for (const status of [403, 404]) {
      const repo = fakeRepo();
      expect(await run(repo, async () => status)).toEqual({ due: 1, posted: 0 });
      expect(repo.restore).not.toHaveBeenCalled();
    }
  });
  it('a failed claim never posts', async () => {
    const repo = fakeRepo({ clearThrows: true });
    const post = vi.fn(async () => 200);
    await run(repo, post);
    expect(post).not.toHaveBeenCalled();
  });
  it('an already-claimed channel is skipped', async () => {
    const repo = fakeRepo({ clearOk: false });
    const post = vi.fn(async () => 200);
    await run(repo, post);
    expect(post).not.toHaveBeenCalled();
  });
  it('a transport error, 429 or 5xx restores the schedule for the next tick', async () => {
    const repo = fakeRepo();
    await run(repo, async () => {
      throw new Error('connection reset');
    });
    expect(repo.restore).toHaveBeenCalledWith('c1', '2026-01-15', expect.any(Date));
    for (const status of [429, 502]) {
      const r = fakeRepo();
      await run(r, async () => status);
      expect(r.restore).toHaveBeenCalledTimes(1);
    }
  });
  it('one guild failing does not stop the next', async () => {
    const repo = fakeRepo({ due: [CH, { ...CH, id: 'c2', channelId: 'ch2' }] });
    const post = vi.fn(async (c: string) => {
      if (c === 'ch1') throw new Error('boom');
      return 200;
    });
    expect(await run(repo, post)).toEqual({ due: 2, posted: 1 });
  });
  it('lets a failing due query fail the job', async () => {
    const repo = fakeRepo();
    repo.dueChannels = vi.fn(async () => {
      throw new Error('db down');
    });
    await expect(run(repo, async () => 200)).rejects.toThrow('db down');
  });
});

describe('registerRecapCron', () => {
  it('schedules every 5 minutes UTC on an exclusive queue and sweeps once at boot', async () => {
    const boss = {
      createQueue: vi.fn(async () => undefined),
      schedule: vi.fn(async () => undefined),
      work: vi.fn(async () => undefined),
      send: vi.fn(async () => undefined),
    };
    await registerRecapCron(boss);
    expect(boss.createQueue).toHaveBeenCalledWith(RECAP_QUEUE, { policy: 'exclusive' });
    expect(boss.schedule).toHaveBeenCalledWith(RECAP_QUEUE, RECAP_CRON, {}, { tz: 'UTC' });
    expect(RECAP_CRON).toBe('*/5 * * * *');
    expect(RECAP_QUEUE).toBe('lights-out.recap');
    expect(boss.work).toHaveBeenCalledWith(RECAP_QUEUE, expect.any(Function));
    expect(boss.send).toHaveBeenCalledWith(RECAP_QUEUE, {});
  });
});
