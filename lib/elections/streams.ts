/**
 * Stream links → safe embed URLs. Client-safe and pure.
 *
 * Built on RMHTube's `parseMedia` (one definition of "a YouTube/Twitch link" on
 * the site) but narrower: only YouTube videos/broadcasts and Twitch channels or
 * videos may be embedded here, and the iframe URL is BUILT from the parsed id —
 * never from the pasted string — on hosts the site's CSP already allows.
 */

import { parseMedia } from '@/lib/rmhtube/media';

export interface Embed {
  kind:
    | 'youtube'
    | 'twitch';
  /** Provider id (video id / channel / video number). */
  id: string;
  label: string;
  /** What to show as the "open on the source site" link. */
  watchUrl: string;
  /** `parent` is the page's hostname — Twitch refuses to embed without it. */
  src: (
    parent: string,
  ) => string;
}

const TWITCH_CHANNEL =
  /^\/([A-Za-z0-9_]{3,25})\/?$/;
const TWITCH_VIDEO =
  /^\/videos\/(\d{3,12})\/?$/;
const HOST =
  /^[a-z0-9.-]{1,253}$/i;

export function parseEmbed(
  raw: string,
): Embed | null {
  if (
    typeof raw !==
      'string' ||
    raw.length >
      300
  )
    return null;
  const media =
    parseMedia(
      raw,
    );
  if (
    !media
  )
    return null;

  if (
    media.mediaType ===
      'youtube' &&
    media.id
  ) {
    const id =
      media.id;
    return {
      kind: 'youtube',
      id,
      label:
        'YouTube',
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
      src: () =>
        `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
    };
  }

  if (
    media.mediaType ===
    'twitch'
  ) {
    let path: string;
    try {
      path =
        new URL(
          media.url,
        )
          .pathname;
    } catch {
      return null;
    }
    const video =
      TWITCH_VIDEO.exec(
        path,
      )?.[1];
    const channel =
      video
        ? null
        : TWITCH_CHANNEL.exec(
            path,
          )?.[1];
    if (
      !video &&
      !channel
    )
      return null;
    const query =
      video
        ? `video=v${video}`
        : `channel=${channel!.toLowerCase()}`;
    return {
      kind: 'twitch',
      id:
        video ??
        channel!,
      label:
        'Twitch',
      watchUrl:
        video
          ? `https://www.twitch.tv/videos/${video}`
          : `https://www.twitch.tv/${channel}`,
      src: (
        parent,
      ) =>
        `https://player.twitch.tv/?${query}&parent=${HOST.test(parent) ? parent : 'localhost'}&autoplay=true`,
    };
  }
  return null;
}

export interface FeaturedStream {
  label: string;
  url: string;
  /** Found automatically (a live broadcast on a known newsroom channel) rather than configured. */
  auto?: boolean;
  /** The broadcast's own title, for auto-discovered streams. */
  title?: string;
}

/** Configured streams first, then discovered ones, one per video. */
export function mergeStreams(
  configured: FeaturedStream[],
  discovered: FeaturedStream[],
): FeaturedStream[] {
  const seen =
    new Set<string>();
  const out: FeaturedStream[] =
    [];
  for (const s of [
    ...configured,
    ...discovered,
  ]) {
    const e =
      parseEmbed(
        s.url,
      );
    const key =
      e
        ? `${e.kind}:${e.id}`
        : s.url;
    if (
      seen.has(
        key,
      )
    )
      continue;
    seen.add(
      key,
    );
    out.push(
      s,
    );
  }
  return out.slice(
    0,
    8,
  );
}

/** Parse `ELECTIONS_STREAMS` (a JSON array of `{label,url}`), keeping only embeddable entries. */
export function parseFeaturedStreams(
  raw:
    | string
    | undefined,
): FeaturedStream[] {
  if (
    !raw
  )
    return [];
  try {
    const arr: unknown =
      JSON.parse(
        raw,
      );
    if (
      !Array.isArray(
        arr,
      )
    )
      return [];
    return arr
      .flatMap(
        (
          x,
        ): FeaturedStream[] => {
          if (
            !x ||
            typeof x !==
              'object'
          )
            return [];
          const {
            label,
            url,
          } =
            x as {
              label?: unknown;
              url?: unknown;
            };
          if (
            typeof label !==
              'string' ||
            typeof url !==
              'string'
          )
            return [];
          // Drop control characters (code points below 32) without a control-character regex.
          const l =
            [
              ...label,
            ]
              .filter(
                (
                  c,
                ) =>
                  c.charCodeAt(
                    0,
                  ) >
                  31,
              )
              .join(
                '',
              )
              .trim()
              .slice(
                0,
                40,
              );
          return l &&
            parseEmbed(
              url,
            )
            ? [
                {
                  label:
                    l,
                  url,
                },
              ]
            : [];
        },
      )
      .slice(
        0,
        8,
      );
  } catch {
    return [];
  }
}
