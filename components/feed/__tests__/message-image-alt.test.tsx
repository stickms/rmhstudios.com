/**
 * Image descriptions in messages (s03-19), as a reader and a sender meet them: a described image takes its
 * description as `alt` and gets an ALT button that names itself; an image without one keeps `alt=""` and is still
 * announced; the composer's strip says which images lack a description and what its buttons do.
 */
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.mock(
  'react-i18next',
  () => ({
    useTranslation:
      () => ({
        t: (
          key: string,
          o?: Record<
            string,
            unknown
          > & {
            defaultValue?: string;
          },
        ) =>
          (
            o?.defaultValue ??
            key
          ).replace(
            /\{\{(\w+)\}\}/g,
            (
              _m,
              name: string,
            ) =>
              String(
                o?.[
                  name
                ] ??
                  '',
              ),
          ),
      }),
  }),
);

const {
  MessageImages,
} =
  await import('../MessageImages');
const {
  PendingMessageImages,
} =
  await import('../PendingMessageImages');

const urls =
  [
    '/api/feed/image/me-1-a.png',
    '/api/feed/image/me-2-b.png',
  ];

describe('MessageImages', () => {
  it('uses the description as the image alt', () => {
    const html =
      renderToString(
        createElement(
          MessageImages,
          {
            urls: [
              urls[0]!,
            ],
            alts: [
              'A dog on a beach',
            ],
          },
        ),
      );
    expect(
      html,
    ).toContain(
      'alt="A dog on a beach"',
    );
  });

  it('names the ALT button after the image and starts with the text hidden', () => {
    const html =
      renderToString(
        createElement(
          MessageImages,
          {
            urls,
            alts: [
              'A dog on a beach',
              'A red kite',
            ],
          },
        ),
      );
    expect(
      html,
    ).toContain(
      'aria-label="Show description of image 1"',
    );
    expect(
      html,
    ).toContain(
      'aria-label="Show description of image 2"',
    );
    expect(
      html,
    ).toContain(
      'aria-expanded="false"',
    );
    expect(
      html,
    ).toMatch(
      /<p[^>]*hidden[^>]*>A red kite<\/p>/,
    );
  });

  it('keeps alt="" and adds hidden text for an image without a description', () => {
    const html =
      renderToString(
        createElement(
          MessageImages,
          {
            urls: [
              urls[0]!,
            ],
            alts: [
              '',
            ],
          },
        ),
      );
    expect(
      html,
    ).toContain(
      'alt=""',
    );
    expect(
      html,
    ).toMatch(
      /<li class="sr-only">Image without description<\/li>/,
    );
    expect(
      html,
    ).not.toContain(
      'Show description',
    );
  });

  it('treats a message from before descriptions (no list) as undescribed', () => {
    const html =
      renderToString(
        createElement(
          MessageImages,
          {
            urls: [
              urls[0]!,
            ],
          },
        ),
      );
    expect(
      html,
    ).toContain(
      'Image without description',
    );
  });

  it('says which of several images has none', () => {
    const html =
      renderToString(
        createElement(
          MessageImages,
          {
            urls,
            alts: [
              'A dog on a beach',
              '',
            ],
          },
        ),
      );
    expect(
      html,
    ).toContain(
      'Image 2 without description',
    );
    expect(
      html,
    ).toContain(
      'aria-label="Show description of image 1"',
    );
  });

  it('draws no second, decorative ALT chip beside the button', () => {
    const html =
      renderToString(
        createElement(
          MessageImages,
          {
            urls: [
              urls[0]!,
            ],
            alts: [
              'A dog on a beach',
            ],
          },
        ),
      );
    expect(
      html.match(
        />ALT</g,
      ),
    ).toHaveLength(
      1,
    );
  });
});

describe('PendingMessageImages', () => {
  const noop =
    () => {};
  const render =
    (
      alts: string[],
      missing: number[],
    ) =>
      renderToString(
        createElement(
          PendingMessageImages,
          {
            imageUrls:
              urls,
            alts,
            missing,
            onSetAlt:
              noop,
            onRemove:
              noop,
          },
        ),
      );

  it('offers Add description, and shows Description added once one is set', () => {
    const html =
      render(
        [
          '',
          'A red kite',
        ],
        [],
      );
    expect(
      html,
    ).toContain(
      'aria-label="Add description to image 1"',
    );
    expect(
      html,
    ).toContain(
      '>Add description<',
    );
    expect(
      html,
    ).toContain(
      'aria-label="Edit description of image 2"',
    );
    expect(
      html,
    ).toContain(
      '>Description added<',
    );
  });

  it('names the images that still lack a description when they are required', () => {
    const html =
      render(
        [
          '',
          '',
        ],
        [
          0,
          1,
        ],
      );
    expect(
      html,
    ).toContain(
      'Add a description to image 1, image 2 before sending.',
    );
    expect(
      html,
    ).toContain(
      'Describe it',
    );
  });

  it('shows no notice when nothing is missing', () => {
    expect(
      render(
        [
          'a',
          'b',
        ],
        [],
      ),
    ).not.toContain(
      'before sending',
    );
  });
});
