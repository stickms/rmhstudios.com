import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) =>
      String(o?.defaultValue ?? k).replace(/\{\{(\w+)\}\}/g, (_, v) => String(o?.[v] ?? '')),
  }),
}));

import { PrivateListNotice } from '../PrivateListNotice';

describe('PrivateListNotice', () => {
  it('names the owner, as text', () => {
    const html = renderToString(<PrivateListNotice ownerName="Alex" />);
    expect(html).toContain('Alex keeps this list private');
    expect(html).not.toContain('<button');
  });
  it('falls back to a plain notice without a name', () => {
    expect(renderToString(<PrivateListNotice />)).toContain('This list is private');
  });
});
