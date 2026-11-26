/**
 * Compete > Tournaments > Yours (sprint 15, 14): the row text, to markup (no DOM). A row says the tournament, its game
 * and format and status, the member's place ("3rd of 16" or "Host") and the prize ("Won 120 coins").
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; defaultValue_one?: string; count?: number; [k: string]: unknown }) =>
      (o.count === 1 && o.defaultValue_one ? o.defaultValue_one : o.defaultValue).replace(
        /\{\{(\w+)\}\}/g,
        (_m, name: string) => String(o[name]),
      ),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string;
    params?: { id: string };
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={params ? to.replace('$id', params.id) : to} className={className}>
      {children}
    </a>
  ),
}));

import { YoursList } from '../YoursList';
import type { MyTournamentRow } from '@/lib/tournaments/mine.server';

const row = (over: Partial<MyTournamentRow>): MyTournamentRow => ({
  id: 't1',
  name: 'Friday Cup',
  gameId: 'chess',
  gameTitle: 'Chess',
  format: 'SINGLE_ELIM',
  status: 'COMPLETE',
  playerCount: 16,
  hosted: false,
  entered: true,
  placement: 3,
  prizeCoins: null,
  createdAt: '2026-11-20T12:00:00.000Z',
  ...over,
});

const render = (rows: MyTournamentRow[]) => renderToStaticMarkup(<YoursList rows={rows} />);

describe('YoursList', () => {
  it('says the place as an ordinal of the field', () => {
    const html = render([
      row({ id: 'a', placement: 1 }),
      row({ id: 'b', placement: 2 }),
      row({ id: 'c', placement: 3 }),
      row({ id: 'd', placement: 4 }),
      row({ id: 'e', placement: 11 }),
      row({ id: 'f', placement: 22 }),
    ]);
    for (const text of ['1st of 16', '2nd of 16', '3rd of 16', '4th of 16', '11th of 16', '22nd of 16'])
      expect(html).toContain(text);
  });

  it('shows the prize and its singular', () => {
    expect(render([row({ prizeCoins: 120 })])).toContain('Won 120 coins');
    expect(render([row({ prizeCoins: 1 })])).toContain('Won 1 coin<');
    expect(render([row({ prizeCoins: null })])).not.toContain('Won');
  });

  it('marks a hosted tournament, with the place when the host also played', () => {
    const hostOnly = render([row({ hosted: true, entered: false, placement: null })]);
    expect(hostOnly).toContain('>Host<');
    expect(hostOnly).not.toContain(' of 16');
    const both = render([row({ hosted: true, placement: 2, prizeCoins: 60 })]);
    expect(both).toContain('>Host<');
    expect(both).toContain('2nd of 16');
    expect(both).toContain('Won 60 coins');
  });

  it('reads Entered for a tournament that has not placed the member yet', () => {
    expect(render([row({ status: 'LIVE', placement: null })])).toContain('>Entered<');
  });

  it('names the tournament, game, format and status, and links to the page', () => {
    const html = render([
      row({ id: 'abc', name: 'Swiss Open', format: 'SWISS', status: 'LIVE' }),
      row({ id: 'def', status: 'CANCELLED', hosted: true, entered: false, placement: null }),
    ]);
    expect(html).toContain('href="/tournaments/abc"');
    expect(html).toContain('Swiss Open');
    expect(html).toContain('Chess');
    expect(html).toContain('Live');
    expect(html).toContain('Cancelled');
  });

  it('keeps the title on its own line, with the figures wrapping beneath it (390 px)', () => {
    const html = render([row({ name: 'A very long tournament name that must truncate', prizeCoins: 120 })]);
    expect(html).toContain('truncate');
    expect(html).toContain('flex-col');
    expect(html).toMatch(/flex flex-wrap[^"]*"><span>3rd of 16<\/span><span>Won 120 coins<\/span>/);
    expect(html).toContain('dir="auto"');
  });
});
