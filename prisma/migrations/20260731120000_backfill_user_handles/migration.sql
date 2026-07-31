-- Backfill @handles for every account that never got one.
--
-- `user.handle` is what @mentions resolve against and what /u/<handle> routes
-- on, but it is nullable and was only auto-assigned from the Better Auth
-- `user.create` hook added later (lib/auth.ts). Every account that predates
-- that hook — plus anyone whose assignment lost a race — has NULL, and a NULL
-- handle means the account is invisible to mention autocomplete
-- (/api/feed/mention-search filters `handle IS NOT NULL`) and renders no
-- @handle anywhere in the UI. This makes those accounts mentionable.
--
-- Deliberately NOT backfilled: rows tombstoned by POST /api/account/delete,
-- which anonymizes a user by nulling its handle. Handing one back out would
-- make a deleted account mentionable and searchable again.
--
-- Rules mirror lib/handle.ts (`deriveHandleBase` + `suffixHandle`), which stays
-- the source of truth: lowercase, fold common accents, everything outside
-- [a-z0-9_] becomes `_`, collapse and trim underscores, prefix `u` unless it
-- starts with a letter, cap the base at 15 chars, then append `_NNNN` on
-- collision. `scripts/backfill-handles.ts` is the re-runnable TypeScript
-- equivalent for development databases, which use `prisma db push` and so
-- never execute this file.

DO $$
DECLARE
  r         RECORD;
  base      TEXT;
  candidate TEXT;
  attempt   INT;
  -- Snapshot of RESERVED_HANDLES in lib/handle.ts at the time of writing.
  reserved  TEXT[] := ARRAY[
    'admin','api','auth','login','signup','register','settings','profile',
    'post','messages','notifications','search','explore','help','about',
    'terms','privacy','support','feedback','rmh','rmhstudios','mod',
    'moderator','system','null','undefined','home','feed','builds','games',
    'blog','research','news'
  ];
BEGIN
  FOR r IN
    SELECT id, name, username
    FROM "user"
    WHERE handle IS NULL
      AND ("banReason" IS NULL OR "banReason" <> 'account_deleted')
    ORDER BY "createdAt"
  LOOP
    base := lower(coalesce(nullif(btrim(r.username), ''), nullif(btrim(r.name), ''), ''));
    base := translate(
      base,
      'àáâãäåèéêëìíîïòóôõöùúûüýÿñçß',
      'aaaaaaeeeeiiiiooooouuuuyyncs'
    );
    base := regexp_replace(base, '[^a-z0-9_]', '_', 'g');
    base := regexp_replace(base, '_+', '_', 'g');
    base := btrim(base, '_');
    IF base !~ '^[a-z]' THEN
      base := 'u' || base;
    END IF;
    base := regexp_replace(left(base, 15), '_+$', '');

    candidate := base;
    attempt := 0;

    LOOP
      EXIT WHEN candidate ~ '^[a-z][a-z0-9_]{2,19}$'
            AND NOT (candidate = ANY (reserved))
            AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u.handle = candidate);

      attempt := attempt + 1;
      EXIT WHEN attempt > 20;

      IF attempt <= 8 THEN
        -- `alice` -> `alice_4821`
        candidate := base || '_' || lpad(((random() * 8999)::INT + 1000)::TEXT, 4, '0');
      ELSE
        -- Base is hopeless (or absurdly contended): drop it entirely.
        candidate := 'u' || left(md5(random()::TEXT || r.id), 16);
      END IF;
    END LOOP;

    -- Ran out of attempts: leave the NULL for `pnpm handles:backfill` rather
    -- than write something invalid or fail the deploy.
    CONTINUE WHEN attempt > 20;

    UPDATE "user" SET handle = candidate WHERE id = r.id;
  END LOOP;
END $$;
