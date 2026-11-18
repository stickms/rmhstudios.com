import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const db =
  vi.hoisted(
    () => ({
      blogFind:
        vi.fn(),
      blogMany:
        vi.fn(),
      hark: vi.fn(),
      harkCreate:
        vi.fn(),
      tx: vi.fn(),
      blogMany2:
        vi.fn(),
      audit:
        vi.fn(),
      userFind:
        vi.fn(),
      cached:
        vi.fn(),
    }),
  );
vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      {
        blogPost:
          {
            findUnique:
              db.blogFind,
            updateMany:
              db.blogMany,
            findMany:
              db.blogMany2,
          },
        adminAuditLog:
          {
            findFirst:
              db.audit,
          },
        rMHark:
          {
            findFirst:
              db.hark,
            create:
              db.harkCreate,
          },
        user: {
          update:
            vi.fn(),
          findUnique:
            db.userFind,
        },
        $transaction:
          db.tx,
      },
  }),
);
vi.mock(
  '@/lib/feed-sse',
  () => ({
    feedEventBus:
      {
        publishCreatedPost:
          vi.fn(),
      },
  }),
);
vi.mock(
  '@/lib/cached.server',
  () => ({
    cached:
      db.cached,
    invalidateCached:
      vi.fn(),
  }),
);
vi.mock(
  '@prisma/client',
  () => ({
    Prisma:
      {
        PrismaClientKnownRequestError: class extends Error {},
      },
  }),
);

import {
  applyAnnouncementFields,
  getCurrentAnnouncement,
} from '../sitewide-announcement.server';
import {
  ANNOUNCEMENT_DEFAULT_LIFETIME_DAYS,
  announcementExpiry,
  announcementVersion,
  isAnnouncementLive,
} from '../sitewide-announcement';
import { saveAnnouncementFieldsSchema } from '../sitewide-announcement-schema';
import {
  getBusiness,
  isBusinessId,
} from '../businesses';

const now =
  new Date(
    '2026-11-12T12:00:00Z',
  );
const earlier =
  new Date(
    '2026-11-01T00:00:00Z',
  );
const input =
  (
    o: Record<
      string,
      unknown
    > = {},
  ) =>
    saveAnnouncementFieldsSchema.parse(
      {
        announcement: true,
        ...o,
      },
    );

describe('applyAnnouncementFields', () => {
  it('new post with flag on is announced now', () => {
    const r =
      applyAnnouncementFields(
        null,
        input(),
        now,
      );
    expect(
      r.reannounced,
    ).toBe(
      true,
    );
    expect(
      r
        .data
        .announcedAt,
    ).toEqual(
      now,
    );
    expect(
      r
        .data
        .announcementExpiresAt,
    ).toBeNull();
  });
  it('false -> true re-announces', () => {
    const r =
      applyAnnouncementFields(
        {
          announcement: false,
          announcedAt:
            earlier,
        },
        input(),
        now,
      );
    expect(
      r.reannounced,
    ).toBe(
      true,
    );
    expect(
      r
        .data
        .announcedAt,
    ).toEqual(
      now,
    );
  });
  it('stays true keeps announcedAt', () => {
    const r =
      applyAnnouncementFields(
        {
          announcement: true,
          announcedAt:
            earlier,
        },
        input(),
        now,
      );
    expect(
      r.reannounced,
    ).toBe(
      false,
    );
    expect(
      r
        .data
        .announcedAt,
    ).toEqual(
      earlier,
    );
  });
  it('turning off keeps announcedAt', () => {
    const r =
      applyAnnouncementFields(
        {
          announcement: true,
          announcedAt:
            earlier,
        },
        input(
          {
            announcement: false,
          },
        ),
        now,
      );
    expect(
      r
        .data
        .announcement,
    ).toBe(
      false,
    );
    expect(
      r.reannounced,
    ).toBe(
      false,
    );
    expect(
      r
        .data
        .announcedAt,
    ).toEqual(
      earlier,
    );
  });
  it('stores explicit expiry', () => {
    const r =
      applyAnnouncementFields(
        null,
        input(
          {
            announcementExpiresAt:
              '2026-12-01T00:00:00Z',
          },
        ),
        now,
      );
    expect(
      r
        .data
        .announcementExpiresAt,
    ).toEqual(
      new Date(
        '2026-12-01T00:00:00Z',
      ),
    );
  });
});

describe('shared helpers', () => {
  it('expiry defaults and liveness', () => {
    const exp =
      announcementExpiry(
        earlier,
      );
    expect(
      exp.getTime() -
        earlier.getTime(),
    ).toBe(
      ANNOUNCEMENT_DEFAULT_LIFETIME_DAYS *
        86400000,
    );
    const explicit =
      new Date(
        '2026-11-05T00:00:00Z',
      );
    expect(
      announcementExpiry(
        earlier,
        explicit,
      ),
    ).toBe(
      explicit,
    );
    expect(
      isAnnouncementLive(
        {
          expiresAt:
            exp.toISOString(),
        },
        earlier.getTime(),
      ),
    ).toBe(
      true,
    );
    expect(
      isAnnouncementLive(
        {
          expiresAt:
            exp.toISOString(),
        },
        exp.getTime() +
          1,
      ),
    ).toBe(
      false,
    );
    expect(
      isAnnouncementLive(
        {
          expiresAt:
            'garbage',
        },
      ),
    ).toBe(
      false,
    );
  });
  it('version changes with announcedAt', () => {
    expect(
      announcementVersion(
        {
          id: 'a',
          announcedAt:
            'x',
        },
      ),
    ).not.toBe(
      announcementVersion(
        {
          id: 'a',
          announcedAt:
            'y',
        },
      ),
    );
  });
  it('schema validation', () => {
    expect(
      saveAnnouncementFieldsSchema.safeParse(
        {
          announcement: true,
          business:
            'nope',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      saveAnnouncementFieldsSchema.safeParse(
        {
          announcementExpiresAt:
            '',
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      saveAnnouncementFieldsSchema.safeParse(
        {
          announcementExpiresAt:
            null,
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      saveAnnouncementFieldsSchema.safeParse(
        {
          announcementExpiresAt:
            'tomorrow',
        },
      )
        .success,
    ).toBe(
      false,
    );
  });
  it('business fallback', () => {
    expect(
      isBusinessId(
        'rmh-capital',
      ),
    ).toBe(
      true,
    );
    expect(
      isBusinessId(
        'x',
      ),
    ).toBe(
      false,
    );
    expect(
      getBusiness(
        'x',
      )
        .id,
    ).toBe(
      'rmh-studios',
    );
    expect(
      getBusiness(
        null,
      )
        .id,
    ).toBe(
      'rmh-studios',
    );
  });
});

describe('getCurrentAnnouncement', () => {
  const row = {
    id: 'bf1',
    slug: 'slug-bf1',
    title: 'T',
    description: 'D',
    image: null,
    content: 'c',
    business: 'rmh',
    announcedAt: new Date('2026-11-13T00:00:00Z'),
    announcementExpiresAt: null,
    // A legacy announcer-authored RMHark: still in the column, never read.
    announcementPostId: 'legacy-rmhark',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockImplementation(() => Date.parse('2026-11-14T12:00:00Z'));
    db.cached.mockImplementation(async (_k: string, _t: number, loader: () => unknown) => loader());
  });

  it('returns the live announcement without a discussion post and creates no feed post', async () => {
    db.blogMany2.mockResolvedValue([row]);
    const r = await getCurrentAnnouncement();
    expect(r?.id).toBe('bf1');
    expect(r).not.toHaveProperty('discussionPostId');
    expect(db.harkCreate).not.toHaveBeenCalled();
    expect(db.hark).not.toHaveBeenCalled();
    expect(db.audit).not.toHaveBeenCalled();
  });
});
