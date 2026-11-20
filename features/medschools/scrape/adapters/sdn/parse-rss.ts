import { parse } from 'node-html-parser';
import { SdnPageError } from './guard';

export interface RssThread {
  threadId: number;
  slug: string;
  title: string;
  comments: number;
  lastActivityAt: Date;
}

function decode(
  s: string,
): string {
  const cdata =
    /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(
      s,
    );
  if (
    cdata
  )
    return (
      cdata[1] ??
      ''
    ).trim();
  return parse(
    `<x>${s}</x>`,
  ).text.trim();
}

function field(
  item: string,
  tag: string,
):
  | string
  | null {
  const m =
    new RegExp(
      `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`,
    ).exec(
      item,
    );
  return m
    ? decode(
        m[1] ??
          '',
      )
    : null;
}

/** Reads only title, link/guid, pubDate and slash:comments; author and dc:creator are never touched. */
export function parseForumRss(
  xml: string,
): RssThread[] {
  if (
    !/<channel[\s>]/.test(
      xml,
    )
  )
    throw new SdnPageError(
      'rss: no channel',
    );
  const items =
    [
      ...xml.matchAll(
        /<item>([\s\S]*?)<\/item>/g,
      ),
    ].map(
      (
        m,
      ) =>
        // Drop the opening-post HTML so nothing inside it can be mistaken for a field.
        (
          m[1] ??
          ''
        ).replace(
          /<content:encoded>[\s\S]*?<\/content:encoded>/g,
          '',
        ),
    );
  const out: RssThread[] =
    [];
  for (const item of items) {
    const title =
      field(
        item,
        'title',
      );
    const link =
      field(
        item,
        'link',
      ) ??
      '';
    const pub =
      field(
        item,
        'pubDate',
      );
    const comments =
      Number(
        field(
          item,
          'slash:comments',
        ),
      );
    const m =
      /\/threads\/([^/]+)\.(\d+)\/?/.exec(
        link,
      );
    const at =
      pub
        ? new Date(
            pub,
          )
        : null;
    if (
      !title ||
      !m ||
      !at ||
      Number.isNaN(
        at.getTime(),
      ) ||
      !Number.isInteger(
        comments,
      ) ||
      comments <
        0
    )
      continue;
    out.push(
      {
        threadId:
          Number(
            m[2],
          ),
        slug:
          m[1] ??
          '',
        title,
        comments,
        lastActivityAt:
          at,
      },
    );
  }
  if (
    items.length >
      0 &&
    out.length ===
      0
  )
    throw new SdnPageError(
      'rss: no item parsed',
    );
  return out;
}
