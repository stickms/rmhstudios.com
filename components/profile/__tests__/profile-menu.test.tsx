// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o[name])),
  }),
}));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => async () => true }));
vi.mock('@/components/errors/useRefusalText', () => ({ useRefusalText: () => ({ maybe: () => undefined }) }));

import { ProfileMenu, ProfileMenuRows, profileMenuVisible } from '../ProfileMenu';

/**
 * s14-09: the profile's menu (Mute, Block, Report, "Pretending to be someone") is for a signed-in member looking at
 * someone else, and its rows read "Unmute" and "Unblock" when those apply.
 */

const profile = {
  id: 'u1',
  handle: 'ana_k',
  isAdmin: false,
  isOwnProfile: false,
  viewerHasMuted: false,
  viewerHasBlocked: false,
};

const noop = () => {};
const rows = (over: Partial<typeof profile> = {}) =>
  renderToStaticMarkup(
    <ProfileMenuRows
      profile={{ ...profile, ...over }}
      onMute={noop}
      onUnmute={noop}
      onBlockToggle={noop}
      onReport={noop}
      onImpersonation={noop}
    />,
  );

describe('who gets the menu', () => {
  it("not on one's own profile, and not signed out", () => {
    expect(profileMenuVisible(true, { isOwnProfile: true })).toBe(false);
    expect(profileMenuVisible(false, { isOwnProfile: false })).toBe(false);
    expect(profileMenuVisible(true, { isOwnProfile: false })).toBe(true);
    for (const [signedIn, isOwnProfile] of [
      [true, true],
      [false, false],
    ] as const) {
      expect(
        renderToStaticMarkup(<ProfileMenu profile={{ ...profile, isOwnProfile }} name="Ana" signedIn={signedIn} />),
      ).toBe('');
    }
  });

  it("on someone else's profile it is one button named for the account, closed", () => {
    const html = renderToStaticMarkup(<ProfileMenu profile={profile} name="Ana" signedIn />);
    expect(html).toContain('aria-label="More options for ⁨Ana⁩"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="menu"');
  });
});

describe('the rows', () => {
  it('offer all four on a stranger', () => {
    const html = rows();
    expect(html).toContain('>Mute<');
    expect(html).toContain('>Block<');
    expect(html).toContain('>Report<');
    expect(html).toContain('>Pretending to be someone<');
    expect(html).not.toContain('Unmute');
    expect(html).not.toContain('Unblock');
    // Every row is a menu item.
    expect(html.match(/role="menuitem"/g)).toHaveLength(4);
  });

  it('read Unmute when the account is muted', () => {
    const html = rows({ viewerHasMuted: true });
    expect(html).toContain('>Unmute<');
    expect(html).not.toContain('>Mute<');
  });

  it('read Unblock when the account is blocked', () => {
    const html = rows({ viewerHasBlocked: true });
    expect(html).toContain('>Unblock<');
    expect(html).not.toContain('>Block<');
  });

  it('do not offer to block an administrator, unless a block is already there to lift', () => {
    expect(rows({ isAdmin: true })).not.toContain('Block');
    expect(rows({ isAdmin: true, viewerHasBlocked: true })).toContain('>Unblock<');
  });
});
