/** /vibe: the build flow, the 3-per-10-minutes limit, and the Play / Customize buttons. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const launchCreate = vi.fn();
const launchFind = vi.fn();
const pageFind = vi.fn();
vi.mock('../../lib/prisma.server', () => ({
  prisma: {
    discordVibeLaunch: {
      create: (...a: unknown[]) => launchCreate(...a),
      findFirst: (...a: unknown[]) => launchFind(...a),
    },
    vibePage: {
      findUnique: (...a: unknown[]) => pageFind(...a),
    },
  },
}));
vi.mock('../../lib/rmhvibe/vibe.server', () => ({
  generateVibeStream: vi.fn(),
}));
vi.mock('../../lib/discord-link.server', () => ({
  findLinkedUserId: vi.fn(),
}));

import type { DiscordPort } from './discord';
import type { Interaction } from './interactions';
import {
  handleVibeCommand,
  handleVibeEditButton,
  handleVibeEditModal,
  handleVibePlay,
  abandonVibeBuilds,
  escapeMarkdown,
  type VibeDeps,
} from './vibe';

function fakePort(over: Partial<DiscordPort> = {}) {
  const calls: Array<[string, unknown[]]> = [];
  const rec =
    (name: string, ret: unknown = undefined) =>
    async (...args: unknown[]) => {
      calls.push([name, args]);
      return ret;
    };
  const port = {
    calls,
    respond: rec('respond'),
    editOriginal: rec('editOriginal', {
      id: 'm',
      channel_id: 'c1',
    }),
    send: rec('send', {
      id: 'm2',
      channel_id: 'c1',
    }),
    ...over,
  } as unknown as DiscordPort & {
    calls: typeof calls;
  };
  return port;
}

const cmd = (user: string, prompt = 'a pomodoro timer'): Interaction => ({
  id: 'i1',
  type: 2,
  token: 'tok',
  channel_id: 'c1',
  member: {
    user: {
      id: user,
      username: 'u',
    },
  },
  data: {
    name: 'vibe',
    options: [
      {
        name: 'prompt',
        type: 3,
        value: prompt,
      },
    ],
  },
});

function deps(events: unknown[], over: Partial<VibeDeps> = {}): VibeDeps {
  return {
    generate: vi.fn(async function* () {
      for (const e of events) yield e;
    }) as unknown as VibeDeps['generate'],
    findLinkedUserId: async () => null,
    now: () => 0,
    baseUrl: 'https://rmhstudios.com',
    thumbnailUrl: async () => null,
    ...over,
  };
}

const done = {
  type: 'done',
  slug: 'abc',
  versionId: 'v1',
  html: '',
  title: 'Timer',
  description: 'A timer',
};

beforeEach(() => {
  launchCreate.mockReset();
  launchFind.mockReset().mockResolvedValue(null);
  pageFind.mockReset().mockResolvedValue({
    status: 'ready',
  });
});

describe('/vibe', () => {
  it('defers, then ends on an embed with Open, Play and Customize', async () => {
    const port = fakePort();
    await handleVibeCommand(
      port,
      cmd('u-build'),
      deps([
        {
          type: 'created',
          slug: 'abc',
        },
        {
          type: 'content',
          text: 'x',
        },
        done,
      ]),
    );
    expect(
      (
        port.calls[0]![1][1] as {
          type: number;
        }
      ).type,
    ).toBe(5);
    const last = port.calls.filter(([n]) => n === 'editOriginal').at(-1)![1][1] as {
      embeds: Array<{
        url: string;
      }>;
      components: Array<{
        components: Array<{
          custom_id?: string;
          url?: string;
        }>;
      }>;
    };
    expect(last.embeds[0]!.url.endsWith('/v/abc')).toBe(true);
    const btns = last.components[0]!.components;
    expect(btns).toHaveLength(3);
    expect(btns.map((b) => b.custom_id ?? b.url)).toEqual([
      'https://rmhstudios.com/v/abc',
      'vibe_play:abc',
      'vibe_edit:abc',
    ]);
  });

  it('answers a 4th build inside 10 minutes ephemerally without generating', async () => {
    const d = deps([done]);
    const user = 'u-limited';
    for (let n = 0; n < 3; n++) await handleVibeCommand(fakePort(), cmd(user), d);
    const port = fakePort();
    await handleVibeCommand(port, cmd(user), d);
    expect(d.generate).toHaveBeenCalledTimes(3);
    const r = port.calls[0]![1][1] as {
      data: {
        content: string;
        flags: number;
      };
    };
    expect(r.data.content).toBe('You can build 3 vibes every 10 minutes.');
    expect(r.data.flags).toBe(64);
  });

  it('shows an error embed when the generator errors', async () => {
    const port = fakePort();
    await handleVibeCommand(
      port,
      cmd('u-err'),
      deps([
        {
          type: 'error',
          message: 'model down',
        },
      ]),
    );
    const last = port.calls.filter(([n]) => n === 'editOriginal').at(-1)![1][1] as {
      embeds: Array<{
        description: string;
      }>;
    };
    expect(last.embeds[0]!.description).toBe('model down');
  });

  it('posts to the channel when editing the reply fails', async () => {
    const port = fakePort({
      editOriginal: async () => null,
    });
    await handleVibeCommand(port, cmd('u-fallback'), deps([done]));
    expect(port.calls.some(([n]) => n === 'send')).toBe(true);
  });

  it('customize modal builds on the existing slug', async () => {
    const d = deps([done]);
    const i: Interaction = {
      ...cmd('u-edit'),
      type: 5,
      data: {
        custom_id: 'vibe_edit_modal:abc',
        components: [
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: 'instruction',
                value: 'make it blue',
              },
            ],
          },
        ],
      },
    };
    await handleVibeEditModal(fakePort(), i, 'abc', d);
    expect(d.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'make it blue',
        slug: 'abc',
      }),
    );
  });

  it('customize button opens the modal', async () => {
    const port = fakePort();
    await handleVibeEditButton(port, cmd('u'), 'abc');
    expect(
      (
        port.calls[0]![1][1] as {
          type: number;
          data: {
            custom_id: string;
          };
        }
      ).data.custom_id,
    ).toBe('vibe_edit_modal:abc');
  });

  it('play records the launch and launches the activity', async () => {
    const port = fakePort();
    await handleVibePlay(port, cmd('u'), 'abc', 'https://rmhstudios.com');
    expect(launchCreate).toHaveBeenCalledWith({
      data: {
        channelId: 'c1',
        slug: 'abc',
      },
    });
    expect(
      (
        port.calls[0]![1][1] as {
          type: number;
        }
      ).type,
    ).toBe(12);
  });

  it('play falls back to the link when the activity cannot launch', async () => {
    let n = 0;
    const port = fakePort({
      respond: async () => {
        if (n++ === 0) throw new Error('no activities');
      },
    });
    await handleVibePlay(port, cmd('u'), 'abc', 'https://rmhstudios.com');
    expect(n).toBe(2);
  });

  it('rejects a whitespace-only prompt without generating', async () => {
    const d = deps([done]);
    const port = fakePort();
    await handleVibeCommand(port, cmd('u-blank', '   '), d);
    expect(d.generate).not.toHaveBeenCalled();
    expect(
      (
        port.calls[0]![1][1] as {
          data: {
            flags: number;
          };
        }
      ).data.flags,
    ).toBe(64);
  });

  it('throttles progress edits to one per 2.5s and survives a failed progress edit', async () => {
    let t = 0;
    let fail = true;
    const edits: unknown[] = [];
    const port = fakePort({
      editOriginal: (async (_t: string, body: unknown) => {
        if (fail) {
          fail = false;
          throw new Error('429');
        }
        edits.push(body);
        return {
          id: 'm',
          channel_id: 'c1',
        };
      }) as DiscordPort['editOriginal'],
    });
    const d = deps([], {
      now: () => t,
      generate: vi.fn(async function* () {
        for (const at of [1000, 2600, 3000, 5200]) {
          t = at;
          yield {
            type: 'content',
            text: 'x',
          };
        }
        t = 5300;
        yield done;
      }) as unknown as VibeDeps['generate'],
    });
    await handleVibeCommand(port, cmd('u-throttle'), d);
    // Progress at 2600 (fails, skipped) and 5200; then the final edit. 1000 and 3000 are inside the window.
    expect(edits).toHaveLength(2);
    expect(port.calls.some(([n]) => n === 'send')).toBe(false);
  });

  it('ignores a bad slug on play and customize', async () => {
    const port = fakePort();
    await handleVibePlay(port, cmd('u-bad'), '../x', 'https://rmhstudios.com');
    await handleVibeEditButton(port, cmd('u-bad'), 'Bad Slug');
    expect(port.calls).toHaveLength(0);
    expect(launchCreate).not.toHaveBeenCalled();
  });

  it('play skips the insert for a missing page or a launch recorded in the last minute', async () => {
    pageFind.mockResolvedValueOnce(null);
    await handleVibePlay(fakePort(), cmd('u-p1'), 'abc', 'https://rmhstudios.com');
    launchFind.mockResolvedValueOnce({
      id: 'x',
    });
    const port = fakePort();
    await handleVibePlay(port, cmd('u-p2'), 'abc', 'https://rmhstudios.com');
    expect(launchCreate).not.toHaveBeenCalled();
    expect(
      (
        port.calls[0]![1][1] as {
          type: number;
        }
      ).type,
    ).toBe(12);
  });

  it('play still launches when the database is slow', async () => {
    vi.useFakeTimers();
    pageFind.mockReturnValue(new Promise(() => undefined));
    const port = fakePort();
    const p = handleVibePlay(port, cmd('u-slow'), 'abc', 'https://rmhstudios.com');
    await vi.advanceTimersByTimeAsync(2100);
    await p;
    vi.useRealTimers();
    expect(
      (
        port.calls[0]![1][1] as {
          type: number;
        }
      ).type,
    ).toBe(12);
  });

  it('accepts a slug containing an underscore', async () => {
    const port = fakePort();
    await handleVibeEditButton(port, cmd('u-us'), 'ab_c-1');
    expect(
      (
        port.calls[0]![1][1] as {
          data: {
            custom_id: string;
          };
        }
      ).data.custom_id,
    ).toBe('vibe_edit_modal:ab_c-1');
  });
});

describe('/vibe safeguards', () => {
  const lastEmbed = (port: ReturnType<typeof fakePort>) =>
    (
      port.calls.filter(([n]) => n === 'editOriginal').at(-1)![1][1] as {
        embeds: Array<{
          title: string;
          description: string;
        }>;
      }
    ).embeds[0]!;

  it('builds without previews', async () => {
    const d = deps([done]);
    await handleVibeCommand(fakePort(), cmd('u-prev'), d);
    expect(d.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        previews: false,
      }),
    );
  });

  it('caps concurrent builds at 2 and refuses the third without using its rate limit', async () => {
    const release: Array<() => void> = [];
    const slow = deps([], {
      generate: vi.fn(async function* () {
        await new Promise<void>((r) => release.push(r));
        yield done;
      }) as unknown as VibeDeps['generate'],
    });
    const a = handleVibeCommand(fakePort(), cmd('u-cap-a'), slow);
    const b = handleVibeCommand(fakePort(), cmd('u-cap-b'), slow);
    await vi.waitFor(() => expect(release).toHaveLength(2));

    const port = fakePort();
    await handleVibeCommand(port, cmd('u-cap-c'), slow);
    const r = port.calls[0]![1][1] as {
      data: {
        content: string;
        flags: number;
      };
    };
    expect(r.data.content).toBe('RMH Vibes is busy. Try again in a minute.');
    expect(r.data.flags).toBe(64);
    expect(slow.generate).toHaveBeenCalledTimes(2);

    release.forEach((r2) => r2());
    await Promise.all([a, b]);
    // The refused user kept all 3 builds, and the slots are free again.
    const fast = deps([done]);
    for (let n = 0; n < 3; n++) await handleVibeCommand(fakePort(), cmd('u-cap-c'), fast);
    expect(fast.generate).toHaveBeenCalledTimes(3);
  });

  it('posts a fixed message, not the exception text', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const port = fakePort();
    await handleVibeCommand(
      port,
      cmd('u-throw'),
      deps([], {
        generate: vi.fn(async function* () {
          yield* [];
          throw new Error('PrismaClientKnownRequestError: secret column');
        }) as unknown as VibeDeps['generate'],
      }),
    );
    expect(lastEmbed(port).description).toBe('Could not build that vibe. Try again.');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('escapes Discord markdown in the model-written title and description', async () => {
    const port = fakePort();
    await handleVibeCommand(
      port,
      cmd('u-md'),
      deps([
        {
          ...done,
          title: '[free](http://x)',
          description: '**bold** _it_',
        },
      ]),
    );
    expect(lastEmbed(port).title).toBe(String.raw`\[free\]\(http://x\)`);
    expect(lastEmbed(port).description).toBe('\\*\\*bold\\*\\* \\_it\\_');
  });

  it('escapeMarkdown escapes every markdown character', () => {
    expect(escapeMarkdown('\\*_~`|>[]()')).toBe('\\\\\\*\\_\\~\\`\\|\\>\\[\\]\\(\\)');
  });
});

describe('/vibe spend gate, shutdown and late thumbnail', () => {
  const embedsOf = (port: ReturnType<typeof fakePort>) =>
    port.calls
      .filter(([n]) => n === 'editOriginal')
      .map(
        ([, a]) =>
          (
            a[1] as {
              embeds: Array<{
                description: string;
                image?: {
                  url: string;
                };
              }>;
            }
          ).embeds[0]!,
      );

  it('refuses a build over the ceiling or the daily cap with a fixed sentence, without generating', async () => {
    for (const [verdict, text] of [
      ['budget', 'You have used this month’s vibe allowance.'],
      ['busy', 'RMH Vibes is busy right now. Try again later.'],
    ] as const) {
      const port = fakePort();
      const d = deps([done], {
        gate: async () => verdict,
      });
      await handleVibeCommand(port, cmd(`u-gate-${verdict}`), d);
      expect(d.generate).not.toHaveBeenCalled();
      expect(embedsOf(port).at(-1)!.description).toBe(text);
    }
  });

  it('passes the linked user to the gate', async () => {
    const gate = vi.fn(async () => 'ok' as const);
    await handleVibeCommand(
      fakePort(),
      cmd('u-gate-user'),
      deps([done], {
        gate,
        findLinkedUserId: async () => 'site-user',
      }),
    );
    expect(gate).toHaveBeenCalledWith('site-user');
  });

  it('edits a build still running at shutdown to a fixed note', async () => {
    let release!: () => void;
    const port = fakePort();
    const slow = deps([], {
      generate: vi.fn(async function* () {
        await new Promise<void>((r) => (release = r));
        yield done;
      }) as unknown as VibeDeps['generate'],
    });
    const run = handleVibeCommand(port, cmd('u-abandon'), slow);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await abandonVibeBuilds();
    expect(embedsOf(port).at(-1)!.description).toBe('The bot restarted before this finished. Try again.');
    release();
    await run;
    // The late result does not overwrite the note.
    expect(embedsOf(port).at(-1)!.description).toBe('The bot restarted before this finished. Try again.');
  });

  it('adds the screenshot to the done message once it exists', async () => {
    const port = fakePort();
    const thumbs: Array<string | null> = [null, null, '/thumbs/abc.webp'];
    const sleeps: number[] = [];
    await handleVibeCommand(
      port,
      cmd('u-late-thumb'),
      deps([done], {
        thumbnailUrl: async () => thumbs.shift() ?? null,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      }),
    );
    await vi.waitFor(() => expect(embedsOf(port).at(-1)!.image?.url).toBe('https://rmhstudios.com/thumbs/abc.webp'));
    expect(sleeps).toEqual([75_000, 150_000]);
  });
});
