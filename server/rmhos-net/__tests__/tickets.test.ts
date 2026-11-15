import {
  describe,
  expect,
  it,
} from 'vitest';
import { signNetTicket } from '@features/rmhos/engine/net-ticket.server';
import {
  IDLE_MS,
  MAX_AGE_MS,
  MAX_TICKETS,
  TicketBook,
} from '../tickets';

const SECRET =
  'ticket-book-secret';
const T0 = 1_700_000_000_000;

function book() {
  const clock =
    {
      t: T0,
    };
  return {
    clock,
    book: new TicketBook(
      SECRET,
      () =>
        clock.t,
    ),
  };
}

describe('TicketBook', () => {
  it('accepts a fresh ticket and the same ticket after its 60 s validity while it is in use', () => {
    const {
      clock,
      book: b,
    } =
      book();
    const ticket =
      signNetTicket(
        'u1',
        SECRET,
        T0,
      );
    expect(
      b.authorize(
        ticket,
      ),
    ).toEqual(
      {
        ok: true,
        userId:
          'u1',
        replaced: false,
      },
    );
    clock.t +=
      5 *
      60_000;
    expect(
      b.authorize(
        ticket,
      ),
    ).toMatchObject(
      {
        ok: true,
        userId:
          'u1',
      },
    );
    clock.t +=
      10 *
      60_000; // 10 min since the last use: still inside the idle window
    expect(
      b.authorize(
        ticket,
      ),
    ).toMatchObject(
      {
        ok: true,
      },
    );
  });

  it('refuses an expired ticket that was never presented', () => {
    const {
      clock,
      book: b,
    } =
      book();
    const ticket =
      signNetTicket(
        'u1',
        SECRET,
        T0,
      );
    clock.t += 61_000;
    expect(
      b.authorize(
        ticket,
      ),
    ).toEqual(
      {
        ok: false,
      },
    );
  });

  it('refuses a ticket idle for more than 15 minutes', () => {
    const {
      clock,
      book: b,
    } =
      book();
    const ticket =
      signNetTicket(
        'u1',
        SECRET,
        T0,
      );
    b.authorize(
      ticket,
    );
    clock.t +=
      IDLE_MS +
      1;
    expect(
      b.authorize(
        ticket,
      ),
    ).toEqual(
      {
        ok: false,
      },
    );
    // and it is gone, not merely refused once
    clock.t =
      T0 +
      1000;
    expect(
      b.size,
    ).toBe(
      0,
    );
  });

  it('relayed activity (touch) keeps an idle ticket alive', () => {
    const {
      clock,
      book: b,
    } =
      book();
    const ticket =
      signNetTicket(
        'u1',
        SECRET,
        T0,
      );
    b.authorize(
      ticket,
    );
    for (
      let i = 0;
      i <
      4;
      i++
    ) {
      clock.t +=
        10 *
        60_000;
      b.touch(
        'u1',
      );
    }
    expect(
      b.authorize(
        ticket,
      ),
    ).toMatchObject(
      {
        ok: true,
      },
    );
  });

  it('refuses a ticket older than 12 hours however busy it is', () => {
    const {
      clock,
      book: b,
    } =
      book();
    const ticket =
      signNetTicket(
        'u1',
        SECRET,
        T0,
      );
    b.authorize(
      ticket,
    );
    for (
      let spent = 0;
      spent <
      MAX_AGE_MS;
      spent +=
        10 *
        60_000
    ) {
      clock.t +=
        10 *
        60_000;
      expect(
        b.authorize(
          ticket,
        ),
      ).toMatchObject(
        {
          ok: true,
        },
      );
    }
    clock.t +=
      10 *
      60_000;
    expect(
      b.authorize(
        ticket,
      ),
    ).toEqual(
      {
        ok: false,
      },
    );
  });

  it('a second ticket for the same user replaces the first and reports it', () => {
    const {
      clock,
      book: b,
    } =
      book();
    const first =
      signNetTicket(
        'u1',
        SECRET,
        T0,
      );
    b.authorize(
      first,
    );
    clock.t += 30_000;
    const second =
      signNetTicket(
        'u1',
        SECRET,
        clock.t,
      );
    expect(
      b.authorize(
        second,
      ),
    ).toEqual(
      {
        ok: true,
        userId:
          'u1',
        replaced: true,
      },
    );
    expect(
      b.authorize(
        first,
      ),
    ).toEqual(
      {
        ok: false,
      },
    ); // evicted, and older, so it cannot come back
    expect(
      b.authorize(
        second,
      ),
    ).toMatchObject(
      {
        ok: true,
      },
    );
    expect(
      b.size,
    ).toBe(
      1,
    );
  });

  it('does not let one user evict another', () => {
    const {
      book: b,
    } =
      book();
    b.authorize(
      signNetTicket(
        'u1',
        SECRET,
        T0,
      ),
    );
    expect(
      b.authorize(
        signNetTicket(
          'u2',
          SECRET,
          T0,
        ),
      ),
    ).toMatchObject(
      {
        replaced: false,
      },
    );
    expect(
      b.size,
    ).toBe(
      2,
    );
  });

  it('never accepts a forged ticket, even when a prefix matches an active one', () => {
    const {
      clock,
      book: b,
    } =
      book();
    const real =
      signNetTicket(
        'u1',
        SECRET,
        T0,
      );
    b.authorize(
      real,
    );
    clock.t +=
      5 *
      60_000;
    const [
      id,
      exp,
      sig,
    ] =
      real.split(
        '.',
      ) as [
        string,
        string,
        string,
      ];
    const forgeries =
      [
        `${id}.${exp}.${sig.slice(0, -2)}AA`,
        `${id}.${exp}.${sig.slice(0, 10)}`,
        `${real}x`,
        `${real}.extra`,
        `${id}.${Number(exp) + 3_600_000}.${sig}`,
        `${Buffer.from('u2').toString('base64url')}.${exp}.${sig}`,
        signNetTicket(
          'u1',
          'another-secret',
          T0,
        ),
        real.slice(
          0,
          real.length -
            1,
        ),
        '',
      ];
    for (const f of forgeries)
      expect(
        b.authorize(
          f,
        ),
        f,
      ).toEqual(
        {
          ok: false,
        },
      );
  });

  it('is bounded: past the cap the entry with the oldest lastSeen goes', () => {
    const {
      clock,
      book: b,
    } =
      book();
    const first =
      signNetTicket(
        'user-0',
        SECRET,
        T0,
      );
    b.authorize(
      first,
    );
    for (
      let i = 1;
      i <
      MAX_TICKETS;
      i++
    ) {
      clock.t += 1;
      b.authorize(
        signNetTicket(
          `user-${i}`,
          SECRET,
          clock.t,
        ),
      );
    }
    expect(
      b.size,
    ).toBe(
      MAX_TICKETS,
    );
    clock.t += 1;
    b.authorize(
      signNetTicket(
        'one-more',
        SECRET,
        clock.t,
      ),
    );
    expect(
      b.size,
    ).toBe(
      MAX_TICKETS,
    );
    clock.t += 61_000; // past first's own validity, so only the table could still vouch for it
    expect(
      b.authorize(
        first,
      ),
    ).toEqual(
      {
        ok: false,
      },
    ); // user-0 was the oldest: evicted
  });

  it('prune drops idle and over-age entries only', () => {
    const {
      clock,
      book: b,
    } =
      book();
    b.authorize(
      signNetTicket(
        'idle',
        SECRET,
        T0,
      ),
    );
    clock.t +=
      IDLE_MS -
      1000;
    const live =
      signNetTicket(
        'live',
        SECRET,
        clock.t,
      );
    b.authorize(
      live,
    );
    clock.t += 2000;
    b.prune();
    expect(
      b.size,
    ).toBe(
      1,
    );
    expect(
      b.authorize(
        live,
      ),
    ).toMatchObject(
      {
        ok: true,
      },
    );
  });

  it('keeps no state outside the instance', () => {
    const a =
      book();
    const other =
      book();
    const ticket =
      signNetTicket(
        'u1',
        SECRET,
        T0,
      );
    a.book.authorize(
      ticket,
    );
    a.clock.t +=
      5 *
      60_000;
    other.clock.t +=
      5 *
      60_000;
    expect(
      a.book.authorize(
        ticket,
      ),
    ).toMatchObject(
      {
        ok: true,
      },
    );
    expect(
      other.book.authorize(
        ticket,
      ),
    ).toEqual(
      {
        ok: false,
      },
    );
  });
});

describe('TicketBook invalidation callbacks and refresh', () => {
  function watched(
    maxTickets?: number,
  ) {
    const clock =
      {
        t: T0,
      };
    const gone: string[] =
      [];
    const b =
      new TicketBook(
        SECRET,
        () =>
          clock.t,
        {
          ...(maxTickets !==
          undefined
            ? {
                maxTickets,
              }
            : {}),
          onInvalid:
            (
              u,
            ) =>
              gone.push(
                u,
              ),
        },
      );
    return {
      clock,
      b,
      gone,
    };
  }

  it('reports a user whose ticket went idle, was found past 12 h, or was swept by prune', () => {
    const {
      clock,
      b,
      gone,
    } =
      watched();
    const t1 =
      signNetTicket(
        'idle',
        SECRET,
        T0,
      );
    b.authorize(
      t1,
    );
    clock.t +=
      IDLE_MS +
      1;
    expect(
      b.authorize(
        t1,
      ),
    ).toEqual(
      {
        ok: false,
      },
    );
    expect(
      gone,
    ).toEqual(
      [
        'idle',
      ],
    );

    const t2 =
      signNetTicket(
        'old',
        SECRET,
        clock.t,
      );
    b.authorize(
      t2,
    );
    for (
      let spent = 0;
      spent <=
      MAX_AGE_MS;
      spent +=
        10 *
        60_000
    ) {
      clock.t +=
        10 *
        60_000;
      b.touch(
        'old',
      );
    }
    expect(
      b.valid(
        'old',
      ),
    ).toBe(
      false,
    );
    b.prune();
    expect(
      gone,
    ).toEqual(
      [
        'idle',
        'old',
      ],
    );
  });

  it('reports the user of a cap-evicted ticket, and not a superseded one', () => {
    const {
      clock,
      b,
      gone,
    } =
      watched(
        2,
      );
    b.authorize(
      signNetTicket(
        'a',
        SECRET,
        T0,
      ),
    );
    clock.t += 1;
    b.authorize(
      signNetTicket(
        'b',
        SECRET,
        clock.t,
      ),
    );
    clock.t += 1;
    b.authorize(
      signNetTicket(
        'c',
        SECRET,
        clock.t,
      ),
    ); // table full: a (oldest lastSeen) goes
    expect(
      gone,
    ).toEqual(
      [
        'a',
      ],
    );
    clock.t += 1;
    b.authorize(
      signNetTicket(
        'b',
        SECRET,
        clock.t,
      ),
    ); // supersedes b's own: the relay closes with 4000
    expect(
      gone,
    ).toEqual(
      [
        'a',
      ],
    );
  });

  it('status-style authorisation (refresh: false) does not keep a ticket alive', () => {
    const {
      clock,
      b,
    } =
      watched();
    const t =
      signNetTicket(
        'poller',
        SECRET,
        T0,
      );
    b.authorize(
      t,
    );
    for (
      let i = 0;
      i <
      6;
      i++
    ) {
      clock.t +=
        4 *
        60_000;
      if (
        i <
        3
      )
        expect(
          b.authorize(
            t,
            false,
          ),
        ).toMatchObject(
          {
            ok: true,
          },
        );
    }
    // 24 min after the last real use, however often it was asked about
    expect(
      b.authorize(
        t,
        false,
      ),
    ).toEqual(
      {
        ok: false,
      },
    );
  });

  it('valid() follows the same two windows', () => {
    const {
      clock,
      b,
    } =
      watched();
    expect(
      b.valid(
        'nobody',
      ),
    ).toBe(
      false,
    );
    b.authorize(
      signNetTicket(
        'v',
        SECRET,
        T0,
      ),
    );
    expect(
      b.valid(
        'v',
      ),
    ).toBe(
      true,
    );
    clock.t +=
      IDLE_MS +
      1;
    expect(
      b.valid(
        'v',
      ),
    ).toBe(
      false,
    );
  });
});
