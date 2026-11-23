/**
 * Admit.org school-forum reader, behind the polite host. This is the anonymization boundary for forum posts, like
 * `adapters/sdn/parse-thread.ts`:
 *
 *  - quotes are removed first and link unfurls dropped, then the text is redacted with the page's own handles;
 *  - the author's user id and display name are read only inside this module: the id is captured by the `eventKey`
 *    closure (it builds the SAME member key the tracker feed uses, so a member counts once whichever path saw them),
 *    the name becomes a redaction handle, and neither is returned, stored or logged;
 *  - the raw post id leaves only as a keyed hash (the cursor) or inside a per-post fallback key;
 *  - a post that is not the poster's own (a copy of an SDN post, see `isSdnMirror`) is dropped here, as an item that
 *    advances the cursor and carries no text and no key.
 */
import { parse } from 'node-html-parser';
import { z } from 'zod';
import { containsHandle, redactForModel } from '../../../engine/sdn-rules';
import type { MedEventType } from '../../../engine/types';
import type { PoliteClient } from '../../http';
import { ADMIT_GRAPHQL_PATH } from '../../sources';
import { FORUM_THREAD, FORUM_THREADS, type AdmitOperation } from './queries';
import { admitForumCursorHash, admitForumPostKey, admitMemberKey } from './member-key';
import { AdmitResponseError } from './client';

export const FORUM_PAGE_SIZE = 100;

/** One school's thread as the summary list reports it. */
export interface ForumThreadSummary {
  slug: string;
  commentCount: number;
  latestPostAt: Date | null;
}

/** A post in thread order. A mirrored post carries no text and no key (it only moves the cursor). */
export interface ForumPost {
  /** Keyed hash of the post id: the persisted cursor and the only trace of the id. */
  postHash: string;
  postedAt: Date;
  /** True when the post is a copy of someone else's (SDN) post: never extracted, never keyed. */
  mirrored: boolean;
  /** Quote-stripped, plain, redacted ('' for a mirrored post). */
  text: string;
  /**
   * Keys an event for `schoolId` and `cycleYear`: `hash(admit:author:<user id>:<schoolId>:<cycleYear>:<type>)` when the
   * post has a member (the same key the feed and the history write), else a per-post key. The id is captured here.
   */
  eventKey(type: MedEventType, schoolId: string, cycleYear: number, day: string): string;
}

export interface ForumPage {
  /** The thread's total post count as the server reports it. */
  commentCount: number;
  posts: ForumPost[];
  /** True when `text` contains a handle that appeared on this page. */
  containsHandle(text: string): boolean;
  /** Rows dropped for failing validation (counted, never fatal). */
  malformed: number;
}

export interface AdmitForumClient {
  /** Every school's thread for the cycle year (`year` = entry year - 1); pages until a short page. */
  listThreads(year: number): Promise<{ threads: ForumThreadSummary[]; malformed: number }>;
  /** Up to 100 posts from `offset` (oldest first). */
  fetchPosts(slug: string, year: number, offset: number): Promise<ForumPage>;
}

const threadsData = z.object({ getAllSchoolThreads: z.array(z.unknown()) });
const threadRow = z.object({
  comment_count: z.number().int().min(0),
  latest_post_date: z.string().nullish(),
  school: z.object({ slug: z.string().min(1) }),
});
const threadData = z.object({
  getSchoolThread: z.object({ comment_count: z.number().int().min(0), posts: z.array(z.unknown()).nullable() }),
});
const postRow = z.object({
  id: z.string().min(1),
  content: z.string().nullable(),
  created_at: z.string(),
  user: z
    .object({
      id: z.string().nullish(),
      public_display_name: z.string().nullish(),
      roles: z.array(z.string()).nullish(),
    })
    .nullish(),
});

/** Names that are not a member's handle: redacting them would shred the word "anonymous" in running text. */
const NOT_A_HANDLE = new Set(['anonymous', '[deleted]', 'deleted', 'unknown']);

const SDN_LINK_RE = /studentdoctor\.net\/(?:threads|posts|goto\/post)/i;
const SDN_BANNER_RE =
  /\b(?:originally\s+posted|cross-?posted|re-?posted|copied|mirrored|imported)\s+(?:on|from|at|via|by)\s+(?:the\s+)?(?:sdn|student\s*doctor)/i;
const MIRROR_ROLE_RE = /sdn|import|mirror/i;

/**
 * Admit's own thread type exposes no source field (probed 2026-11-23: no sdn, source, imported or external-id
 * column on a post or its user), so a copy of an SDN post cannot be recognised by a flag. Until one exists this is a
 * deliberately conservative content and shape check, and it fails closed (a post it flags is skipped, counted once as
 * `mirrored`): an SDN-style numeric post id, an import-ish role on the poster, an attribution banner, or a link to an
 * SDN thread or post (the poster is then pointing at someone else's words).
 */
export function isSdnMirror(post: { id: string; html: string; roles: readonly string[] }): boolean {
  if (/^\d+$/.test(post.id)) return true;
  if (post.roles.some((r) => MIRROR_ROLE_RE.test(r))) return true;
  return SDN_BANNER_RE.test(post.html) || SDN_LINK_RE.test(post.html);
}

/** HTML post content to plain redactable text: quotes and unfurl cards removed first, then block breaks to newlines. */
export function forumHtmlToText(html: string): string {
  const root = parse(`<x>${html}</x>`);
  for (const q of root.querySelectorAll('blockquote')) q.remove();
  for (const u of root.querySelectorAll('.bbCodeBlock--unfurl, .js-unfurl, [data-unfurl], [data-embed], iframe')) {
    u.remove();
  }
  const withBreaks = root.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|div|li|h\d)>/gi, '\n');
  return parse(`<x>${withBreaks}</x>`)
    .text.split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

const MAX_SUMMARY_PAGES = 10;

export function createAdmitForumClient(session: PoliteClient, opts: { secret: string }): AdmitForumClient {
  async function run<S extends z.ZodType>(
    op: AdmitOperation,
    variables: Record<string, unknown>,
    schema: S,
  ): Promise<z.output<S>> {
    const fail = (reason: string): never => {
      session.noteFailure(`${op.operationName}: ${reason}`);
      throw new AdmitResponseError(`${op.operationName}: ${reason}`);
    };
    const res = await session.post(
      ADMIT_GRAPHQL_PATH,
      JSON.stringify({ operationName: op.operationName, query: op.query, variables }),
    );
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500 && res.status !== 429)
        session.noteFailure(`${op.operationName}: HTTP ${res.status}`);
      throw new AdmitResponseError(`${op.operationName}: HTTP ${res.status || 'unavailable'}`);
    }
    let json: unknown;
    try {
      json = JSON.parse(res.body);
    } catch {
      return fail('response is not JSON');
    }
    const errors = (json as { errors?: unknown } | null)?.errors;
    if (Array.isArray(errors) && errors.length > 0) return fail('GraphQL errors');
    const parsed = z.object({ data: schema }).safeParse(json);
    if (!parsed.success) return fail('unexpected response shape');
    session.noteSuccess();
    return (parsed.data as { data: z.output<S> }).data;
  }

  return {
    async listThreads(year) {
      const bySlug = new Map<string, ForumThreadSummary>();
      let malformed = 0;
      for (let page = 0; page < MAX_SUMMARY_PAGES; page++) {
        const data = await run(
          FORUM_THREADS,
          { ...FORUM_THREADS.variables, year, limit: FORUM_PAGE_SIZE, offset: page * FORUM_PAGE_SIZE },
          threadsData,
        );
        const rows = data.getAllSchoolThreads;
        for (const raw of rows) {
          const r = threadRow.safeParse(raw);
          if (!r.success) {
            malformed++;
            continue;
          }
          const at = r.data.latest_post_date ? new Date(r.data.latest_post_date) : null;
          bySlug.set(r.data.school.slug, {
            slug: r.data.school.slug,
            commentCount: r.data.comment_count,
            latestPostAt: at && !Number.isNaN(at.getTime()) ? at : null,
          });
        }
        if (rows.length < FORUM_PAGE_SIZE) break;
      }
      return { threads: [...bySlug.values()], malformed };
    },

    async fetchPosts(slug, year, offset) {
      const data = await run(FORUM_THREAD, { slug, year, limit: FORUM_PAGE_SIZE, offset }, threadData);
      const thread = data.getSchoolThread;
      let malformed = 0;
      const rows: Array<z.output<typeof postRow>> = [];
      for (const raw of thread.posts ?? []) {
        const r = postRow.safeParse(raw);
        if (r.success) rows.push(r.data);
        else malformed++;
      }
      // Handles seen on the page: every named poster. In memory only; used to redact the texts.
      const handles = new Set<string>();
      for (const r of rows) {
        const name = r.user?.public_display_name?.trim();
        if (name && !NOT_A_HANDLE.has(name.toLowerCase())) handles.add(name);
      }
      const posts: ForumPost[] = [];
      for (const r of rows) {
        const at = new Date(r.created_at);
        if (Number.isNaN(at.getTime())) {
          malformed++;
          continue;
        }
        const postHash = admitForumCursorHash(opts.secret, r.id);
        const html = r.content ?? '';
        if (isSdnMirror({ id: r.id, html, roles: r.user?.roles ?? [] })) {
          posts.push({ postHash, postedAt: at, mirrored: true, text: '', eventKey: skipKey });
          continue;
        }
        const authorId = r.user?.id ? r.user.id : null;
        const postId = r.id;
        posts.push({
          postHash,
          postedAt: at,
          mirrored: false,
          text: redactForModel(forumHtmlToText(html), handles),
          eventKey: (type, schoolId, cycleYear, day) =>
            authorId === null
              ? admitForumPostKey(opts.secret, postId, type, day)
              : admitMemberKey(opts.secret, authorId, schoolId, cycleYear, type),
        });
      }
      return {
        commentCount: thread.comment_count,
        posts,
        containsHandle: (text: string) => containsHandle(text, handles),
        malformed,
      };
    },
  };
}

function skipKey(): string {
  throw new Error('a mirrored post has no event key');
}
