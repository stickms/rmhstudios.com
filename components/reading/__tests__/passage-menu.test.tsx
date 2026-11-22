import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue?: string }) => o.defaultValue ?? '',
    i18n: { language: 'en' },
  }),
}));

import { PassageMenuItems, PassageMissingNote } from '../PassageMenu';

describe('passage menu', () => {
  it('renders both actions with their labels', () => {
    const html = renderToStaticMarkup(<PassageMenuItems onCopy={() => {}} onPost={() => {}} />);
    expect(html).toContain('Copy link to passage');
    expect(html).toContain('Post this passage');
    expect((html.match(/<button/g) ?? []).length).toBe(2);
  });

  it('says in one line that the passage is gone', () => {
    const html = renderToStaticMarkup(<PassageMissingNote />);
    expect(html).toContain('That passage is no longer in this text.');
    expect(html).toContain('role="status"');
  });
});
