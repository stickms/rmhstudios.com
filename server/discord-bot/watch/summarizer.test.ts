// The summarizer re-writes open periods every 30 minutes; during DeepSeek's peak hours that
// refresh waits (lib/ai/deepseek-peak.ts) so it is billed at the off-peak rate.
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { WatchSummarizer } from './summarizer';
import {
  pendingPeriods,
  periodSealed,
  settleWindow,
} from './summary';

const TZ =
  'UTC';

function summarizer() {
  const chatWith =
    vi.fn(
      async () =>
        '{}',
    );
  const repo =
    {
      summarySourceHash:
        vi.fn(
          async () =>
            '',
        ),
      dailyTotals:
        vi.fn(
          async () => [],
        ),
    };
  const s =
    WatchSummarizer.create(
      {
        userIds:
          [
            'u1',
          ],
      } as never,
      TZ,
      repo as never,
      {
        configured:
          () =>
            true,
        chatWith,
      } as never,
      {} as never,
      {
        info: () => {},
        warn: () => {},
        error:
          () => {},
      } as never,
    )!;
  return {
    s,
    chatWith,
    repo,
  };
}

/** An open (not yet sealed) period at `now`. */
function openPeriod(
  now: number,
) {
  const p =
    pendingPeriods(
      now,
      TZ,
    ).find(
      (
        c,
      ) =>
        !periodSealed(
          c.period,
          c.key,
          now,
          TZ,
          settleWindow(),
        ),
    );
  if (
    !p
  )
    throw new Error(
      'no open period',
    );
  return p;
}

describe('WatchSummarizer during DeepSeek peak hours', () => {
  it('does not refresh an open period at peak', async () => {
    const peak =
      Date.UTC(
        2026,
        10,
        10,
        7,
      ); // Tuesday 07:00 UTC
    const {
      s,
      chatWith,
      repo,
    } =
      summarizer();
    const p =
      openPeriod(
        peak,
      );
    await s.summarize(
      'u1',
      p.period,
      p.key,
      peak,
    );
    expect(
      repo.summarySourceHash,
    ).toHaveBeenCalledOnce();
    expect(
      repo.dailyTotals,
    ).not.toHaveBeenCalled();
    expect(
      chatWith,
    ).not.toHaveBeenCalled();
  });
});
