-- Demo content for a recorded old build (scripts/site-archive). Invented people, neutral posts.
--
-- The schema changed many times between January and November 2026, so nothing here names a column the
-- table might not have: seed_row(table, jsonb) inserts only the keys that exist as columns, and gives every
-- NOT NULL column without a default a plain value of its type. Tables that do not exist are skipped.

CREATE OR REPLACE FUNCTION pg_temp.seed_row(tbl text, data jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  cols text := '';
  vals text := '';
  c record;
  v text;
BEGIN
  IF to_regclass(format('public.%I', tbl)) IS NULL THEN RETURN; END IF;
  FOR c IN
    SELECT column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = tbl
  LOOP
    IF data ? c.column_name THEN
      v := data ->> c.column_name;
      v := CASE WHEN v IS NULL THEN 'NULL' WHEN v LIKE 'sql:%' THEN substr(v, 5) ELSE quote_literal(v) END;
    ELSIF c.is_nullable = 'NO' AND c.column_default IS NULL THEN
      v := CASE
        WHEN c.data_type IN ('integer', 'bigint', 'smallint', 'numeric', 'double precision', 'real') THEN '0'
        WHEN c.data_type = 'boolean' THEN 'false'
        WHEN c.data_type LIKE 'timestamp%' OR c.data_type = 'date' THEN 'now()'
        WHEN c.data_type IN ('json', 'jsonb') THEN '''{}'''
        WHEN c.data_type = 'ARRAY' THEN '''{}'''
        WHEN c.data_type = 'USER-DEFINED' THEN
          quote_literal((SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                         WHERE t.typname = c.udt_name ORDER BY e.enumsortorder LIMIT 1))
        ELSE quote_literal(c.column_name || '-' || substr(md5(random()::text), 1, 8))
      END;
    ELSE
      CONTINUE;
    END IF;
    cols := cols || CASE WHEN cols = '' THEN '' ELSE ',' END || quote_ident(c.column_name);
    vals := vals || CASE WHEN vals = '' THEN '' ELSE ',' END || '(' || v || ')::' ||
      CASE WHEN c.data_type = 'USER-DEFINED' THEN quote_ident(c.udt_name)
           WHEN c.data_type = 'ARRAY' THEN quote_ident(c.udt_name)
           ELSE c.data_type END;
  END LOOP;
  IF cols <> '' THEN
    BEGIN
      EXECUTE format('INSERT INTO %I (%s) VALUES (%s) ON CONFLICT DO NOTHING', tbl, cols, vals);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'seed % skipped: %', tbl, SQLERRM;
    END;
  END IF;
END $$;

DO $$
DECLARE
  people jsonb := '[
    ["u1","Pixel Fern","pixelfern","Level designer. Neon Driftway enjoyer.",90],
    ["u2","Orbit Kai","orbitkai","Speedrunning everything.",80],
    ["u3","Mossy Lantern","mossylantern","Lo-fi playlists and puzzle games.",70],
    ["u4","Juno Static","junostatic","Building small web toys.",60],
    ["u5","Tidepool Theo","tidepooltheo","RMHBox host most nights.",50],
    ["u6","Quill and Byte","quillbyte","Writes about games and code.",40],
    ["demo","Archive Visitor","archivevisitor","A demo account for the site history recordings.",30]
  ]';
  posts jsonb := '[
    ["r01","u1","Shipped three new levels for Neon Driftway tonight. The last one has a loop you can only clear at full boost.",12,24,5,3,310],
    ["r02","u5","Anyone up for an RMHBox lobby at 9? Bringing the trivia pack.",41,11,7,1,190],
    ["r03","u3","Which soundtrack should I loop while studying this week?",60,18,9,0,240],
    ["r04","u2","New personal best on Slice It. Pretty sure the second section skip is the whole trick.",120,32,4,2,420],
    ["r05","u4","Made a tiny weather page in about a minute. Typing a sentence and getting a working page still feels like cheating.",180,27,6,4,380],
    ["r06","u6","Wrote up some notes on how the daily puzzle picks its difficulty curve.",300,9,2,1,150],
    ["r07","u1","Rainy evening, lights off, Temple of Joy on the big screen. Good night.",420,15,3,0,200],
    ["r08","u5","Thanks to everyone who joined last night. Final scoreboard was ridiculously close.",540,21,8,2,260],
    ["r09","u3","Reminder that the ladder resets on Monday. Get your games in.",840,12,1,3,170],
    ["r10","u2","Coffee, keyboard, and a fresh typing session. Hit 112 wpm on the classic text.",1200,19,3,1,230]
  ]';
  p jsonb;
BEGIN
  FOR p IN SELECT * FROM jsonb_array_elements(people) LOOP
    PERFORM pg_temp.seed_row('user', jsonb_build_object(
      'id', p->>0, 'name', p->>1, 'handle', p->>2, 'username', p->>2, 'displayUsername', p->>1,
      'email', (p->>2) || '@example.test', 'emailVerified', 'true',
      'createdAt', 'sql:now() - interval ''' || (p->>4) || ' days''', 'updatedAt', 'sql:now()'));
    PERFORM pg_temp.seed_row('user_profile', jsonb_build_object(
      'id', 'p' || (p->>0), 'userId', p->>0, 'displayName', p->>1, 'bio', p->>3, 'handle', p->>2,
      'createdAt', 'sql:now()', 'updatedAt', 'sql:now()'));
  END LOOP;
  FOR p IN SELECT * FROM jsonb_array_elements(posts) LOOP
    PERFORM pg_temp.seed_row('rmheet', jsonb_build_object(
      'id', p->>0, 'userId', p->>1, 'content', p->>2,
      'createdAt', 'sql:now() - interval ''' || (p->>3) || ' minutes''', 'updatedAt', 'sql:now()',
      'likeCount', p->>4, 'commentCount', p->>5, 'repostCount', p->>6, 'viewCount', p->>7));
  END LOOP;
  PERFORM pg_temp.seed_row('rmheet_poll', '{"id":"poll1","rmheetId":"r03","question":"Study soundtrack this week?","createdAt":"sql:now()"}');
  PERFORM pg_temp.seed_row('rmheet_poll_option', '{"id":"o1","pollId":"poll1","text":"Neon Driftway OST","position":"0","voteCount":"1"}');
  PERFORM pg_temp.seed_row('rmheet_poll_option', '{"id":"o2","pollId":"poll1","text":"Temple of Joy ambience","position":"1","voteCount":"1"}');
  PERFORM pg_temp.seed_row('rmheet_poll_option', '{"id":"o3","pollId":"poll1","text":"Lo-fi radio","position":"2","voteCount":"3"}');
  PERFORM pg_temp.seed_row('rmheet_poll_vote', '{"id":"v1","optionId":"o1","userId":"u1","pollId":"poll1"}');
  PERFORM pg_temp.seed_row('rmheet_poll_vote', '{"id":"v2","optionId":"o3","userId":"u2","pollId":"poll1"}');
  PERFORM pg_temp.seed_row('rmheet_poll_vote', '{"id":"v3","optionId":"o3","userId":"u4","pollId":"poll1"}');
  PERFORM pg_temp.seed_row('rmheet_poll_vote', '{"id":"v4","optionId":"o2","userId":"u5","pollId":"poll1"}');
  PERFORM pg_temp.seed_row('rmheet_poll_vote', '{"id":"v5","optionId":"o3","userId":"u6","pollId":"poll1"}');
  -- A few likes and follows so counts derived from rows (rather than stored counters) are not all zero.
  PERFORM pg_temp.seed_row('rmheet_like', jsonb_build_object('id', 'l' || i, 'rmheetId', 'r0' || (1 + i % 9), 'userId', 'u' || (1 + i % 6), 'createdAt', 'sql:now()'))
    FROM generate_series(1, 30) i;
  PERFORM pg_temp.seed_row('follow', jsonb_build_object('id', 'f' || i, 'followerId', 'u' || (1 + i % 6), 'followingId', 'u' || (1 + (i + 1) % 6), 'createdAt', 'sql:now()'))
    FROM generate_series(1, 12) i;
END $$;

-- A session for the demo account, used when a recording needs to be signed in (games that sat behind sign-in).
-- record.mjs is given the signed cookie for this token (sign-cookie.mjs).
DO $$ BEGIN PERFORM pg_temp.seed_row('session', jsonb_build_object(
  'id', 'demo-session', 'token', 'site-archive-demo-session-token', 'userId', 'demo',
  'expiresAt', 'sql:now() + interval ''30 days''', 'createdAt', 'sql:now()', 'updatedAt', 'sql:now()')); END $$;
