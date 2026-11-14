// @vitest-environment node
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  OptimizedImage,
  buildOptimizedUrl,
  imageSeen,
  markSeen,
} from '../OptimizedImage';
import { UserAvatar } from '../UserAvatar';

const html =
  (
    src: string,
  ) =>
    renderToString(
      createElement(
        OptimizedImage,
        {
          src,
          alt: '',
          width: 400,
          height: 300,
        },
      ),
    );

describe('a picture this tab has already shown is in the first frame when it mounts again', () => {
  it('first sight keeps the lazy, async defaults; once it has loaded, the next mount is eager and sync', () => {
    const src =
      'https://example.test/a-picture.png';
    const first =
      html(
        src,
      );
    expect(
      first,
    ).toContain(
      'loading="lazy"',
    );
    expect(
      first,
    ).toContain(
      'decoding="async"',
    );

    // What the image's own `load` handler records: the resolved URL it was given.
    const resolved =
      buildOptimizedUrl(
        src,
        400,
        80,
      );
    expect(
      imageSeen(
        resolved,
      ),
    ).toBe(
      false,
    );
    markSeen(
      resolved,
    );
    expect(
      imageSeen(
        resolved,
      ),
    ).toBe(
      true,
    );

    const again =
      html(
        src,
      );
    expect(
      again,
    ).toContain(
      'loading="eager"',
    );
    expect(
      again,
    ).toContain(
      'decoding="sync"',
    );
  });

  it('seeing one picture does not make another eager', () => {
    markSeen(
      buildOptimizedUrl(
        'https://example.test/seen.png',
        400,
        80,
      ),
    );
    expect(
      html(
        'https://example.test/not-seen.png',
      ),
    ).toContain(
      'loading="lazy"',
    );
  });

  it('the same picture at another size is another file, and is not counted as seen', () => {
    const src =
      'https://example.test/sized.png';
    markSeen(
      buildOptimizedUrl(
        src,
        400,
        80,
      ),
    );
    const other =
      renderToString(
        createElement(
          OptimizedImage,
          {
            src,
            alt: '',
            width: 1200,
          },
        ),
      );
    expect(
      other,
    ).toContain(
      'loading="lazy"',
    );
  });

  it('an avatar is always eager and sync: it is tiny and on screen with its row', () => {
    const out =
      renderToString(
        createElement(
          UserAvatar,
          {
            src: 'https://example.test/face.png',
            alt: '',
            size: 28,
          },
        ),
      );
    expect(
      out,
    ).toContain(
      'loading="eager"',
    );
    expect(
      out,
    ).toContain(
      'decoding="sync"',
    );
  });
});
