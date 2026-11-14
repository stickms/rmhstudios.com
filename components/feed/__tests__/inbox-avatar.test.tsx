/**
 * Inbox rows carry a picture (owner, 2026-11-14: "In private messages show user avatars in both notifications and in the
 * dm list"): the person in a conversation, the actor in a notification, and a placeholder of the same size where there is
 * no person, so every row's text starts at the same place.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Bell } from 'lucide-react';
import { describe, expect, it } from 'vitest';

const { InboxAvatar } = await import('../InboxAvatar');
const read = (p: string) => readFileSync(join(__dirname, '../../..', p), 'utf8');

describe('InboxAvatar', () => {
  it("draws the person's avatar, 40px, decorative (the name beside it names the row)", () => {
    const out = renderToString(
      createElement(InboxAvatar, {
        person: { id: 'u1', name: 'Ada', image: '/images/social/ada.png' },
      }),
    );
    expect(out).toMatch(/<img[^>]*src="\/images\/social\/ada\.png"/);
    expect(out).toContain('alt=""');
    expect(out).toContain('data-slot="avatar"');
    expect(out).toMatch(/width:\s*40px/);
  });

  it('falls back to the default avatar when the person has no picture', () => {
    const out = renderToString(
      createElement(InboxAvatar, { person: { id: 'u2', name: 'Bo', image: null } }),
    );
    expect(out).toContain('/images/social/default_avatar.png');
  });

  it('draws a 40px placeholder with the icon when there is no person', () => {
    const out = renderToString(createElement(InboxAvatar, { icon: Bell }));
    expect(out).toMatch(
      /<span aria-hidden="true" data-slot="inbox-avatar"[^>]*class="[^"]*size-10/,
    );
    expect(out).toContain('lucide-bell');
    expect(out).not.toContain('<img');
  });

  it('is the picture on every inbox row: conversations, Saved Messages and notifications', () => {
    expect(read('components/feed/MessagesColumn.tsx')).toContain(
      '<InboxAvatar person={conv.otherUser} />',
    );
    expect(read('components/chat-plus/SavedMessagesRow.tsx')).toContain(
      '<InboxAvatar icon={Bookmark} />',
    );
    const notifications = read('components/feed/NotificationsColumn.tsx');
    expect(notifications).toContain('<InboxAvatar person={n.actor} />');
    expect(notifications).toContain('<InboxAvatar icon={Bell} />');
  });
});
