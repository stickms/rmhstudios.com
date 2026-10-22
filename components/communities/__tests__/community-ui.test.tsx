/**
 * Markup-level checks for the moderation lists and the request control (node env,
 * `renderToString` - the repo has no DOM test environment). Focus *targets* are
 * covered in focus-after-removal.test.ts; here: accessible names, RTL-safe
 * classes, decorative separators and the signed-out / pending-session states.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';

const h = vi.hoisted(() => ({ session: { data: null as unknown, isPending: false } }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: Record<string, unknown> | string) => {
      const opts = typeof o === 'string' ? { defaultValue: o } : (o ?? {});
      const count = opts.count as number | undefined;
      const dv =
        (count === 1 ? (opts.defaultValue_one as string | undefined) : undefined) ??
        (opts.defaultValue as string | undefined) ??
        _k;
      return dv.replace(/\{\{(\w+)\}\}/g, (_m, key) => String(opts[key] ?? ''));
    },
  }),
}));
vi.mock('@/components/Providers', () => ({ useSession: () => h.session }));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/communities/plus-api', () => ({
  communityApi: (slug: string, p: string) => `/api/communities/${slug}${p}`,
  plusFetch: vi.fn(),
}));

import { RequestRow } from '../ModRequests';
import { InviteRow } from '../ModInvites';
import { LockedCommunityHeader, RequestToJoin } from '../LockedCommunity';

beforeEach(() => {
  h.session = { data: null, isPending: false };
});

const REQUEST = {
  id: '7',
  message: null,
  createdAt: new Date().toISOString(),
  user: { id: 'u', name: 'Ada', handle: 'ada', image: null },
} as never;

describe('ModRequests row', () => {
  const html = renderToString(
    <RequestRow request={REQUEST} name="Ada" busy={false} onDecide={() => {}} />,
  );

  it('uses logical alignment (RTL), not ml-auto', () => {
    expect(html).toContain('ms-auto');
    expect(html).not.toContain('ml-auto');
  });

  it('names both actions after the person and tags them for focus management', () => {
    expect(html).toContain('aria-label="Approve Ada"');
    expect(html).toContain('aria-label="Deny Ada"');
    expect(html).toContain('data-action="approve"');
    expect(html).toContain('data-request-id="7"');
  });
});

describe('ModInvites row', () => {
  const invite = (code: string, over: Record<string, unknown> = {}) =>
    ({
      id: '1',
      code,
      maxUses: null,
      uses: 0,
      expiresAt: null,
      createdAt: new Date().toISOString(),
      createdBy: { id: 'u', name: 'Mod', handle: null },
      state: 'active',
      ...over,
    }) as never;

  it("each row's copy button is named by its own link prefix, like the revoke button", () => {
    const a = renderToString(
      <InviteRow invite={invite('AAAAAA-rest')} slug="s" onRevoke={() => {}} />,
    );
    const b = renderToString(
      <InviteRow invite={invite('BBBBBB-rest')} slug="s" onRevoke={() => {}} />,
    );
    expect(a).toContain('Copy invite link starting AAAAAA');
    expect(b).toContain('Copy invite link starting BBBBBB');
    expect(a).toContain('Revoke invite link starting AAAAAA');
    expect(a).not.toContain('aria-label="Copy invite link"');
  });

  it('the "·" separators are decorative (aria-hidden)', () => {
    const html = renderToString(
      <InviteRow
        invite={invite('AAAAAA-rest', { state: 'expired' })}
        slug="s"
        onRevoke={() => {}}
      />,
    );
    const seps = html.match(/<span[^>]*>·<\/span>/g) ?? [];
    expect(seps).toHaveLength(3); // uses | expiry | created-by | state label
    for (const s of seps) expect(s).toContain('aria-hidden="true"');
  });
});

describe('LockedCommunityHeader tile', () => {
  const meta = (color: string | null) => ({
    slug: 's',
    name: 'Secret',
    description: null,
    icon: null,
    color,
    memberCount: 3,
  });

  it('a community with no colour gets a valid accent-token tint (not "null22" / "var(...)22")', () => {
    const html = renderToString(<LockedCommunityHeader community={meta(null)} />);
    expect(html).toContain('color-mix(in srgb, var(--site-accent) 13%, transparent)');
    expect(html).not.toMatch(/\)22/);
  });

  it('a coloured community tints with its own colour', () => {
    const html = renderToString(<LockedCommunityHeader community={meta('#ff8800')} />);
    expect(html).toContain('color-mix(in srgb, #ff8800 13%, transparent)');
  });
});

describe('RequestToJoin session states', () => {
  const render = () => renderToString(<RequestToJoin slug="s" initialState={null} />);

  it('while the session is pending: a neutral placeholder, never "Sign in"', () => {
    h.session = { data: null, isPending: true };
    const html = render();
    expect(html).not.toContain('Sign in to request to join');
    expect(html).not.toContain('Request to join');
    expect(html).toContain('aria-busy="true"');
  });

  it('signed out (resolved): the sign-in link', () => {
    h.session = { data: null, isPending: false };
    expect(render()).toContain('Sign in to request to join');
  });

  it('signed in: the request button', () => {
    h.session = { data: { user: { id: 'u' } }, isPending: false };
    const html = render();
    expect(html).toContain('Request to join');
    expect(html).not.toContain('Sign in to request to join');
  });

  it('a pending request shows the status and a cancel control', () => {
    h.session = { data: { user: { id: 'u' } }, isPending: false };
    const html = renderToString(<RequestToJoin slug="s" initialState="PENDING" />);
    expect(html).toContain('Request sent');
    expect(html).toContain('Cancel request');
  });
});
