/* eslint-disable @typescript-eslint/no-explicit-any -- structural fake rows */
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * Offers are personal: another member's application or offer answers 404, Accept
 * withdraws only the applications ticked, a revision is kept only when an amount
 * changes, and a deadline sets the follow-up the existing reminders read.
 * Prisma is an in-memory fake; no database is touched.
 */

type Row =
  Record<
    string,
    any
  >;

const db =
  vi.hoisted(
    () => ({
      applications:
        [] as Array<
          Record<
            string,
            unknown
          >
        >,
      offers:
        [] as Array<
          Record<
            string,
            unknown
          >
        >,
      events:
        [] as Array<
          Record<
            string,
            unknown
          >
        >,
      seq: 0,
    }),
  );

const prismaMock =
  vi.hoisted(
    () => {
      const m =
        (
          row: Row,
          where: Row,
        ): boolean =>
          Object.entries(
            where,
          ).every(
            ([
              key,
              want,
            ]) => {
              if (
                want &&
                typeof want ===
                  'object' &&
                !(
                  want instanceof
                  Date
                )
              ) {
                if (
                  'in' in
                  want
                )
                  return (
                    want.in as unknown[]
                  ).includes(
                    row[
                      key
                    ],
                  );
                if (
                  'notIn' in
                  want
                )
                  return !(
                    want.notIn as unknown[]
                  ).includes(
                    row[
                      key
                    ],
                  );
              }
              return (
                row[
                  key
                ] ===
                want
              );
            },
          );
      const job =
        (
          a: Row,
        ) => ({
          id: a.id,
          followUpDate:
            a.followUpDate,
          job: {
            title: `Role ${a.id}`,
            payMinAnnual:
              null,
            payMaxAnnual:
              null,
            payCurrency:
              null,
            company:
              {
                name: `Co ${a.id}`,
              },
          },
        });
      const withApp =
        (
          o: Row,
        ) => ({
          ...o,
          application:
            job(
              db.applications.find(
                (
                  a,
                ) =>
                  a.id ===
                  o.applicationId,
              )!,
            ),
        });
      return {
        ladderApplication:
          {
            findFirst:
              async ({
                where,
              }: {
                where: Row;
              }) => {
                const row =
                  db.applications.find(
                    (
                      a,
                    ) =>
                      m(
                        a,
                        where,
                      ),
                  );
                if (
                  !row
                )
                  return null;
                const offer =
                  db.offers.find(
                    (
                      o,
                    ) =>
                      o.applicationId ===
                      row.id,
                  );
                return {
                  id: row.id,
                  followUpDate:
                    row.followUpDate,
                  offer:
                    offer
                      ? {
                          id: offer.id,
                        }
                      : null,
                };
              },
            findMany:
              async ({
                where,
              }: {
                where: Row;
              }) =>
                db.applications
                  .filter(
                    (
                      a,
                    ) =>
                      m(
                        a,
                        where,
                      ),
                  )
                  .map(
                    (
                      a,
                    ) => ({
                      id: a.id,
                      status:
                        a.status,
                    }),
                  ),
            update:
              async ({
                where,
                data,
              }: {
                where: Row;
                data: Row;
              }) => {
                const row =
                  db.applications.find(
                    (
                      a,
                    ) =>
                      a.id ===
                      where.id,
                  )!;
                Object.assign(
                  row,
                  data,
                );
                return {
                  id: row.id,
                };
              },
            updateMany:
              async ({
                where,
                data,
              }: {
                where: Row;
                data: Row;
              }) => {
                const rows =
                  db.applications.filter(
                    (
                      a,
                    ) =>
                      m(
                        a,
                        where,
                      ),
                  );
                rows.forEach(
                  (
                    row,
                  ) =>
                    Object.assign(
                      row,
                      data,
                    ),
                );
                return {
                  count:
                    rows.length,
                };
              },
          },
        ladderOffer:
          {
            findFirst:
              async ({
                where,
              }: {
                where: Row;
              }) => {
                const row =
                  db.offers.find(
                    (
                      o,
                    ) =>
                      m(
                        o,
                        where,
                      ),
                  );
                return row
                  ? withApp(
                      row,
                    )
                  : null;
              },
            count:
              async ({
                where,
              }: {
                where: Row;
              }) =>
                db.offers.filter(
                  (
                    o,
                  ) =>
                    m(
                      o,
                      where,
                    ),
                )
                  .length,
            create:
              async ({
                data,
              }: {
                data: Row;
              }) => {
                const row =
                  {
                    id: `offer-${++db.seq}`,
                    state:
                      'open',
                    revisions:
                      [],
                    createdAt:
                      new Date(
                        '2026-11-01T00:00:00Z',
                      ),
                    updatedAt:
                      new Date(
                        '2026-11-01T00:00:00Z',
                      ),
                    ...data,
                  };
                db.offers.push(
                  row,
                );
                return withApp(
                  row,
                );
              },
            update:
              async ({
                where,
                data,
              }: {
                where: Row;
                data: Row;
              }) => {
                const row =
                  db.offers.find(
                    (
                      o,
                    ) =>
                      o.id ===
                      where.id,
                  )!;
                Object.assign(
                  row,
                  data,
                );
                return withApp(
                  row,
                );
              },
            updateMany:
              async ({
                where,
                data,
              }: {
                where: Row;
                data: Row;
              }) => {
                const rows =
                  db.offers.filter(
                    (
                      o,
                    ) =>
                      m(
                        o,
                        where,
                      ),
                  );
                rows.forEach(
                  (
                    row,
                  ) =>
                    Object.assign(
                      row,
                      data,
                    ),
                );
                return {
                  count:
                    rows.length,
                };
              },
            deleteMany:
              async ({
                where,
              }: {
                where: Row;
              }) => {
                const before =
                  db
                    .offers
                    .length;
                db.offers =
                  db.offers.filter(
                    (
                      o,
                    ) =>
                      !m(
                        o,
                        where,
                      ),
                  );
                return {
                  count:
                    before -
                    db
                      .offers
                      .length,
                };
              },
          },
        ladderApplicationEvent:
          {
            create:
              async ({
                data,
              }: {
                data: Row;
              }) => {
                db.events.push(
                  data,
                );
                return data;
              },
            createMany:
              async ({
                data,
              }: {
                data: Row[];
              }) => {
                db.events.push(
                  ...data,
                );
                return {
                  count:
                    data.length,
                };
              },
          },
        $transaction:
          async (
            ops: Promise<unknown>[],
          ) =>
            Promise.all(
              ops,
            ),
      };
    },
  );
vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      prismaMock,
  }),
);

import {
  decideOffer,
  deleteOffer,
  recordOffer,
  updateOffer,
} from '@/lib/rmhladder/offers.server';

const NOW =
  new Date(
    '2026-11-10T12:00:00Z',
  );

const baseBody =
  {
    applicationId:
      'app-1',
    currency:
      'USD' as const,
    basePay:
      '9000000',
    payPeriod:
      'year' as const,
    hoursPerWeek:
      null,
    bonusAmount:
      null,
    bonusPercent:
      null,
    signOn:
      null,
    equityGrant:
      null,
    equityYears:
      null,
    equityNote:
      null,
    location:
      null,
    remote:
      null,
    ptoDays:
      null,
    startDate:
      null,
    deadline:
      null,
    notes:
      null,
  };

const status =
  (
    id: string,
  ) =>
    db.applications.find(
      (
        a,
      ) =>
        a.id ===
        id,
    )!
      .status;
const followUp =
  (
    id: string,
  ) =>
    db.applications.find(
      (
        a,
      ) =>
        a.id ===
        id,
    )!
      .followUpDate;
type Ok<
  T,
> =
  {
    ok: true;
    value: T;
  };

beforeEach(
  () => {
    db.seq = 0;
    db.offers =
      [];
    db.events =
      [];
    db.applications =
      [
        {
          id: 'app-1',
          userId:
            'me',
          status:
            'offer',
          followUpDate:
            null,
          outcome:
            null,
        },
        {
          id: 'app-2',
          userId:
            'me',
          status:
            'interviewing',
          followUpDate:
            null,
        },
        {
          id: 'app-3',
          userId:
            'me',
          status:
            'applied',
          followUpDate:
            null,
        },
        {
          id: 'app-4',
          userId:
            'me',
          status:
            'withdrawn',
          followUpDate:
            null,
        },
        {
          id: 'theirs',
          userId:
            'other',
          status:
            'offer',
          followUpDate:
            null,
        },
      ];
  },
);

describe('ownership', () => {
  it('records no offer on another member’s application', async () => {
    const result =
      await recordOffer(
        'me',
        {
          ...baseBody,
          applicationId:
            'theirs',
        },
        NOW,
      );
    expect(
      result,
    ).toMatchObject(
      {
        ok: false,
        status: 404,
      },
    );
    expect(
      db.offers,
    ).toHaveLength(
      0,
    );
  });

  it('answers 404 for another member’s offer on edit, decide and delete', async () => {
    const theirs =
      await recordOffer(
        'other',
        {
          ...baseBody,
          applicationId:
            'theirs',
        },
        NOW,
      );
    expect(
      theirs.ok,
    ).toBe(
      true,
    );
    const id =
      (
        theirs as Ok<{
          id: string;
        }>
      )
        .value
        .id;

    expect(
      await updateOffer(
        'me',
        id,
        {
          notes:
            'x',
        },
        NOW,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 404,
      },
    );
    expect(
      await decideOffer(
        'me',
        id,
        {
          decision:
            'accept',
          withdrawApplicationIds:
            [
              'app-2',
            ],
        },
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 404,
      },
    );
    expect(
      await deleteOffer(
        'me',
        id,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 404,
      },
    );
    expect(
      db.offers,
    ).toHaveLength(
      1,
    );
    expect(
      status(
        'app-2',
      ),
    ).toBe(
      'interviewing',
    );
  });

  it('allows one offer per application', async () => {
    await recordOffer(
      'me',
      baseBody,
      NOW,
    );
    expect(
      await recordOffer(
        'me',
        baseBody,
        NOW,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 409,
      },
    );
  });

  it('rejects hourly pay without hours and a bonus given twice', async () => {
    expect(
      await recordOffer(
        'me',
        {
          ...baseBody,
          payPeriod:
            'hour',
        },
        NOW,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 400,
      },
    );
    expect(
      await recordOffer(
        'me',
        {
          ...baseBody,
          bonusAmount:
            '100',
          bonusPercent: 5,
        },
        NOW,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 400,
      },
    );
  });
});

describe('accept', () => {
  async function recorded() {
    return (
      (await recordOffer(
        'me',
        baseBody,
        NOW,
      )) as Ok<{
        id: string;
      }>
    )
      .value
      .id;
  }

  it('withdraws only the ticked applications', async () => {
    const id =
      await recorded();
    const result =
      await decideOffer(
        'me',
        id,
        {
          decision:
            'accept',
          withdrawApplicationIds:
            [
              'app-2',
            ],
        },
      );
    expect(
      result,
    ).toMatchObject(
      {
        ok: true,
        value:
          {
            withdrawn: 1,
            offer:
              {
                state:
                  'accepted',
              },
          },
      },
    );
    expect(
      status(
        'app-2',
      ),
    ).toBe(
      'withdrawn',
    );
    expect(
      status(
        'app-3',
      ),
    ).toBe(
      'applied',
    );
    expect(
      db.applications.find(
        (
          a,
        ) =>
          a.id ===
          'app-1',
      ),
    ).toMatchObject(
      {
        status:
          'offer',
        outcome:
          'accepted',
      },
    );
  });

  it('withdraws nothing when nothing is ticked', async () => {
    const id =
      await recorded();
    const result =
      await decideOffer(
        'me',
        id,
        {
          decision:
            'accept',
          withdrawApplicationIds:
            [],
        },
      );
    expect(
      result,
    ).toMatchObject(
      {
        ok: true,
        value:
          {
            withdrawn: 0,
          },
      },
    );
    expect(
      db.applications.map(
        (
          a,
        ) =>
          a.status,
      ),
    ).toEqual(
      [
        'offer',
        'interviewing',
        'applied',
        'withdrawn',
        'offer',
      ],
    );
  });

  it('never withdraws another member’s application, the accepted one, or a closed one', async () => {
    const id =
      await recorded();
    const result =
      await decideOffer(
        'me',
        id,
        {
          decision:
            'accept',
          withdrawApplicationIds:
            [
              'theirs',
              'app-1',
              'app-4',
            ],
        },
      );
    expect(
      result,
    ).toMatchObject(
      {
        ok: true,
        value:
          {
            withdrawn: 0,
          },
      },
    );
    expect(
      status(
        'theirs',
      ),
    ).toBe(
      'offer',
    );
    expect(
      status(
        'app-1',
      ),
    ).toBe(
      'offer',
    );
  });

  it('declines the offer of a withdrawn application and refuses to decide twice', async () => {
    const id =
      await recorded();
    db.applications.find(
      (
        a,
      ) =>
        a.id ===
        'app-2',
    )!.status =
      'offer';
    await recordOffer(
      'me',
      {
        ...baseBody,
        applicationId:
          'app-2',
      },
      NOW,
    );
    await decideOffer(
      'me',
      id,
      {
        decision:
          'accept',
        withdrawApplicationIds:
          [
            'app-2',
          ],
      },
    );
    expect(
      db.offers.find(
        (
          o,
        ) =>
          o.applicationId ===
          'app-2',
      )!
        .state,
    ).toBe(
      'declined',
    );
    expect(
      await decideOffer(
        'me',
        id,
        {
          decision:
            'decline',
          withdrawApplicationIds:
            [],
        },
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 409,
      },
    );
  });

  it('refuses to edit a decided offer', async () => {
    const id =
      await recorded();
    await decideOffer(
      'me',
      id,
      {
        decision:
          'decline',
        withdrawApplicationIds:
          [],
      },
    );
    expect(
      await updateOffer(
        'me',
        id,
        {
          notes:
            'x',
        },
        NOW,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 409,
      },
    );
  });

  it('decline marks only the offer', async () => {
    const id =
      await recorded();
    const result =
      await decideOffer(
        'me',
        id,
        {
          decision:
            'decline',
          withdrawApplicationIds:
            [
              'app-2',
            ],
        },
      );
    expect(
      result,
    ).toMatchObject(
      {
        ok: true,
        value:
          {
            offer:
              {
                state:
                  'declined',
              },
            withdrawn: 0,
          },
      },
    );
    expect(
      status(
        'app-2',
      ),
    ).toBe(
      'interviewing',
    );
  });
});

describe('revisions', () => {
  async function recorded() {
    return (
      (await recordOffer(
        'me',
        baseBody,
        NOW,
      )) as Ok<{
        id: string;
      }>
    )
      .value
      .id;
  }

  it('stores the previous amounts when an amount changes', async () => {
    const id =
      await recorded();
    const result =
      await updateOffer(
        'me',
        id,
        {
          basePay:
            '9500000',
        },
        NOW,
      );
    const offer =
      (
        result as unknown as Ok<{
          revisions: Array<{
            at: string;
            previous: Record<
              string,
              unknown
            >;
          }>;
          basePay: string;
        }>
      )
        .value;
    expect(
      offer.basePay,
    ).toBe(
      '9500000',
    );
    expect(
      offer.revisions,
    ).toHaveLength(
      1,
    );
    expect(
      offer
        .revisions[0],
    ).toMatchObject(
      {
        at: NOW.toISOString(),
        previous:
          {
            basePay:
              '9000000',
            currency:
              'USD',
          },
      },
    );
  });

  it('stores no revision when only notes, location or paid time off change', async () => {
    const id =
      await recorded();
    const result =
      await updateOffer(
        'me',
        id,
        {
          notes:
            'asked about relocation',
          location:
            'Austin',
          ptoDays: 20,
        },
        NOW,
      );
    expect(
      (
        result as Ok<{
          revisions: unknown[];
        }>
      )
        .value
        .revisions,
    ).toHaveLength(
      0,
    );
  });

  it('stores no revision when an amount is sent unchanged', async () => {
    const id =
      await recorded();
    const result =
      await updateOffer(
        'me',
        id,
        {
          basePay:
            '9000000',
          currency:
            'USD',
        },
        NOW,
      );
    expect(
      (
        result as Ok<{
          revisions: unknown[];
        }>
      )
        .value
        .revisions,
    ).toHaveLength(
      0,
    );
  });

  it('refuses a patch that leaves hourly pay without hours', async () => {
    const id =
      await recorded();
    expect(
      await updateOffer(
        'me',
        id,
        {
          payPeriod:
            'hour',
        },
        NOW,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 400,
      },
    );
  });
});

describe('deadline and follow-up', () => {
  it('sets the follow-up to the day before the deadline', async () => {
    await recordOffer(
      'me',
      {
        ...baseBody,
        deadline:
          '2026-11-20',
      },
      NOW,
    );
    expect(
      followUp(
        'app-1',
      ),
    ).toEqual(
      new Date(
        '2026-11-19T00:00:00Z',
      ),
    );
  });

  it('keeps an earlier follow-up the member already set', async () => {
    const earlier =
      new Date(
        '2026-11-15T00:00:00Z',
      );
    db.applications.find(
      (
        a,
      ) =>
        a.id ===
        'app-1',
    )!.followUpDate =
      earlier;
    await recordOffer(
      'me',
      {
        ...baseBody,
        deadline:
          '2026-11-20',
      },
      NOW,
    );
    expect(
      followUp(
        'app-1',
      ),
    ).toEqual(
      earlier,
    );
  });

  it('replaces a later follow-up, and one that has already passed, when the deadline is edited', async () => {
    db.applications.find(
      (
        a,
      ) =>
        a.id ===
        'app-1',
    )!.followUpDate =
      new Date(
        '2026-12-01T00:00:00Z',
      );
    await recordOffer(
      'me',
      {
        ...baseBody,
        deadline:
          '2026-11-20',
      },
      NOW,
    );
    expect(
      followUp(
        'app-1',
      ),
    ).toEqual(
      new Date(
        '2026-11-19T00:00:00Z',
      ),
    );

    db.applications.find(
      (
        a,
      ) =>
        a.id ===
        'app-2',
    )!.followUpDate =
      new Date(
        '2026-10-01T00:00:00Z',
      );
    const created =
      (await recordOffer(
        'me',
        {
          ...baseBody,
          applicationId:
            'app-2',
        },
        NOW,
      )) as Ok<{
        id: string;
      }>;
    await updateOffer(
      'me',
      created
        .value
        .id,
      {
        deadline:
          '2026-11-25',
      },
      NOW,
    );
    expect(
      followUp(
        'app-2',
      ),
    ).toEqual(
      new Date(
        '2026-11-24T00:00:00Z',
      ),
    );
  });

  it('never sets a follow-up in the past', async () => {
    await recordOffer(
      'me',
      {
        ...baseBody,
        deadline:
          '2026-11-10',
      },
      NOW,
    );
    expect(
      followUp(
        'app-1',
      ),
    ).toEqual(
      new Date(
        '2026-11-10T00:00:00Z',
      ),
    );
  });

  it('leaves the follow-up alone when there is no deadline', async () => {
    await recordOffer(
      'me',
      baseBody,
      NOW,
    );
    expect(
      followUp(
        'app-1',
      ),
    ).toBeNull();
  });
});
