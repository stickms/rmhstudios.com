import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// A stand-in for i18next that fills the English default, as the real runtime does without a catalogue.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o[name])),
    i18n: { language: 'en' },
  }),
}));

import { RemovalsView } from '@/components/moderation/RemovalsPanel';
import type { MyRemoval } from '@/lib/moderation/removal-reviews.contract';

const row = (over: Partial<MyRemoval> = {}): MyRemoval => ({
  id: 'rem-1',
  kind: 'study-deck',
  title: 'Cell biology',
  removedAt: '2027-01-18T10:00:00.000Z',
  state: 'removed',
  canAsk: true,
  reversible: true,
  reviewRequestedAt: null,
  reviewDecidedAt: null,
  ...over,
});
const render = (items: MyRemoval[] | undefined, extra: { loading?: boolean; failed?: boolean } = {}): string =>
  renderToStaticMarkup(<RemovalsView items={items} onAsk={async () => true} {...extra} />);

describe('RemovalsView', () => {
  it('lists a removed deck by kind and title with the request button', () => {
    const html = render([row()]);
    expect(html).toContain('Removed after a report');
    expect(html).toContain('Flashcard deck');
    expect(html).toContain('<bdi>Cell biology</bdi>');
    expect(html).toContain('Ask for a second look');
  });

  it('says a deleted item cannot be restored and offers no request', () => {
    const html = render([row({ kind: 'comment', title: null, reversible: false, canAsk: false })]);
    expect(html).toContain('Reply');
    expect(html).toContain('This was deleted and cannot be restored.');
    expect(html).not.toContain('Ask for a second look');
    // The takedowns of these delete the row, so they are final too.
    for (const kind of ['prediction-comment', 'guestbook-entry', 'game-thread', 'blog-comment']) {
      const final = render([row({ kind, title: null, reversible: false, canAsk: false })]);
      expect(final, kind).toContain('This was deleted and cannot be restored.');
      expect(final, kind).not.toContain('Ask for a second look');
    }
  });

  it('shows each review state without a request button', () => {
    expect(render([row({ state: 'asked', canAsk: false })])).toContain('A moderator will look again.');
    expect(render([row({ state: 'restored', canAsk: false })])).toContain('Restored. You can publish it again.');
    expect(render([row({ kind: 'game-guide', state: 'restored', canAsk: false })])).toContain(
      'Restored. It is back where it was.',
    );
    expect(render([row({ state: 'upheld', canAsk: false })])).toContain('It stays removed.');
    expect(render([row({ canAsk: false })])).toContain('The time to ask for a second look has passed.');
    for (const html of [
      render([row({ state: 'asked', canAsk: false })]),
      render([row({ state: 'upheld', canAsk: false })]),
    ]) {
      expect(html).not.toContain('Ask for a second look');
    }
  });

  it('shows loading, empty and error states', () => {
    expect(render(undefined, { loading: true })).toContain('Loading your removals');
    expect(render([])).toContain('Nothing of yours has been removed after a report.');
    expect(render(undefined, { failed: true })).toContain('Could not load your removals.');
  });

  it('shows no reporter, report reason, report id or moderator', () => {
    const html = render([row({ state: 'asked', canAsk: false })]);
    for (const word of ['reporter', 'Reporter', 'reportId', 'reason', 'Reason', 'moderator note', 'decided by']) {
      expect(html).not.toContain(word);
    }
    // The only mention of who decides is the generic "a moderator", and the description says it is never shown.
    expect(html).toContain('You never see who reported or who decided.');
  });
});

describe('the removal notices in the inbox', () => {
  const t = ((_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
    o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o[name]))) as never;
  const at = (iso: string): string => iso;

  it('names the kind through the report-kind labels, in the reader’s words', async () => {
    const { noticeText } = await import('@/components/feed/notice-previews');
    const plain = noticeText(t, 'content-removed-after-report', { kind: 'study-deck' }, at);
    expect(plain).toBe('Your ⁨Flashcard deck⁩ was removed after a report.');
    const withMessage = noticeText(
      t,
      'content-removed-after-report-message',
      { kind: 'persona', message: 'Spam.' },
      at,
    );
    expect(withMessage).toContain('AI persona');
    expect(withMessage).toContain('Spam.');
    expect(noticeText(t, 'removal-review-restored', { kind: 'tf2-hud' }, at)).toContain('and restored it');
    expect(noticeText(t, 'removal-review-upheld', { kind: 'tf2-hud' }, at)).toContain('The removal stands.');
  });
});
