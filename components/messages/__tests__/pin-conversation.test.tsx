import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, o?: { defaultValue?: string }) => o?.defaultValue ?? key,
    i18n: { language: 'en' },
  }),
}));

const { PinConversationItem } = await import('../PinConversationItem');

function render(pinned: boolean | undefined) {
  const client = new QueryClient();
  if (pinned !== undefined) {
    client.setQueryData(['messages', 'mute', 'c1'], {
      scopeKey: 'dm:c1',
      muteUntil: null,
      mentionsOnly: false,
      pinned,
      mode: 'all',
    });
  }
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(PinConversationItem, { conversationId: 'c1' })),
  );
}

describe('the pin control in a conversation header', () => {
  it('offers "Pin to top" while the conversation is not pinned', () => {
    for (const html of [render(false), render(undefined)]) {
      expect(html).toContain('aria-label="Pin to top"');
      expect(html).toContain('aria-pressed="false"');
    }
  });

  it('offers "Unpin" while it is pinned, as a pressed button', () => {
    const html = render(true);
    expect(html).toContain('aria-label="Unpin"');
    expect(html).toContain('aria-pressed="true"');
  });
});
