/**
 * Classifies the target of a markdown image (`![alt](src)`) so the blog
 * renderer can turn it into an <img>, a <video>, or a YouTube embed.
 * Pure and isomorphic; never throws.
 */

export type MediaKind =
  | {
      kind: 'image';
    }
  | {
      kind: 'video';
      src: string;
    }
  | {
      kind: 'youtube';
      videoId: string;
    };

const VIDEO_EXT =
  /\.(mp4|webm|mov)$/i;
const YT_ID =
  /^[\w-]{11}$/;
const YT_HOSTS =
  new Set(
    [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
    ],
  );

function parse(
  src: string,
): URL | null {
  try {
    // Base lets relative URLs parse; absolute URLs ignore it.
    return new URL(
      src,
      'https://relative.invalid',
    );
  } catch {
    return null;
  }
}

function youtubeId(
  url: URL,
):
  | string
  | null {
  const host =
    url.hostname.toLowerCase();
  let candidate:
    | string
    | null =
    null;
  if (
    host ===
    'youtu.be'
  ) {
    candidate =
      url.pathname.split(
        '/',
      )[1] ??
      null;
  } else if (
    YT_HOSTS.has(
      host,
    )
  ) {
    const parts =
      url.pathname
        .split(
          '/',
        )
        .filter(
          Boolean,
        );
    if (
      parts[0] ===
      'watch'
    )
      candidate =
        url.searchParams.get(
          'v',
        );
    else if (
      parts[0] ===
        'embed' ||
      parts[0] ===
        'shorts'
    )
      candidate =
        parts[1] ??
        null;
  }
  return candidate &&
    YT_ID.test(
      candidate,
    )
    ? candidate
    : null;
}

export function classifyMedia(
  src: string,
): MediaKind {
  try {
    if (
      typeof src !==
        'string' ||
      !src
    )
      return {
        kind: 'image',
      };
    const url =
      parse(
        src.trim(),
      );
    if (
      !url
    )
      return {
        kind: 'image',
      };
    if (
      url.protocol !==
        'https:' &&
      url.protocol !==
        'http:'
    )
      return {
        kind: 'image',
      };

    const id =
      url.hostname ===
      'relative.invalid'
        ? null
        : youtubeId(
            url,
          );
    if (
      id
    )
      return {
        kind: 'youtube',
        videoId:
          id,
      };

    if (
      VIDEO_EXT.test(
        url.pathname,
      )
    )
      return {
        kind: 'video',
        src: src.trim(),
      };
    return {
      kind: 'image',
    };
  } catch {
    return {
      kind: 'image',
    };
  }
}
