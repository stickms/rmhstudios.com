/**
 * s10-18: the admin membership grant is one dialog (tier, months 1 to 24, Grant, Cancel) and Cancel grants nothing.
 * It used to be two `usePrompt` calls, and cancelling the second one granted a month (`parseInt(monthsStr || '1')`).
 * No DOM: the form is a hooks-free view, so the test renders it to markup and walks its element tree to press the
 * buttons.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement, ReactNode } from 'react';
import { GrantMembershipForm, type GrantMembershipLabels } from '@/components/admin/GrantMembershipDialog';
import { buildGrantBody, parseGrantMonths } from '@/lib/admin/grant-membership';

const labels: GrantMembershipLabels = {
  tier: 'Tier',
  starter: 'Starter',
  pro: 'Max',
  revoke: 'Revoke active grants',
  months: 'Months',
  monthsHint: 'A whole number from 1 to 24.',
  grant: 'Grant',
  revokeAction: 'Revoke',
  cancel: 'Cancel',
};

function view(over: Partial<Parameters<typeof GrantMembershipForm>[0]> = {}) {
  return GrantMembershipForm({
    ids: 'g1',
    labels,
    choice: 'pro',
    monthsText: '1',
    busy: false,
    onChoiceChange: vi.fn(),
    onMonthsChange: vi.fn(),
    onGrant: vi.fn(),
    onCancel: vi.fn(),
    ...over,
  });
}

/** Every element in a tree (function components are not expanded: we only need the props the form set). */
function walk(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) node.forEach((n) => walk(n, out));
  else if (node && typeof node === 'object' && 'props' in node) {
    out.push(node as ReactElement);
    walk((node as ReactElement<{ children?: ReactNode }>).props.children, out);
  }
  return out;
}

const button = (tree: ReactElement, text: string) =>
  walk(tree).find(
    (e) => (e.props as { children?: unknown }).children === text && (e.props as { type?: string }).type === 'button',
  );

describe('GrantMembershipForm', () => {
  it('renders the tier, a months number field limited to 1 to 24, Grant and Cancel', () => {
    const html = renderToStaticMarkup(view());
    expect(html).toContain('Tier');
    expect(html).toContain('Months');
    expect(html).toMatch(/<input[^>]*type="number"[^>]*/);
    expect(html).toContain('min="1"');
    expect(html).toContain('max="24"');
    expect(html).toContain('>Grant<');
    expect(html).toContain('>Cancel<');
  });

  it('Cancel grants nothing', () => {
    const onGrant = vi.fn();
    const onCancel = vi.fn();
    const cancel = button(view({ onGrant, onCancel }), 'Cancel');
    expect(cancel).toBeDefined();
    (cancel!.props as { onClick: () => void }).onClick();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onGrant).not.toHaveBeenCalled();
  });

  it('submitting a valid form grants once, with the typed months and no default', () => {
    const onGrant = vi.fn();
    const form = walk(view({ choice: 'starter', monthsText: '6', onGrant })).find((e) => e.type === 'form')!;
    (form.props as { onSubmit: (e: { preventDefault: () => void }) => void }).onSubmit({ preventDefault: () => {} });
    expect(onGrant).toHaveBeenCalledWith({ tier: 'starter', months: 6 });
  });

  it('does not grant while the months are empty, zero, fractional or past 24', () => {
    for (const monthsText of ['', '0', '1.5', '25', 'abc', '-3']) {
      const onGrant = vi.fn();
      const form = walk(view({ monthsText, onGrant })).find((e) => e.type === 'form')!;
      (form.props as { onSubmit: (e: { preventDefault: () => void }) => void }).onSubmit({ preventDefault: () => {} });
      expect(onGrant).not.toHaveBeenCalled();
      const grant = walk(view({ monthsText })).find((e) => (e.props as { type?: string }).type === 'submit')!;
      expect((grant.props as { disabled?: boolean }).disabled).toBe(true);
    }
  });

  it('revoke needs no months and offers Revoke instead of Grant', () => {
    const onGrant = vi.fn();
    const html = renderToStaticMarkup(view({ choice: 'revoke', monthsText: '', onGrant }));
    expect(html).toContain('>Revoke<');
    const form = walk(view({ choice: 'revoke', monthsText: '', onGrant })).find((e) => e.type === 'form')!;
    (form.props as { onSubmit: (e: { preventDefault: () => void }) => void }).onSubmit({ preventDefault: () => {} });
    expect(onGrant).toHaveBeenCalledWith({ revoke: true });
  });

  it('does nothing while a grant is already in flight', () => {
    const onGrant = vi.fn();
    const form = walk(view({ busy: true, onGrant })).find((e) => e.type === 'form')!;
    (form.props as { onSubmit: (e: { preventDefault: () => void }) => void }).onSubmit({ preventDefault: () => {} });
    expect(onGrant).not.toHaveBeenCalled();
  });
});

describe('parseGrantMonths and buildGrantBody', () => {
  it('accepts whole months from 1 to 24 and nothing else', () => {
    expect(parseGrantMonths('1')).toBe(1);
    expect(parseGrantMonths(' 24 ')).toBe(24);
    for (const bad of ['', '0', '25', '1.5', '1e1', '+3', '-1', 'x']) expect(parseGrantMonths(bad)).toBeNull();
  });

  it('builds the request body, or null for an invalid grant', () => {
    expect(buildGrantBody('pro', '12')).toEqual({ tier: 'pro', months: 12 });
    expect(buildGrantBody('revoke', '')).toEqual({ revoke: true });
    expect(buildGrantBody('starter', '')).toBeNull();
  });
});
