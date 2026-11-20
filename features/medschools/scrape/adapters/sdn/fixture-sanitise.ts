/**
 * Fixture sanitiser for the SDN capture script. It turns a real Student Doctor Network response into a fixture that
 * carries the real markup but no person: every author, display name, member id, avatar and post id is replaced by a
 * stable synthetic placeholder, post bodies are redacted, and the output is re-scanned for every raw value that was
 * collected. `assertClean` throwing means nothing may be written.
 *
 * Nothing here logs a collected value; errors name only the fixture and the kind of value.
 */
import {
  HTMLElement,
  parse,
  TextNode,
  type Node,
} from 'node-html-parser';

const SYNTH_BASE =
  'https://forums.studentdoctor.net';
const OWN_POST_BASE = 9_000_001;
const QUOTED_POST_BASE = 9_500_001;
const AVATAR_PLACEHOLDER =
  '/styles/default/xenforo/avatars/avatar_placeholder.png';

/** Everything the sanitiser has seen that must not survive into a fixture. */
export interface Collected {
  /** Lower-cased handles (data-author, usernames, mention text, quote attributions, dc:creator). */
  handles: Set<string>;
  /** Numeric member ids from /members/<name>.<id>/, data-user-id and data-attributes. */
  memberIds: Set<string>;
  /** Avatar image URLs, verbatim. */
  avatars: Set<string>;
  /** Raw post ids. */
  postIds: Set<string>;
}

export function newCollected(): Collected {
  return {
    handles:
      new Set(),
    memberIds:
      new Set(),
    avatars:
      new Set(),
    postIds:
      new Set(),
  };
}

/** One synthetic identity per distinct raw handle, numbered in order of first sight. */
export class Aliases {
  private readonly byHandle =
    new Map<
      string,
      number
    >();
  private readonly postIds =
    new Map<
      string,
      number
    >();
  private ownPosts = 0;
  private quotedPosts = 0;

  /** 1-based index of a handle. */
  index(
    handle: string,
  ): number {
    const key =
      handle
        .trim()
        .toLowerCase();
    let n =
      this.byHandle.get(
        key,
      );
    if (
      n ===
      undefined
    ) {
      n =
        this
          .byHandle
          .size +
        1;
      this.byHandle.set(
        key,
        n,
      );
    }
    return n;
  }

  author(
    handle: string,
  ): string {
    return `author-${String(this.index(handle)).padStart(3, '0')}`;
  }

  user(
    handle: string,
  ): string {
    return `user-${String(this.index(handle)).padStart(3, '0')}`;
  }

  memberPath(
    handle: string,
  ): string {
    const n =
      this.index(
        handle,
      );
    return `/members/user-${String(n).padStart(3, '0')}.${n}/`;
  }

  /** Synthetic id for a raw post id; ids of kept posts and of quoted posts live in separate ranges. */
  postId(
    raw: string,
    kept: boolean,
  ): string {
    const known =
      this.postIds.get(
        raw,
      );
    if (
      known !==
      undefined
    )
      return String(
        known,
      );
    const next =
      kept
        ? OWN_POST_BASE +
          this
            .ownPosts++
        : QUOTED_POST_BASE +
          this
            .quotedPosts++;
    this.postIds.set(
      raw,
      next,
    );
    return String(
      next,
    );
  }

  /** Raw post id -> synthetic id for every id seen. */
  get postIdMap(): ReadonlyMap<
    string,
    number
  > {
    return this
      .postIds;
  }
}

const EMAIL =
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_RE =
  /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
const MENTION =
  /(^|[^\w@])@([A-Za-z0-9_.-]{2,})/g;
const PHONE =
  /(?<!\d)(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?!\d)/g;

const escapeRe =
  (
    s: string,
  ) =>
    s.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );

/** Handles shorter than this are not scanned as bare words (they would match ordinary text). */
const MIN_BARE_HANDLE = 4;

/**
 * A few accounts are named like ordinary words that also sit in public page chrome ("Student Doctor Network").
 * They are replaced wherever they occur structurally (data-author, member links, quote titles, mentions) but never
 * as bare running text, which would corrupt the page and could not identify anyone anyway.
 */
const ORDINARY_WORDS =
  new Set(
    [
      'doctor',
      'student',
      'network',
      'medical',
      'medicine',
      'school',
      'forums',
      'admin',
    ],
  );

function handleRegex(
  handles: Set<string>,
): RegExp | null {
  const list =
    [
      ...handles,
    ]
      .filter(
        (
          h,
        ) =>
          h.length >=
            MIN_BARE_HANDLE &&
          !ORDINARY_WORDS.has(
            h,
          ),
      )
      .sort(
        (
          a,
          b,
        ) =>
          b.length -
          a.length,
      );
  if (
    list.length ===
    0
  )
    return null;
  return new RegExp(
    `(?<![A-Za-z0-9_])(?:${list.map(escapeRe).join('|')})(?![A-Za-z0-9_])`,
    'gi',
  );
}

/**
 * Replaces emails, phone numbers, URLs, @mentions and every collected handle in running text.
 * The replacements are inert placeholders, never derived from the removed value.
 */
export function redactForFixture(
  text: string,
  c: Collected,
  aliases?: Aliases,
): string {
  let out =
    text.replace(
      EMAIL,
      'person@example.invalid',
    );
  out =
    out.replace(
      URL_RE,
      'https://example.invalid/link',
    );
  out =
    out.replace(
      PHONE,
      '000-000-0000',
    );
  out =
    out.replace(
      MENTION,
      (
        _m,
        pre: string,
        name: string,
      ) => {
        c.handles.add(
          name.toLowerCase(),
        );
        return `${pre}@${aliases ? aliases.user(name) : 'user-901'}`;
      },
    );
  const re =
    handleRegex(
      c.handles,
    );
  if (
    re
  )
    out =
      out.replace(
        re,
        (
          h,
        ) =>
          aliases
            ? aliases.user(
                h,
              )
            : 'user-902',
      );
  return out;
}

function addHandle(
  c: Collected,
  value:
    | string
    | undefined
    | null,
): void {
  const v =
    (
      value ??
      ''
    )
      .replace(
        /^@/,
        '',
      )
      .trim()
      .toLowerCase();
  if (
    v.length >
    0
  )
    c.handles.add(
      v,
    );
}

function memberFromHref(
  href: string,
  c: Collected,
):
  | string
  | null {
  const m =
    /\/members\/([^/.]*(?:\.[^/.]*)*?)\.(\d+)\/?/.exec(
      href,
    );
  if (
    !m
  )
    return null;
  const [
    ,
    slug,
    id,
  ] =
    m;
  if (
    id
  )
    c.memberIds.add(
      id,
    );
  if (
    slug
  )
    addHandle(
      c,
      decodeURIComponent(
        slug,
      ).replace(
        /-/g,
        ' ',
      ),
    );
  if (
    slug
  )
    addHandle(
      c,
      slug,
    );
  return (
    slug ??
    null
  );
}

function isElement(
  n: Node,
): n is HTMLElement {
  return (
    n instanceof
    HTMLElement
  );
}

function walkText(
  node: Node,
  fn: (
    t: TextNode,
  ) => void,
): void {
  for (const child of node.childNodes) {
    if (
      child instanceof
      TextNode
    )
      fn(
        child,
      );
    else if (
      isElement(
        child,
      )
    ) {
      const tag =
        child.rawTagName?.toLowerCase();
      if (
        tag ===
          'script' ||
        tag ===
          'style'
      )
        continue;
      walkText(
        child,
        fn,
      );
    }
  }
}

const num =
  (
    re: RegExp,
    s: string,
  ): string[] =>
    [
      ...s.matchAll(
        re,
      ),
    ].map(
      (
        m,
      ) =>
        m[1] ??
        '',
    );

/** Collects every person-shaped value on a XenForo page before any rewriting happens. */
export function collectFromXenforo(
  root: HTMLElement,
  c: Collected,
): void {
  for (const el of root.querySelectorAll(
    '[data-author]',
  ))
    addHandle(
      c,
      el.getAttribute(
        'data-author',
      ),
    );
  for (const el of root.querySelectorAll(
    '[data-quote]',
  ))
    addHandle(
      c,
      el.getAttribute(
        'data-quote',
      ),
    );
  for (const el of root.querySelectorAll(
    '[data-user-id]',
  )) {
    const id =
      el.getAttribute(
        'data-user-id',
      );
    if (
      id
    )
      c.memberIds.add(
        id,
      );
  }
  for (const el of root.querySelectorAll(
    '[data-attributes]',
  )) {
    for (const id of num(
      /member:\s*(\d+)/g,
      el.getAttribute(
        'data-attributes',
      ) ??
        '',
    ))
      if (
        id
      )
        c.memberIds.add(
          id,
        );
  }
  for (const el of root.querySelectorAll(
    'a',
  )) {
    const href =
      el.getAttribute(
        'href',
      ) ??
      '';
    memberFromHref(
      href,
      c,
    );
    if (
      el.classList.contains(
        'username',
      )
    )
      addHandle(
        c,
        el.text,
      );
  }
  for (const el of root.querySelectorAll(
    '.message-name, .username, [itemprop="name"]',
  )) {
    if (
      el.closest(
        '.message-user',
      ) ||
      el.classList.contains(
        'username',
      )
    )
      addHandle(
        c,
        el.text,
      );
  }
  for (const el of root.querySelectorAll(
    '.bbCodeBlock-sourceJump',
  )) {
    addHandle(
      c,
      el.text.replace(
        /\s+said:?\s*$/i,
        '',
      ),
    );
  }
  for (const el of root.querySelectorAll(
    'img',
  )) {
    const alt =
      el.getAttribute(
        'alt',
      );
    const cls =
      el.getAttribute(
        'class',
      ) ??
      '';
    if (
      /avatar/i.test(
        cls,
      )
    ) {
      addHandle(
        c,
        alt,
      );
      for (const k of [
        'src',
        'srcset',
        'data-src',
      ]) {
        const v =
          el.getAttribute(
            k,
          );
        if (
          v
        )
          for (const part of v.split(
            ',',
          ))
            c.avatars.add(
              part
                .trim()
                .split(
                  /\s+/,
                )[0] ??
                '',
            );
      }
    }
  }
  for (const el of root.querySelectorAll(
    '[aria-label]',
  )) {
    if (
      (
        el.getAttribute(
          'class',
        ) ??
        ''
      ).match(
        /avatar-u\d+/,
      )
    )
      addHandle(
        c,
        el.getAttribute(
          'aria-label',
        ),
      );
  }
  for (const el of root.querySelectorAll(
    '.reactionsBar a.username, .reactionsBar bdi',
  ))
    addHandle(
      c,
      el.text,
    );
  for (const el of root.querySelectorAll(
    '[data-lb-caption-desc]',
  )) {
    const desc =
      el.getAttribute(
        'data-lb-caption-desc',
      ) ??
      '';
    addHandle(
      c,
      desc.split(
        /\s(?:·|&middot;)\s/,
      )[0],
    );
  }
  // body mentions typed as plain text
  for (const el of root.querySelectorAll(
    '.bbWrapper',
  )) {
    for (const m of el.text.matchAll(
      /(?:^|[^\w@])@([A-Za-z0-9_.-]{2,})/g,
    ))
      addHandle(
        c,
        m[1],
      );
  }
  c.avatars.delete(
    '',
  );
}

function skeleton(
  root: HTMLElement,
  template: string,
  extraHead: string,
): string {
  const title =
    root.querySelector(
      'title',
    )
      ?.text ??
    '';
  const links =
    root
      .querySelectorAll(
        'link[rel="canonical"], link[rel="next"], link[rel="prev"]',
      )
      .map(
        (
          l,
        ) =>
          l.outerHTML,
      )
      .join(
        '\n',
      );
  return [
    '<!DOCTYPE html>',
    `<html id="XF" lang="en-US" dir="LTR" data-xf="2.3" data-app="public" data-template="${template}" data-logged-in="false">`,
    '<head>',
    '<meta charset="utf-8" />',
    `<title>${title}</title>`,
    links,
    extraHead,
    '</head>',
    '<body>',
  ].join(
    '\n',
  );
}

function rewriteMembers(
  el: HTMLElement,
  handle: string,
  aliases: Aliases,
): void {
  const path =
    aliases.memberPath(
      handle,
    );
  const id =
    path
      .split(
        '.',
      )
      .pop()
      ?.replace(
        '/',
        '',
      ) ??
    '1';
  for (const a of el.querySelectorAll(
    'a',
  )) {
    if (
      (
        a.getAttribute(
          'href',
        ) ??
        ''
      ).includes(
        '/members/',
      )
    ) {
      a.setAttribute(
        'href',
        path,
      );
      if (
        a.getAttribute(
          'data-user-id',
        )
      )
        a.setAttribute(
          'data-user-id',
          id,
        );
    }
  }
}

function syntheticUserSection(
  handle: string,
  aliases: Aliases,
): string {
  const path =
    aliases.memberPath(
      handle,
    );
  const id =
    path
      .split(
        '.',
      )
      .pop()
      ?.replace(
        '/',
        '',
      ) ??
    '1';
  const user =
    aliases.user(
      handle,
    );
  return [
    '<section class="message-user" itemprop="author" itemscope itemtype="https://schema.org/Person"',
    ` itemid="${SYNTH_BASE}${path}">`,
    `<meta itemprop="url" content="${SYNTH_BASE}${path}" />`,
    '<div class="message-avatar"><div class="message-avatar-wrapper">',
    `<a href="${path}" class="avatar avatar--m avatar--default avatar--default--dynamic" data-user-id="${id}">`,
    `<span class="avatar-u${id}-m" role="img" aria-label="${user}">U</span></a></div></div>`,
    '<div class="message-userDetails">',
    `<h4 class="message-name"><a href="${path}" class="username" dir="auto" data-user-id="${id}">`,
    `<span itemprop="name">${user}</span></a></h4>`,
    '<h5 class="userTitle message-userTitle" dir="auto" itemprop="jobTitle">Member</h5>',
    '</div></section>',
  ].join(
    '',
  );
}

function sanitiseBodyNode(
  body: HTMLElement,
  c: Collected,
  aliases: Aliases,
): void {
  for (const a of body.querySelectorAll(
    'a',
  )) {
    const href =
      a.getAttribute(
        'href',
      ) ??
      '';
    if (
      href.includes(
        '/members/',
      )
    ) {
      const slug =
        memberFromHref(
          href,
          c,
        );
      const handle =
        slug ??
        a.text;
      a.setAttribute(
        'href',
        aliases.memberPath(
          handle,
        ),
      );
      a.removeAttribute(
        'data-user-id',
      );
      a.set_content(
        `@${aliases.user(handle)}`,
      );
    } else if (
      a.classList.contains(
        'bbCodeBlock-sourceJump',
      )
    ) {
      // handled by the quote rewrite
    } else if (
      href &&
      !href.startsWith(
        '#',
      )
    ) {
      a.setAttribute(
        'href',
        'https://example.invalid/link',
      );
      a.removeAttribute(
        'data-url',
      );
    }
  }
  for (const img of body.querySelectorAll(
    'img',
  )) {
    const cls =
      img.getAttribute(
        'class',
      ) ??
      '';
    if (
      /smilie|mceSmilie/.test(
        cls,
      )
    )
      continue;
    img.setAttribute(
      'src',
      'https://example.invalid/image.png',
    );
    img.removeAttribute(
      'srcset',
    );
    img.removeAttribute(
      'data-url',
    );
    img.removeAttribute(
      'data-src',
    );
    img.setAttribute(
      'alt',
      '',
    );
  }
  walkText(
    body,
    (
      t,
    ) => {
      t.rawText =
        redactForFixture(
          t.rawText,
          c,
          aliases,
        );
    },
  );
}

function rewriteQuote(
  bq: HTMLElement,
  c: Collected,
  aliases: Aliases,
): void {
  const who =
    bq.getAttribute(
      'data-quote',
    );
  if (
    who !==
    undefined
  )
    bq.setAttribute(
      'data-quote',
      aliases.author(
        who,
      ),
    );
  const attrs =
    bq.getAttribute(
      'data-attributes',
    );
  if (
    attrs
  ) {
    bq.setAttribute(
      'data-attributes',
      attrs.replace(
        /member:\s*(\d+)/g,
        (
          _m,
          id: string,
        ) => {
          c.memberIds.add(
            id,
          );
          return `member: ${aliases.index(`member-${id}`)}`;
        },
      ),
    );
  }
  const src =
    bq.getAttribute(
      'data-source',
    );
  if (
    src
  ) {
    bq.setAttribute(
      'data-source',
      src.replace(
        /post:\s*(\d+)/,
        (
          _m,
          id: string,
        ) => {
          c.postIds.add(
            id,
          );
          return `post: ${aliases.postId(id, false)}`;
        },
      ),
    );
  }
  for (const a of bq.querySelectorAll(
    '.bbCodeBlock-sourceJump',
  )) {
    const handle =
      a.text.replace(
        /\s+said:?\s*$/i,
        '',
      );
    a.set_content(
      `${aliases.author(handle)} said:`,
    );
    const href =
      a.getAttribute(
        'href',
      ) ??
      '';
    a.setAttribute(
      'href',
      href.replace(
        /id=(\d+)/,
        (
          _m,
          id: string,
        ) => {
          c.postIds.add(
            id,
          );
          return `id=${aliases.postId(id, false)}`;
        },
      ),
    );
    a.removeAttribute(
      'data-content-selector',
    );
  }
}

export type PostPick =
  | 'first'
  | 'last'
  | 'questions';

const QUESTION_HINT =
  /\basked\b|interview question|\bquestions?\b/i;

function pickPosts(
  posts: HTMLElement[],
  max: number,
  mode: PostPick,
): HTMLElement[] {
  if (
    posts.length <=
    max
  )
    return posts;
  if (
    mode ===
    'last'
  )
    return posts.slice(
      posts.length -
        max,
    );
  if (
    mode ===
    'first'
  )
    return posts.slice(
      0,
      max,
    );
  const hit =
    new Set<number>();
  posts.forEach(
    (
      p,
      i,
    ) => {
      if (
        QUESTION_HINT.test(
          p.querySelector(
            '.bbWrapper',
          )
            ?.text ??
            '',
        )
      )
        hit.add(
          i,
        );
    },
  );
  const chosen =
    new Set<number>(
      hit,
    );
  for (
    let i = 0;
    chosen.size <
      max &&
    i <
      posts.length;
    i += 1
  )
    chosen.add(
      i,
    );
  return [
    ...chosen,
  ]
    .sort(
      (
        a,
        b,
      ) =>
        a -
        b,
    )
    .slice(
      0,
      max,
    )
    .map(
      (
        i,
      ) =>
        posts[
          i
        ] as HTMLElement,
    );
}

/**
 * A thread page (`forum`-level chrome dropped) reduced to the real post markup of at most `maxPosts` posts,
 * with authors, members, avatars, reactions and post ids replaced.
 */
export function sanitiseThreadPage(
  html: string,
  c: Collected,
  opts: {
    maxPosts: number;
    pick: PostPick;
    aliases?: Aliases;
  },
): string {
  const aliases =
    opts.aliases ??
    new Aliases();
  const root =
    parse(
      html,
    );
  collectFromXenforo(
    root,
    c,
  );
  for (const art of root.querySelectorAll(
    'article.message--post',
  )) {
    const raw =
      (
        art.getAttribute(
          'data-content',
        ) ??
        ''
      ).replace(
        'post-',
        '',
      );
    if (
      raw
    )
      c.postIds.add(
        raw,
      );
  }
  const posts =
    root.querySelectorAll(
      'article.message--post',
    );
  const kept =
    pickPosts(
      posts,
      opts.maxPosts,
      opts.pick,
    );
  const h1 =
    root.querySelector(
      'h1.p-title-value',
    )
      ?.outerHTML ??
    '';
  const nav =
    root.querySelector(
      '.pageNavWrapper',
    )
      ?.outerHTML ??
    '';
  const out: string[] =
    [
      skeleton(
        root,
        'thread_view',
        '',
      ),
      h1,
      nav,
      '<div class="block-body js-replyNewMessageContainer">',
    ];
  for (const art of kept) {
    const rawId =
      (
        art.getAttribute(
          'data-content',
        ) ??
        ''
      ).replace(
        'post-',
        '',
      );
    const synthId =
      aliases.postId(
        rawId,
        true,
      );
    const author =
      art.getAttribute(
        'data-author',
      ) ??
      '';
    art.setAttribute(
      'data-author',
      aliases.author(
        author,
      ),
    );
    art.setAttribute(
      'data-content',
      `post-${synthId}`,
    );
    art.setAttribute(
      'id',
      `js-post-${synthId}`,
    );
    art.setAttribute(
      'itemid',
      `${SYNTH_BASE}/posts/${synthId}/`,
    );
    const section =
      art.querySelector(
        'section.message-user',
      );
    if (
      section
    )
      section.replaceWith(
        parse(
          syntheticUserSection(
            author,
            aliases,
          ),
        )
          .childNodes[0] as Node,
      );
    art
      .querySelector(
        'ul.message-attribution-opposite',
      )
      ?.remove();
    const react =
      art.querySelector(
        '.reactionsBar',
      );
    if (
      react
    )
      react.set_content(
        '',
      );
    for (const el of art.querySelectorAll(
      '[data-lb-caption-desc]',
    )) {
      const desc =
        el.getAttribute(
          'data-lb-caption-desc',
        ) ??
        '';
      el.setAttribute(
        'data-lb-caption-desc',
        desc.replace(
          /^.*?(?=\s(?:·|&middot;)\s)/s,
          aliases.author(
            author,
          ),
        ),
      );
    }
    for (const a of art.querySelectorAll(
      '.message-attribution a[href*="/threads/"]',
    )) {
      a.setAttribute(
        'href',
        (
          a.getAttribute(
            'href',
          ) ??
          ''
        ).replace(
          /post-\d+/,
          `post-${synthId}`,
        ),
      );
    }
    for (const bq of art.querySelectorAll(
      'blockquote',
    ))
      rewriteQuote(
        bq,
        c,
        aliases,
      );
    const wrapper =
      art.querySelector(
        '.bbWrapper',
      );
    if (
      wrapper
    )
      sanitiseBodyNode(
        wrapper,
        c,
        aliases,
      );
    rewriteMembers(
      art,
      author,
      aliases,
    );
    let markup =
      art.outerHTML;
    // any remaining occurrence of the raw id (permalinks, share links) maps to the synthetic one
    markup =
      markup
        .split(
          rawId,
        )
        .join(
          synthId,
        );
    out.push(
      markup,
    );
  }
  out.push(
    '</div>',
    '</body>',
    '</html>',
  );
  return `${out.join('\n')}\n`;
}

/** A forum listing reduced to its head links, h1, pagination and at most `maxRows` thread rows (stickies included). */
export function sanitiseListingPage(
  html: string,
  c: Collected,
  opts: {
    maxRows: number;
    aliases?: Aliases;
  },
): string {
  const aliases =
    opts.aliases ??
    new Aliases();
  const root =
    parse(
      html,
    );
  collectFromXenforo(
    root,
    c,
  );
  const rows =
    root
      .querySelectorAll(
        '.structItem--thread',
      )
      .filter(
        (
          r,
        ) =>
          r.querySelector(
            '.structItem-title',
          ),
      );
  const sticky =
    rows.filter(
      (
        r,
      ) =>
        r.querySelector(
          '.structItem-status--sticky',
        ),
    );
  const normal =
    rows.filter(
      (
        r,
      ) =>
        !r.querySelector(
          '.structItem-status--sticky',
        ),
    );
  const keep =
    [
      ...sticky,
      ...normal.slice(
        0,
        Math.max(
          0,
          opts.maxRows -
            sticky.length,
        ),
      ),
    ];
  const h1 =
    root.querySelector(
      'h1.p-title-value',
    )
      ?.outerHTML ??
    '';
  const nav =
    root.querySelector(
      '.pageNavWrapper',
    )
      ?.outerHTML ??
    '';
  const out =
    [
      skeleton(
        root,
        'forum_view',
        '',
      ),
      h1,
      nav,
      '<div class="structItemContainer">',
    ];
  for (const row of keep) {
    const author =
      row.getAttribute(
        'data-author',
      ) ??
      '';
    row.setAttribute(
      'data-author',
      aliases.author(
        author,
      ),
    );
    for (const cell of row.querySelectorAll(
      '.structItem-cell--icon',
    ))
      cell.remove();
    for (const a of row.querySelectorAll(
      'a.username',
    )) {
      const handle =
        a.text;
      a.setAttribute(
        'href',
        aliases.memberPath(
          handle,
        ),
      );
      a.removeAttribute(
        'data-user-id',
      );
      a.removeAttribute(
        'data-xf-init',
      );
      a.set_content(
        `<span>${aliases.user(handle)}</span>`,
      );
    }
    for (const el of row.querySelectorAll(
      '[data-preview-url]',
    ))
      el.removeAttribute(
        'data-preview-url',
      );
    out.push(
      row.outerHTML,
    );
  }
  out.push(
    '</div>',
    '</body>',
    '</html>',
  );
  return `${out.join('\n')}\n`;
}

/** An RSS feed cut to `maxItems` items with creators replaced and item bodies replaced by a placeholder. */
export function sanitiseRss(
  xml: string,
  c: Collected,
  maxItems: number,
): string {
  const aliases =
    new Aliases();
  const head =
    xml.slice(
      0,
      xml.indexOf(
        '<item>',
      ),
    );
  const items =
    xml
      .split(
        '<item>',
      )
      .slice(
        1,
      )
      .map(
        (
          s,
        ) =>
          s.split(
            '</item>',
          )[0] ??
          '',
      );
  for (const it of items) {
    addHandle(
      c,
      /<dc:creator>(.*?)<\/dc:creator>/.exec(
        it,
      )?.[1],
    );
    const a =
      /<author>[^(]*\((.*?)\)<\/author>/.exec(
        it,
      )?.[1];
    addHandle(
      c,
      a,
    );
  }
  const kept =
    items
      .slice(
        0,
        maxItems,
      )
      .map(
        (
          it,
        ) => {
          const creator =
            /<dc:creator>(.*?)<\/dc:creator>/.exec(
              it,
            )?.[1] ??
            '';
          return it
            .replace(
              /<author>[\s\S]*?<\/author>/,
              `<author>invalid@example.com (${aliases.author(creator)})</author>`,
            )
            .replace(
              /<dc:creator>[\s\S]*?<\/dc:creator>/,
              `<dc:creator>${aliases.author(creator)}</dc:creator>`,
            )
            .replace(
              /<content:encoded>[\s\S]*?<\/content:encoded>/,
              '<content:encoded><![CDATA[<div class="bbWrapper">Opening post of the thread (fixture placeholder).</div>]]></content:encoded>',
            );
        },
      );
  const tail =
    '  </channel>\n</rss>\n';
  return `${head}${kept.map((k) => `<item>${k}</item>`).join('\n    ')}\n${tail}`;
}

const HONORIFIC_NAME =
  /\b(?:Dr|Prof|Professor|Mr|Mrs|Ms|Mx)\.?\s+[A-Z][a-z]+/;

/** A question string is safe for a fixture when it has no email, URL, @handle, phone or honorific + name. */
export function questionIsFixtureSafe(
  q: string,
): boolean {
  return !(
    EMAIL.test(
      q,
    ) ||
    URL_RE.test(
      q,
    ) ||
    /@\w/.test(
      q,
    ) ||
    PHONE.test(
      q,
    ) ||
    HONORIFIC_NAME.test(
      q,
    ) ||
    /</.test(
      q,
    )
  );
}

/** The hard check: throws, naming only the fixture and the kind of value, if any collected value survived. */
export function assertClean(
  name: string,
  output: string,
  c: Collected,
): void {
  const lower =
    output.toLowerCase();
  for (const h of c.handles) {
    if (
      h.length <
        3 ||
      ORDINARY_WORDS.has(
        h,
      )
    )
      continue;
    const re =
      new RegExp(
        `(?<![a-z0-9_])${escapeRe(h)}(?![a-z0-9_])`,
        'i',
      );
    if (
      re.test(
        lower,
      )
    )
      throw new Error(
        `sanitise: ${name} still contains a collected handle`,
      );
  }
  for (const id of c.memberIds) {
    if (
      id.length <
      4
    )
      continue;
    if (
      new RegExp(
        `(?<!\\d)${id}(?!\\d)`,
      ).test(
        output,
      )
    )
      throw new Error(
        `sanitise: ${name} still contains a member id`,
      );
  }
  for (const a of c.avatars) {
    if (
      a &&
      a !==
        AVATAR_PLACEHOLDER &&
      output.includes(
        a,
      )
    )
      throw new Error(
        `sanitise: ${name} still contains an avatar URL`,
      );
  }
  for (const p of c.postIds) {
    if (
      p.length >=
        7 &&
      output.includes(
        p,
      )
    )
      throw new Error(
        `sanitise: ${name} still contains a raw post id`,
      );
  }
  if (
    /data-author="(?!author-\d{3}")/.test(
      output,
    )
  )
    throw new Error(
      `sanitise: ${name} has a data-author that is not a placeholder`,
    );
  if (
    /\/members\/(?!user-\d{3}\.)/.test(
      output,
    )
  )
    throw new Error(
      `sanitise: ${name} has a member link that is not a placeholder`,
    );
  if (
    /\/data\/avatars\//.test(
      output,
    )
  )
    throw new Error(
      `sanitise: ${name} has an avatar path`,
    );
}

export { AVATAR_PLACEHOLDER };

const asciiJson =
  (
    v: unknown,
  ): string =>
    JSON.stringify(
      v,
    )
      .replace(
        /[\u007f-￿]/g,
        (
          ch,
        ) =>
          `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`,
      )
      .replace(
        /</g,
        '\\u003c',
      );

const STRUCTURED_CARD =
  /in-state|stress level|primary mode|interview format|interview style|impress/i;

/**
 * An interview-feedback summary page reduced to the head, the summary tiles, the structured answer-distribution cards
 * and the inline report array. Report objects keep every key; ids, report URLs, free text and hotel names are replaced.
 */
export function sanitiseSummaryPage(
  html: string,
  c: Collected,
  opts: {
    maxReports: number;
  },
): string {
  const root =
    parse(
      html,
    );
  const script =
    root.querySelector(
      'script#interview-feedback-data',
    );
  if (
    !script
  )
    throw new Error(
      'sanitise: summary page has no interview-feedback-data script',
    );
  const reports =
    JSON.parse(
      script.text,
    ) as Array<
      Record<
        string,
        unknown
      >
    >;
  const safe =
    reports.filter(
      (
        r,
      ) =>
        questionIsFixtureSafe(
          String(
            r.questionsAsked ??
              '',
          ),
        ),
    );
  const kept =
    safe
      .slice(
        0,
        opts.maxReports,
      )
      .map(
        (
          r,
          i,
        ) => {
          const id =
            9_000_001 +
            i;
          const airport =
            String(
              r.airport ??
                '',
            );
          return {
            ...r,
            id,
            questionsAsked:
              String(
                r.questionsAsked ??
                  '',
              ),
            comments: `comment-${String(i + 1).padStart(3, '0')}`,
            searchText: `search-text-${String(i + 1).padStart(3, '0')}`,
            reportUrl: `https://www.studentdoctor.net/schools-database/medical-school/survey/individual/${id}/response`,
            hotel:
              '',
            airport:
              /^[A-Za-z]{3}$/.test(
                airport,
              )
                ? airport
                : '',
          };
        },
      );
  if (
    kept.length <
    Math.min(
      opts.maxReports,
      5,
    )
  )
    throw new Error(
      'sanitise: too few safe reports in summary page',
    );
  const summary =
    root
      .querySelectorAll(
        'section',
      )
      .find(
        (
          s,
        ) =>
          /Interview Feedback Summary/.test(
            s.querySelector(
              'h2',
            )
              ?.text ??
              '',
          ),
      );
  const cards =
    root
      .querySelectorAll(
        'div.rounded-md',
      )
      .filter(
        (
          d,
        ) =>
          STRUCTURED_CARD.test(
            d.querySelector(
              'p',
            )
              ?.text ??
              '',
          ) &&
          d.querySelector(
            '.sdn-response-distribution',
          ),
      );
  const title =
    root.querySelector(
      'title',
    )
      ?.text ??
    '';
  const out =
    [
      '<!DOCTYPE html>',
      '<html lang="en-US">',
      `<head><meta charset="utf-8" /><title>${title}</title></head>`,
      '<body>',
      summary
        ? summary.outerHTML
        : '',
      ...cards.map(
        (
          d,
        ) =>
          d.outerHTML,
      ),
      `<script type="application/json" id="interview-feedback-data">${asciiJson(kept)}</script>`,
      '</body>',
      '</html>',
    ].join(
      '\n',
    );
  void c;
  return `${out}\n`;
}

/** The school index page reduced to its title and a fixed sample of rows of the inline `schools-database-data` JSON. */
export function sanitiseSchoolIndex(
  html: string,
  opts: {
    maxRows: number;
    mustInclude: string[];
  },
): string {
  const root =
    parse(
      html,
    );
  const script =
    root.querySelector(
      'script#schools-database-data',
    );
  if (
    !script
  )
    throw new Error(
      'sanitise: school index has no schools-database-data script',
    );
  const data =
    JSON.parse(
      script.text,
    ) as {
      format: string;
      fields: string[];
      rows: unknown[][];
    };
  const col =
    (
      name: string,
    ) =>
      data.fields.indexOf(
        name,
      );
  const urlI =
    col(
      'url',
    );
  const picked: unknown[][] =
    [];
  const add =
    (
      r:
        | unknown[]
        | undefined,
    ) => {
      if (
        r &&
        !picked.includes(
          r,
        ) &&
        picked.length <
          opts.maxRows
      )
        picked.push(
          r,
        );
    };
  for (const code of opts.mustInclude)
    add(
      data.rows.find(
        (
          r,
        ) =>
          String(
            r[
              urlI
            ],
          ).includes(
            `/detail/${code}/`,
          ),
      ),
    );
  add(
    data.rows.find(
      (
        r,
      ) =>
        r[
          col(
            'country',
          )
        ] ===
        'CA',
    ),
  );
  add(
    data.rows.find(
      (
        r,
      ) =>
        r[
          col(
            'degrees',
          )
        ] ===
        '',
    ),
  );
  add(
    data.rows.find(
      (
        r,
      ) =>
        r[
          col(
            'degrees',
          )
        ] ===
        'MDCM',
    ),
  );
  add(
    data.rows.find(
      (
        r,
      ) =>
        !r[
          col(
            'forumsUrl',
          )
        ],
    ),
  );
  for (const r of data.rows)
    add(
      r,
    );
  const title =
    root.querySelector(
      'title',
    )
      ?.text ??
    '';
  return `<!DOCTYPE html>\n<html lang="en-US">\n<head><meta charset="utf-8" /><title>${title}</title></head>\n<body>\n<script type="application/json" id="schools-database-data">${asciiJson({ ...data, rows: picked })}</script>\n</body>\n</html>\n`;
}
