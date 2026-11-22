import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string; [k: string]: unknown }) =>
      (o?.defaultValue ?? _k).replace(/\{\{(\w+)\}\}/g, (_m, n: string) => String(o?.[n] ?? '')),
  }),
}));

const { DraftEditFields } = await import('../DraftEditDialog');
const { formFromRow, canEditDraft } = await import('../draft-edit');

const row = {
  id: 'd1',
  content: 'Fix the typo',
  audience: 'FOLLOWERS' as const,
  scheduledAt: new Date(2031, 4, 6, 9, 30).toISOString(),
  contentWarning: 'spoilers',
  imageUrls: ['/img/a.png'],
  imageAlts: ['a cat'],
  gifUrl: null,
  poll: { question: 'Which one?' },
  unlockPrice: null,
};

const render = (over: Partial<typeof row> = {}, error = null as never) => {
  const r = { ...row, ...over };
  return renderToStaticMarkup(
    createElement(DraftEditFields, {
      row: r,
      form: formFromRow(r),
      onChange: () => {},
      error,
      pastNow: false,
      uid: 'u',
    }),
  );
};

describe('DraftEditFields', () => {
  it('prefills the fields from the row', () => {
    const html = render();
    expect(html).toContain('Fix the typo');
    expect(html).toContain('value="2031-05-06T09:30"');
    expect(html).toContain('value="spoilers"');
    expect(html).toContain('value="a cat"');
    expect(html).toContain('Description of image 1');
    expect(html).toContain('Keep as draft');
  });

  it('says images and poll are read-only', () => {
    const html = render();
    expect(html).toContain('discard the draft and write it again');
    expect(html).toContain('Poll');
  });

  it('shows no image or read-only section for a plain text draft', () => {
    const html = render({ imageUrls: [], imageAlts: [], poll: null as never });
    expect(html).not.toContain('Image descriptions');
    expect(html).not.toContain('write it again');
  });

  it('ties an error line to its field', () => {
    const html = renderToStaticMarkup(
      createElement(DraftEditFields, {
        row,
        form: formFromRow(row),
        onChange: () => {},
        error: { field: 'images', code: 'alt_required', missing: [0] },
        pastNow: false,
        uid: 'u',
      }),
    );
    expect(html).toContain('This community needs a description for every image');
    expect(html).toContain('aria-describedby="u-images-error"');
  });
});

describe('capsules', () => {
  it('offer no Edit', () => {
    expect(canEditDraft({ isCapsule: true })).toBe(false);
  });
});
