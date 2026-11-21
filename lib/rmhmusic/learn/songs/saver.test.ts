import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  api: vi.fn(),
}));
vi.mock('@/lib/contract/client', () => ({
  api: h.api,
}));

import { HttpError } from '@/lib/http';
import { createApiSongSaver, createMemorySongSaver } from './saver';
import { songBestApi, songBestsApi } from './songs.contract';

beforeEach(() => h.api.mockReset());

describe('the API song saver', () => {
  it('sends the run with its song and answers saved with the best', async () => {
    h.api.mockResolvedValue({
      outcome: 'saved',
      best: {
        songId: 'ode-to-joy',
        mode: 'wait',
        bestScore: 90,
        score: 80,
      },
    });
    const run = {
      mode: 'wait' as const,
      wrong: [0, 1],
    };
    await expect(createApiSongSaver().save('ode-to-joy', run)).resolves.toEqual({
      outcome: 'saved',
      bestScore: 90,
    });
    expect(h.api).toHaveBeenCalledWith(songBestApi, {
      body: {
        songId: 'ode-to-joy',
        run,
      },
    });
  });

  it('maps a 401 to unauthorized, a 400 to invalid and anything else to failed', async () => {
    const saver = createApiSongSaver();
    const run = {
      mode: 'wait' as const,
      wrong: [0],
    };
    h.api.mockRejectedValueOnce(new HttpError(401));
    await expect(saver.save('ode-to-joy', run)).resolves.toEqual({
      outcome: 'unauthorized',
    });
    h.api.mockRejectedValueOnce(new HttpError(400));
    await expect(saver.save('ode-to-joy', run)).resolves.toEqual({
      outcome: 'invalid',
    });
    h.api.mockRejectedValueOnce(new Error('offline'));
    await expect(saver.save('ode-to-joy', run)).resolves.toEqual({
      outcome: 'failed',
    });
  });

  it('reads the bests', async () => {
    h.api.mockResolvedValue({
      bests: [
        {
          songId: 'ode-to-joy',
          mode: 'play',
          bestScore: 70,
        },
      ],
    });
    await expect(createApiSongSaver().bests()).resolves.toEqual([
      {
        songId: 'ode-to-joy',
        mode: 'play',
        bestScore: 70,
      },
    ]);
    expect(h.api).toHaveBeenCalledWith(songBestsApi);
  });
});

describe('the memory song saver', () => {
  it('keeps nothing', async () => {
    const saver = createMemorySongSaver();
    await expect(
      saver.save('ode-to-joy', {
        mode: 'wait',
        wrong: [0],
      }),
    ).resolves.toEqual({
      outcome: 'unsaved',
    });
    await expect(saver.bests()).resolves.toEqual([]);
  });
});
