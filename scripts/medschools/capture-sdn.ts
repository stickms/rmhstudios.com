/**
 * FINDINGS (Student Doctor Network feasibility spike, 2026-11-20). Consulted by Tasks 3-9.
 * Requests: 20 live GETs in total, cap 30: 18 of the planned kinds (2 robots, 3 RSS incl. 1 conditional re-GET, 2 listings
 * of node 1198, 2 prior-year redirect probes + 2 canonical prior-year listings, 4 thread pages incl. the page-999 probe,
 * 1 www school index, 2 summaries) plus 2 exploratory misses (a guessed www index URL and a school detail page). The session was
 * driven by a curl wrapper (sequential, 2 s apart, the sources.ts UA); the raw responses were cached outside the repo and
 * this script re-processed them (`--raw-dir`, no network) to write the sanitised fixtures. Its `--live` mode implements
 * the same 14 planned requests but was NOT run live (a second pass would exceed the 30-request cap).
 *
 * (a) ROBOTS. forums.studentdoctor.net/robots.txt (200): `User-agent: *` Allow `/`, `/threads/`, `/forums/`; Disallow
 *     /account/ /admin.php /ajax/ /conversations/ /find-threads/ /find-new/ /goto/ /job.php /login/ /logout/
 *     /lost-password/ /members/ /misc/ /online/ /profile-posts/ /recent-activity/ /register/ /search/ /watched/
 *     /whats-new/ /trophies/ /covers/; no Crawl-delay; Sitemap /sitemap.xml. So /forums/<id>/, /forums/<id>/index.rss and
 *     /threads/<slug>.<id>/(page-N) are ALLOWED for our UA; /goto/ and /members/ are not: quote blocks carry
 *     `/goto/post?id=` links and every post a /members/ link, so NEVER follow a link found in a post.
 *     www.studentdoctor.net/robots.txt (200): `User-agent: *` Allow `/`; Disallow /wp-admin/ (admin-ajax allowed), /ojs/,
 *     /review/; `Content-Signal: search=yes, ai-input=yes, ai-train=no`; no Crawl-delay. /schools-database/ is allowed.
 * (b) RSS. GET /forums/<id>/index.rss (numeric id redirects nowhere; it answered 200 directly): content-type
 *     application/rss+xml; always exactly 50 items, newest ACTIVITY first (item pubDate equals the listing's last-activity
 *     time for the same thread, e.g. 2026-11-20T10:35:39-0500 == `Fri, 20 Nov 2026 15:35:39 +0000`). pubDate is RFC-822
 *     with `+0000`. guid is `<guid isPermaLink="false">urn:xenforo:thread:<threadId></guid>`; `<link>` is the canonical
 *     thread URL `https://forums.studentdoctor.net/threads/<slug>.<id>/`. Per item: title, pubDate, link, guid, author
 *     (`invalid@example.com (name)`: a person, never read), category, dc:creator (person, never read), content:encoded
 *     (HTML of the OPENING post, ignored), slash:comments. slash:comments IS the reply count (the opening post is not
 *     counted): posts = comments + 1 (Mayo Clinic Arizona: 3 comments, 4 posts on the page; UTMB: 278 comments, 279
 *     posts = 5 full pages + 29 on page 6). CONDITIONAL GET DOES NOT WORK: no ETag header; `Last-Modified` is the
 *     response time (now), so If-Modified-Since never matched and the re-GET returned 200 with the full body. Cache-Control
 *     private, no-cache. Feeds carry only the latest 50 threads, so discovery of all ~170-250 threads must use the listing.
 *     The RSS contains no sticky/index threads (0 of 100 items).
 * (c) THREAD PAGE MARKUP (XenForo 2.3, logged-out view). 50 posts per page. Post = `article.message.message--post`
 *     (classes `js-post js-inlineModContainer`) with `data-author` (a handle: person), `data-content="post-<id>"`,
 *     `id="js-post-<id>"`, `itemid=".../posts/<id>/"`. Time: `.message-attribution-main time.u-dt[datetime]` is ISO-8601
 *     with a colon-less offset (`2026-11-05T22:31:44-0500`), plus `data-timestamp` (epoch seconds), `itemprop=datePublished`;
 *     use the attribution one, because an edited post has a second `time.u-dt` (`itemprop=dateModified`) in
 *     `div.message-lastEdit`, which sits OUTSIDE `div.bbWrapper` (after the message-userContent block). Body =
 *     `div[itemprop=text] > div.bbWrapper`; text uses `<br />`, entities (`&#039;`), `&nbsp;`; smilies are images. Quote =
 *     `blockquote.bbCodeBlock.bbCodeBlock--quote[data-quote=<handle>][data-source="post: <id>"][data-attributes="member: <id>"]`
 *     > `.bbCodeBlock-title a.bbCodeBlock-sourceJump` ("<handle> said:", href /goto/post?id=) + `.bbCodeBlock-content >
 *     .bbCodeBlock-expandContent` + `.bbCodeBlock-expandLink`; 31 of 50 posts on a mid-thread page quote someone (so quote
 *     stripping removes a large share of text), none nested in the real captures (nested handling is covered by the hostile
 *     fixture). Reactions: `.reactionsBar` (names; dropped). Signature: NO `.message-signature` in any of 83 guest-view posts,
 *     so its placement is unverified; thread-hostile.html puts one outside bbWrapper (XenForo's normal place), which the
 *     bbWrapper-only parser ignores. Ads (`.samCodeUnit`) sit between posts and are not articles. Pagination: head
 *     `link rel=prev/next`; `ul.pageNav-main li.pageNav-page > a` is WINDOWED (page 6 of 6 shows 1,4,5,6; page 3 shows 1-6),
 *     so lastPage = the largest number among `li.pageNav-page a`, confirmed by `.pageNavSimple-el--last` ("3 of 6" and
 *     `input.js-pageJumpPage[max]`). A single-page thread has NO pagination at all: lastPage = 1. Page 1's canonical is
 *     `/threads/<slug>.<id>/` (no page-1); page n's is `.../page-n`. Challenge/past-end pages: see (d), (e).
 * (d) PAST THE LAST PAGE. GET .../page-999 returns HTTP 303 with `Location: .../page-6` (the real last page) and an empty
 *     body; the polite client follows redirects (http.ts `redirect: 'follow'`), so the parser receives the LAST page with a
 *     canonical that differs from the requested URL (thread-past-end.html is that landing page, trimmed). A past-end request
 *     is therefore harmless but is not a termination signal: lastPage from the nav is still required, and a processor
 *     must stop at page >= lastPage. Numeric forum ids behave the same way: /forums/962/ and /forums/603/ answer 301 to the
 *     slugged URL (a numeric id costs one extra request unless the slug from sdn-forums.json is used).
 * (e) CLOUDFLARE. Every response came through Cloudflare (`server: cloudflare`, `cf-ray`); none was a challenge: no
 *     `cf-mitigated` header, no `Just a moment` title in any of the 20 bodies, no 403/429/503, no Retry-After and no
 *     ratelimit headers. CAUTION: every HTML body (forums and www) embeds the beacon `/cdn-cgi/challenge-platform/...`, so
 *     that string is NOT a challenge marker. Use `<title>Just a moment...`, `_cf_chl_opt`, and the `cf-mitigated: challenge`
 *     header; and "no posts / no rows / no channel" is a failure regardless. No 200-with-challenge was observed;
 *     thread-challenge.html is the synthetic 200 variant.
 * (f) LISTING (/forums/<slug>.<id>/ and .../page-N). Rows are `div.structItem.structItem--thread[data-author]` (also matched
 *     by ad wrappers, so a real row is one that has `.structItem-title a[data-tp-primary]`); thread link is that anchor
 *     (`/threads/<slug>.<id>/`, text = title); replies `.structItem-cell--meta dl.pairs > dt "Replies" + dd`: ABBREVIATED
 *     for big threads (`1K`, observed on node 962), so do not trust it above 999 (use RSS slash:comments or the thread nav);
 *     views abbreviated (`98K`); last activity `.structItem-cell--latest time.structItem-latestDate[datetime]` (ISO with
 *     colon-less offset); start date `li.structItem-startDate time`. Sticky = `.structItem-status--sticky` (3 on 1198 p1, all
 *     non-school: "2026-2027 Alphabetic Index of Allopathic School-Specific Discussion Threads" and the 2025-2026 one
 *     (both carry a cycle label! the title rule must exclude them: replies 0, sticky) and "Looking for Previous Years
 *     Threads?"). No prefix labels (`span.label`) appeared. Row order = last activity, newest first. 1198: 4 pages (page 1 =
 *     3 sticky + 50 threads, page 2 = 50, 4 pages in the nav => about 151-200 threads; pages 3-4 were not fetched);
 *     1199: not fetched as a listing (its RSS shows 50 items; the listing page count is unmeasured). Next = `link rel=next`
 *     and `a.pageNav-jump--next`. Page weight ~380-420 KB (ads/avatars) so listings are the costly requests.
 * (g) ARCHIVE. 962 ("MD Medical School-Specific Discussions Prior Years", slug md-medical-school-specific-discussions-prior-years,
 *     119 pages) and 603 ("Osteopathic Medical School Discussions Prior Years", slug
 *     osteopathic-medical-school-discussions-prior-years, 31 pages) are FLAT multi-year forums: no child forum nodes
 *     (`node--forum` count 0), threads from every year in one list, ordered by last activity (page 1 of 962 mixes
 *     2025-2026 x42, 2024-2025 x4, 2023-2024, 2022-2023, 2020-2021; 603 mixes 2025-2026 x46, 2017-2018 ... ), so
 *     cycleYear in sdn-forums.json `archive` is null and the cycle comes from each thread title. Title format:
 *     `YYYY-YYYY <School name>` (e.g. `2022-2023 Missouri, Kansas City`, `2025-2026 Michigan State`, DO:
 *     `2025-2026 Baptist University College of Osteopathic Medicine (BUCOM)`), plus unlabelled non-school stickies/threads
 *     ("Looking for the Current Year Threads?", "MSTP Program Secondaries - not received"): those must be skipped, not
 *     counted as alias misses. 962 has ~5,900 thread slots (119 pages x 50) and 603 ~1,500.
 * (h) SUMMARY PAGE. URL `https://www.studentdoctor.net/schools-database/medical-school/interview-feedback/summary/<CODE>/<slug>`
 *     (the plain `.../detail/<CODE>/<slug>` school page does NOT hold the reports). Inline JSON:
 *     `<script type="application/json" id="interview-feedback-data">[...]</script>` (JSON array, ASCII-escaped by PHP,
 *     Columbia 228 reports, ACOM 81). Keys on EVERY report: id (int), feedbackEra, feedbackEraRank, format, interviewType,
 *     interviewStyle, interviewLength, interviewerCount, stress, impression, selfAssessment, schoolRank, facilities,
 *     admissionsOffice, location, culturalLife, travelHours, travelMode, travelCost, airport, hotel, hotelRating,
 *     recommendHotel, questionsAsked, comments, reportUrl, searchText. ALL values are strings (ids are ints). Shapes seen:
 *     feedbackEra in {"Within the past 2 years","2 to 5 years ago","5 to 10 years ago","More than 10 years ago"} with
 *     feedbackEraRank (4 = oldest; dates are only age ranges); format in {"", "Virtual", "In Person"} (Columbia: all "");
 *     interviewType {"Open file","Closed file",""}; interviewStyle {"One-on-one","", ...}; interviewLength "<n> minutes"
 *     or "60+ minutes" (9 distinct); interviewerCount "1","2",..."6","?" or ""; stress "<n> / 10" or "" (12 values);
 *     impression "Positively \ud83d\ude42" | "No change \ud83d\ude10" | "Negatively \u2639\ufe0f" | "" (emoji suffix: map by
 *     prefix word). questionsAsked = ONE string, questions separated by blank lines ("\n\n"; some contain a final "None"
 *     line, 12 of 228 are empty, 1 contains "<", 3 contain ";"); no emails/URLs appeared. comments = free text (not stored).
 *     In-state is NOT in the array: it is only the rendered distribution card "What is your in-state status?" (rows
 *     `In state 18% 17` / `Out of state 82% 76`, "93 responses"), so parse that card's HTML (`.sdn-response-distribution`).
 *     No person-shaped key exists (no author/user/name/email/avatar key); the report-level identifiers are `id` and
 *     `reportUrl` (`.../survey/individual/<id>/response`, a per-report permalink) and `searchText` (a concatenation of the
 *     free text): all three must be dropped by the parser, as must `comments`, `hotel` and `airport` free text.
 *     ERA CAVEAT: Columbia's reports are 223 "More than 10 years ago" and 5 "5 to 10"; recent-era data is thin for old schools.
 * (i) SCHOOL INDEX. https://www.studentdoctor.net/schools-database/medical-school embeds
 *     `<script type="application/json" id="schools-database-data">{"format":"school-rows-v1","fields":[70 names],"rows":[[...]]}</script>`
 *     (rows are positional arrays; zip with fields). 263 schools: degrees MD 186, DO 68, "" 8, MDCM 1; country US 246, CA 17.
 *     Each row has `url` = https://www.studentdoctor.net/schools-database/medical-school/detail/<CODE>/<slug> (263/263 match),
 *     so school -> <CODE>/<slug> is that url's last two segments (Columbia = CUCPS/columbia-university-college-of-physicians-and-surgeons),
 *     plus abbr, name, city, stateAbr, degrees, and `forumsUrl` (237 rows; mostly a STALE 2025-2026 thread link: 232 are
 *     2025-2026, 5 are 2026-2027). `interviewFeedbackCount` is 0 on every row, so it cannot select schools with reports.
 * (j) MEASURED COST INPUTS (82 non-starter posts from 3 pages of one MD thread: UTMB p3, p6 and Mayo AZ; a convenience
 *     sample, not random). Posts per page 50 (last page 1-50). Stripped post (blockquote removed, tags stripped): mean 153
 *     chars, median 104, p90 ~350 => about 38 tokens (chars/4); the opening staff post is 1,787 chars. Posts passing the
 *     AMENDED prefilter (case-sensitive, with secondary|2ndary|secondaries) 49/82 = 60%; the verbatim spec regex 48/82 = 59%;
 *     with the `i` flag on everything 60/82 = 73% (`\bA\b` then matches the word "a"). Recall, hand-labelled: posts reporting
 *     the poster's own event at the thread's school (+1 IS II/A style, "I interviewed ...", "Secondary submitted ...") = 20 of 82.
 *     Verbatim spec drops 2 of 20 (10%: "Secondary submitted 07/24", "Submitted secondary and video on 6/27"); the amended
 *     filter drops 1 of 20 (5%: the capitalised "Secondary submitted ..."), because `secondary` is lowercase. FIX: match the
 *     secondary terms case-insensitively (`/secondar|2ndary/i`) and leave the II/A/R/WL terms case-sensitive => 0 of 20 missed.
 *     Not counted as events: "4 IIs right now (3 MD)" (aggregate, `IIs` also fails `\bII\b`), "I got a Pre-II R from TX A&M"
 *     (another school), "completed 7/17 with no response". Many positives are the shorthand "+1 IS II" / "+1 IS A": the
 *     model needs the glossary (IS = in-state, II = interview invite, A = acceptance, R = rejection, WL = waitlist; the rest
 *     of the shorthand, e.g. "LM 70", is not an event) in its prompt.
 * (k) COST, recomputed (DeepSeek peak rates as in the plan: $0.30/M miss, $0.006/M hit, $1.20/M out). Threads per cycle ~220
 *     stands (MD 151-200 from the nav + DO unmeasured). Posts per thread, from the RSS top-50 by activity on 2026-11-20 (mid
 *     cycle): MD mean 81 (median 68, max 279), DO mean 103 (median 83, max 363) => ~92 posts/thread now, so ~20k posts/cycle
 *     now; the plan's 300/thread is the end-of-cycle/prior-cycle case (66k). Survivors 60% (not 40%) => 12k now, 40k end-of-cycle.
 *     Batch of 12: uncached input ~12 x (38 tokens + ~15 ref/date overhead) + ~80 thread context = ~800 (not 1,800), cached system
 *     ~600, output ~250 (about 40% of survivors are events, ~35 tokens each + wrapper; not 540). Cost per call = 800 x 0.30/M +
 *     600 x 0.006/M + 250 x 1.20/M = $0.00024 + $0.0000036 + $0.0003 = ~$0.00055 (plan: $0.0012). Calls per cycle ~1,000 (now)
 *     to ~3,300 (end-of-cycle) => ~$0.55 to ~$1.8 peak-rate per cycle; full 10-cycle backfill ~$6 to ~$18 on the ledger (about half
 *     real spend off-peak). The plan's per-run caps and monthly budget stand; the estimate is ~2x lower than the plan's.
 *     Network cost: a full backfill walk is ~(962: 119 + 603: 31) listing pages (~400 KB each) + ~5-7 thread pages per
 *     archive thread, i.e. on the order of 10-15k page fetches at 2 s = 6-8 hours of polite spacing, not a LLM-budget problem.
 *
 * Usage:
 *   pnpm exec tsx scripts/medschools/capture-sdn.ts --raw-dir <dir> [--force]   re-process cached raw responses (no network)
 *   pnpm exec tsx scripts/medschools/capture-sdn.ts --live --raw-dir <dir> [--force]   fetch (<= 30 requests), cache raw, process
 * Politeness: sequential, >= 1.6 s apart (2 s on www), UA from sources.ts, hard cap 30 requests, never logs in,
 * never requests a robots-disallowed path. Raw responses are cached OUTSIDE the repo (--raw-dir) and are untrusted.
 * Nothing person-shaped is saved or printed.
 */
/* eslint-disable no-console -- a one-off capture script reports on stdout */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Aliases,
  assertClean,
  newCollected,
  sanitiseListingPage,
  sanitiseRss,
  sanitiseSchoolIndex,
  sanitiseSummaryPage,
  sanitiseThreadPage,
} from '../../features/medschools/scrape/adapters/sdn/fixture-sanitise';
import { SOURCES } from '../../features/medschools/scrape/sources';

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../features/medschools/scrape/adapters/sdn/__fixtures__',
);
const MAX_REQUESTS = 30;
const FORUMS = SOURCES.SDN_FORUMS;
const WWW = SOURCES.SDN_WWW;

interface Step {
  name: string;
  origin: string;
  path: string;
  headers?: Record<string, string>;
}

const THREAD_BUSY = '/threads/2026-2027-university-of-texas-medical-branch-sealy-school-of-medicine.1517862';
const MD = '/forums/2026-2027-md-medical-school-specific-discussions.1198/';
const SUMMARY = '/schools-database/medical-school/interview-feedback/summary';

/** The planned requests; the live run adds nothing else. (A real run also did two exploratory probes, see FINDINGS.) */
const STEPS: Step[] = [
  {
    name: 'forums-robots',
    origin: FORUMS.origin,
    path: '/robots.txt',
  },
  {
    name: 'www-robots',
    origin: WWW.origin,
    path: '/robots.txt',
  },
  {
    name: 'rss1198',
    origin: FORUMS.origin,
    path: '/forums/1198/index.rss',
  },
  {
    name: 'rss1199',
    origin: FORUMS.origin,
    path: '/forums/1199/index.rss',
  },
  {
    name: 'f1198p1',
    origin: FORUMS.origin,
    path: MD,
  },
  {
    name: 'f1198p2',
    origin: FORUMS.origin,
    path: `${MD}page-2`,
  },
  {
    name: 'f962c',
    origin: FORUMS.origin,
    path: '/forums/md-medical-school-specific-discussions-prior-years.962/',
  },
  {
    name: 'f603c',
    origin: FORUMS.origin,
    path: '/forums/osteopathic-medical-school-discussions-prior-years.603/',
  },
  {
    name: 'tsmall',
    origin: FORUMS.origin,
    path: '/threads/2026-2027-mayo-clinic-arizona.1517730/',
  },
  {
    name: 'tbusy',
    origin: FORUMS.origin,
    path: `${THREAD_BUSY}/page-6`,
  },
  {
    name: 'tq',
    origin: FORUMS.origin,
    path: `${THREAD_BUSY}/page-3`,
  },
  {
    name: 'wwwmed',
    origin: WWW.origin,
    path: '/schools-database/medical-school',
  },
  {
    name: 'sumcolfb',
    origin: WWW.origin,
    path: `${SUMMARY}/CUCPS/columbia-university-college-of-physicians-and-surgeons`,
  },
  {
    name: 'sumsmall',
    origin: WWW.origin,
    path: `${SUMMARY}/ACOM/alabama-college-of-osteopathic-medicine`,
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const force = args.includes('--force');
const live = args.includes('--live');
const rawDirArg = args[args.indexOf('--raw-dir') + 1];
if (!rawDirArg || rawDirArg.startsWith('--')) throw new Error('--raw-dir <dir> is required (outside the repo)');
const RAW = resolve(rawDirArg);
mkdirSync(RAW, {
  recursive: true,
});

let requests = 0;
async function fetchRaw(step: Step): Promise<void> {
  if (requests >= MAX_REQUESTS) throw new Error(`request cap ${MAX_REQUESTS} reached; aborting`);
  if (requests > 0) await sleep(step.origin === WWW.origin ? 2100 : 1600);
  requests += 1;
  const res = await fetch(step.origin + step.path, {
    headers: {
      'user-agent': FORUMS.userAgent,
      ...step.headers,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(FORUMS.timeoutMs),
  });
  const body = await res.text();
  writeFileSync(join(RAW, `${step.name}.body`), body);
  writeFileSync(
    join(RAW, `${step.name}.hdr`),
    `${res.status}\n${[...res.headers].map(([k, v]) => `${k}: ${v}`).join('\n')}\n`,
  );
}

const rawText = (name: string): string => {
  const p = join(RAW, `${name}.body`);
  if (!existsSync(p)) throw new Error(`missing raw response ${name}`);
  return readFileSync(p, 'utf8');
};

function write(name: string, body: string): void {
  const dest = join(FIXTURES, name);
  if (existsSync(dest) && !force) throw new Error(`${name} exists; pass --force`);
  writeFileSync(dest, body);
  console.log(`  ${name} (${body.length} bytes)`);
}

async function main(): Promise<void> {
  if (live) for (const s of STEPS) if (!existsSync(join(RAW, `${s.name}.body`)) || force) await fetchRaw(s);
  console.log(`${requests} requests`);
  mkdirSync(FIXTURES, {
    recursive: true,
  });

  const c = newCollected();
  // pass 1: collect every person-shaped value from every raw page, so each output is checked against all of them
  const outputs: Array<[string, () => string]> = [];
  const aliases = () => new Aliases();
  outputs.push(['forum-1198.rss', () => sanitiseRss(rawText('rss1198'), c, 8)]);
  outputs.push(['forum-1199.rss', () => sanitiseRss(rawText('rss1199'), c, 8)]);
  outputs.push([
    'forum-1198-p1.html',
    () =>
      sanitiseListingPage(rawText('f1198p1'), c, {
        maxRows: 10,
        aliases: aliases(),
      }),
  ]);
  outputs.push([
    'forum-1198-p2.html',
    () =>
      sanitiseListingPage(rawText('f1198p2'), c, {
        maxRows: 8,
        aliases: aliases(),
      }),
  ]);
  outputs.push([
    'forum-962-p1.html',
    () =>
      sanitiseListingPage(rawText('f962c'), c, {
        maxRows: 8,
        aliases: aliases(),
      }),
  ]);
  outputs.push([
    'forum-603-p1.html',
    () =>
      sanitiseListingPage(rawText('f603c'), c, {
        maxRows: 8,
        aliases: aliases(),
      }),
  ]);
  outputs.push([
    'thread-small-p1.html',
    () =>
      sanitiseThreadPage(rawText('tsmall'), c, {
        maxPosts: 12,
        pick: 'first',
      }),
  ]);
  outputs.push([
    'thread-busy-last.html',
    () =>
      sanitiseThreadPage(rawText('tbusy'), c, {
        maxPosts: 12,
        pick: 'last',
      }),
  ]);
  outputs.push([
    'thread-questions.html',
    () =>
      sanitiseThreadPage(rawText('tq'), c, {
        maxPosts: 12,
        pick: 'questions',
      }),
  ]);
  // GET .../page-999 answers 303 -> the last page; the polite client follows, so the parser sees the last page.
  outputs.push([
    'thread-past-end.html',
    () =>
      `<!-- response to GET ${THREAD_BUSY}/page-999 after following the 303 to .../page-6 -->\n${sanitiseThreadPage(rawText('tbusy'), c, { maxPosts: 3, pick: 'last' })}`,
  ]);
  outputs.push([
    'summary-columbia.html',
    () =>
      sanitiseSummaryPage(rawText('sumcolfb'), c, {
        maxReports: 12,
      }),
  ]);
  outputs.push([
    'summary-small.html',
    () =>
      sanitiseSummaryPage(rawText('sumsmall'), c, {
        maxReports: 12,
      }),
  ]);
  outputs.push([
    'school-index.html',
    () =>
      sanitiseSchoolIndex(rawText('wwwmed'), {
        maxRows: 12,
        mustInclude: ['CUCPS', 'ACOM'],
      }),
  ]);

  const built = outputs.map(([name, make]) => [name, make()] as const);
  for (const [name, body] of built) assertClean(name, body, c); // nothing is written unless every output is clean
  for (const [name, body] of built) write(name, body);
  console.log(
    `sanitised: 0 raw handles remain (${c.handles.size} collected, ${c.memberIds.size} member ids, ${c.avatars.size} avatars)`,
  );
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : 'failed');
  process.exit(1);
});
