import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const reverifyStaleProfileLinks =
  vi.hoisted(
    () =>
      vi.fn(
        async () => ({
          checked: 0,
          dropped: 0,
        }),
      ),
  );
vi.mock(
  '@/lib/profile-links/verify.server',
  () => ({
    reverifyStaleProfileLinks,
  }),
);

import {
  PROFILE_LINK_REVERIFY_BATCH,
  PROFILE_LINK_REVERIFY_CRON,
  PROFILE_LINK_REVERIFY_QUEUE,
  registerProfileLinkReverifyCron,
} from '@/lib/profile-links/jobs.server';

describe('profile-link re-verification sweep', () => {
  it('schedules an hourly small batch on the jobs worker', async () => {
    const calls: string[] =
      [];
    let handler:
      | (() => Promise<void>)
      | undefined;
    const boss =
      {
        createQueue:
          vi.fn(
            async (
              name: string,
            ) =>
              void calls.push(
                `create ${name}`,
              ),
          ),
        schedule:
          vi.fn(
            async (
              name: string,
              cron: string,
            ) =>
              void calls.push(
                `schedule ${name} ${cron}`,
              ),
          ),
        work: vi.fn(
          async (
            name: string,
            fn: () => Promise<void>,
          ) => {
            calls.push(
              `work ${name}`,
            );
            handler =
              fn;
          },
        ),
      };

    await registerProfileLinkReverifyCron(
      boss as never,
    );

    // schedule() before work() is what lets the queue policy pick a poll interval.
    expect(
      calls,
    ).toEqual(
      [
        `create ${PROFILE_LINK_REVERIFY_QUEUE}`,
        `schedule ${PROFILE_LINK_REVERIFY_QUEUE} ${PROFILE_LINK_REVERIFY_CRON}`,
        `work ${PROFILE_LINK_REVERIFY_QUEUE}`,
      ],
    );

    await handler!();
    expect(
      reverifyStaleProfileLinks,
    ).toHaveBeenCalledWith(
      {
        batchSize:
          PROFILE_LINK_REVERIFY_BATCH,
      },
    );
  });
});
