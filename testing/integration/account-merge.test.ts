/**
 * Account consolidation, end to end (lib/auth/consolidation.server.ts; design:
 * docs/superpowers/specs/2026-11-16-account-consolidation-design.md).
 *
 * A new, empty account B may hand its sign-in methods to an existing account A
 * and be closed. These run the real endpoints against a real database, and pin
 * the attacks the flow exists to stop:
 *  - an attacker who starts a merge cannot have a victim's browser finish it;
 *  - a session that already existed when the merge started cannot finish it;
 *  - a finished merge cannot be replayed;
 *  - an account with history is never offered it;
 *  - nobody can sign up as a provider's placeholder address;
 *  - an old session cannot change sign-in methods.
 *
 * B is made a "Steam-only" account by rewriting its credential row, since the
 * suite has no Steam. Four sign-ups in total, inside the 10-per-minute budget.
 */
import {
  afterAll,
  describe,
  expect,
  it,
} from 'vitest';
import {
  Client,
  PASSWORD,
  closeDb,
  db,
  signUp,
  uniqueEmail,
} from './lib/client';

afterAll(
  closeDb,
);

const STEAM_ID = `7656119${Math.floor(
  Math.random() *
    1e10,
)
  .toString()
  .padStart(
    10,
    '0',
  )}`;

/** Copy only the merge cookie from one jar to another. */
function mergeCookie(
  from: Client,
): Record<
  string,
  string
> {
  return Object.fromEntries(
    Object.entries(
      from.cookies,
    ).filter(
      ([
        name,
      ]) =>
        name.includes(
          'account_merge',
        ),
    ),
  );
}

describe('account consolidation', () => {
  it('refuses an email/password sign-up as a placeholder address', async () => {
    const squatter =
      new Client();
    const res =
      await squatter.post(
        '/api/auth/sign-up/email',
        {
          email: `${STEAM_ID}@steam.placeholder.invalid`,
          password:
            PASSWORD,
          name: 'Squatter',
        },
      );
    expect(
      res.status,
    ).toBe(
      400,
    );
    expect(
      squatter.hasSession,
    ).toBe(
      false,
    );
  });

  it('never offers the merge to an account with history', async () => {
    const busy =
      await signUp(
        'merge-history',
      );
    await db().query(
      `update account set "providerId" = 'discord', "accountId" = $2, password = null where "userId" = $1`,
      [
        busy.id,
        `d-${Date.now()}`,
      ],
    );
    expect(
      (
        await busy.client.post(
          '/api/rmharks',
          {
            content:
              'I have history now',
          },
        )
      )
        .status,
    ).toBe(
      201,
    );

    const eligibility =
      await busy.client.get(
        '/api/auth/account-merge/eligibility',
      );
    expect(
      eligibility.body,
    ).toEqual(
      {
        eligible: false,
        reason:
          'has_history',
      },
    );
    const start =
      await busy.client.post(
        '/api/auth/account-merge/start',
        {},
      );
    expect(
      start.status,
    ).toBe(
      400,
    );
  });

  it('joins an empty account to an existing one, and only from the browser that started it', async () => {
    const a =
      await signUp(
        'merge-target',
      );
    const b =
      await signUp(
        'merge-source',
      );
    // B signs in only with Steam and has a placeholder address, like a real
    // Steam sign-up.
    await db().query(
      `update account set "providerId" = 'steam', "accountId" = $2, password = null where "userId" = $1`,
      [
        b.id,
        STEAM_ID,
      ],
    );
    await db().query(
      `update "user" set email = $2, "emailVerified" = false where id = $1`,
      [
        b.id,
        `${STEAM_ID}@steam.placeholder.invalid`,
      ],
    );

    expect(
      (
        await b.client.get(
          '/api/auth/account-merge/eligibility',
        )
      )
        .body,
    ).toEqual(
      {
        eligible: true,
        methods:
          [
            'steam',
          ],
      },
    );

    // A is signed in somewhere else before the merge starts.
    const victimBrowser =
      new Client();
    expect(
      (
        await victimBrowser.post(
          '/api/auth/sign-in/email',
          {
            email:
              a.email,
            password:
              PASSWORD,
          },
        )
      )
        .status,
    ).toBe(
      200,
    );

    // B starts: every session of B ends, and this browser holds the intent.
    const start =
      await b.client.post(
        '/api/auth/account-merge/start',
        {},
      );
    expect(
      start.status,
    ).toBe(
      200,
    );
    expect(
      b
        .client
        .hasSession,
    ).toBe(
      false,
    );
    expect(
      Object.keys(
        mergeCookie(
          b.client,
        ),
      ),
    ).toHaveLength(
      1,
    );
    const {
      rows: bSessions,
    } =
      await db().query(
        'select count(*)::int as n from session where "userId" = $1',
        [
          b.id,
        ],
      );
    expect(
      bSessions[0]
        .n,
    ).toBe(
      0,
    );

    // Attack 1: a browser that did not start the merge finds nothing to confirm.
    expect(
      (
        await victimBrowser.get(
          '/api/auth/account-merge/pending',
        )
      )
        .body,
    ).toEqual(
      {
        pending:
          null,
      },
    );
    const forged =
      await victimBrowser.post(
        '/api/auth/account-merge/confirm',
        {},
      );
    expect(
      forged.status,
    ).toBe(
      400,
    );
    expect(
      forged
        .body
        .code,
    ).toBe(
      'MERGE_NO_INTENT',
    );

    // Attack 2: the intent's cookie next to a session that already existed when
    // the merge started is refused.
    const sharedBrowser =
      new Client(
        {
          ...victimBrowser.cookies,
          ...mergeCookie(
            b.client,
          ),
        },
      );
    const stale =
      await sharedBrowser.post(
        '/api/auth/account-merge/confirm',
        {},
      );
    expect(
      stale.status,
    ).toBe(
      403,
    );
    expect(
      stale
        .body
        .code,
    ).toBe(
      'SESSION_NOT_FRESH',
    );

    let {
      rows,
    } =
      await db().query(
        `select "userId" from account where "providerId" = 'steam' and "accountId" = $1`,
        [
          STEAM_ID,
        ],
      );
    expect(
      rows[0]
        .userId,
    ).toBe(
      b.id,
    );

    // The real flow: the same browser signs in to A, sees what will move, confirms.
    expect(
      (
        await b.client.post(
          '/api/auth/sign-in/email',
          {
            email:
              a.email,
            password:
              PASSWORD,
          },
        )
      )
        .status,
    ).toBe(
      200,
    );
    const pending =
      await b.client.get(
        '/api/auth/account-merge/pending',
      );
    expect(
      pending
        .body
        .pending
        .methods,
    ).toEqual(
      [
        'steam',
      ],
    );

    const confirm =
      await b.client.post(
        '/api/auth/account-merge/confirm',
        {},
      );
    expect(
      confirm.status,
    ).toBe(
      200,
    );
    expect(
      confirm.body,
    ).toEqual(
      {
        ok: true,
        moved:
          [
            'steam',
          ],
      },
    );

    ({
      rows,
    } =
      await db().query(
        `select "userId" from account where "providerId" = 'steam' and "accountId" = $1`,
        [
          STEAM_ID,
        ],
      ));
    expect(
      rows[0]
        .userId,
    ).toBe(
      a.id,
    );
    const gone =
      await db().query(
        'select count(*)::int as n from "user" where id = $1',
        [
          b.id,
        ],
      );
    expect(
      gone
        .rows[0]
        .n,
    ).toBe(
      0,
    );
    const audit =
      await db().query(
        `select count(*)::int as n from admin_audit_log where "adminId" = $1 and action = 'account.merge' and "targetId" = $2`,
        [
          a.id,
          b.id,
        ],
      );
    expect(
      audit
        .rows[0]
        .n,
    ).toBe(
      1,
    );

    // Single use: confirming again finds nothing.
    const replay =
      await b.client.post(
        '/api/auth/account-merge/confirm',
        {},
      );
    expect(
      replay.status,
    ).toBe(
      400,
    );

    // A session older than the recent-sign-in window cannot change sign-in methods.
    await db().query(
      `update session set "createdAt" = now() - interval '11 minutes' where "userId" = $1`,
      [
        a.id,
      ],
    );
    const {
      rows: accountRows,
    } =
      await db().query(
        `select id from account where "userId" = $1 and "providerId" = 'steam'`,
        [
          a.id,
        ],
      );
    const unlink =
      await b.client.post(
        '/api/auth/unlink-account',
        {
          accountId:
            accountRows[0]
              .id,
        },
      );
    expect(
      unlink.status,
    ).toBe(
      403,
    );
    expect(
      unlink
        .body
        .code,
    ).toBe(
      'SESSION_NOT_FRESH',
    );
  });

  it('keeps a placeholder address out of change-email', async () => {
    const owner =
      await signUp(
        'merge-email',
      );
    const res =
      await owner.client.post(
        '/api/auth/change-email',
        {
          newEmail: `${STEAM_ID}1@steam.placeholder.invalid`,
        },
      );
    expect(
      res.status,
    ).toBe(
      400,
    );
    const {
      rows,
    } =
      await db().query(
        'select email from "user" where id = $1',
        [
          owner.id,
        ],
      );
    expect(
      rows[0]
        .email,
    ).toBe(
      owner.email,
    );
    expect(
      uniqueEmail(
        'x',
      ),
    ).not.toContain(
      'placeholder',
    );
  });
});
