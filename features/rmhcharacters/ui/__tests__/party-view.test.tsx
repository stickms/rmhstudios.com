/**
 * The party screens rendered to markup (no DOM): the summary table's header cells, the current turn marked in words,
 * and the read-only sheet, which has no input, no button and no roll control.
 */
import i18next from 'i18next';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DND5E_DATA } from '../../engine/dnd5e/data/index';
import { PF2E_DATA } from '../../engine/pf2e/data/index';
import { newDnd5e, newPf2e } from '../../engine/factory';
import type { PartyMemberView } from '../../engine/party.contract';
import { Sheet5e } from '../dnd5e/Sheet5e';
import { SheetPf2e } from '../pf2e/SheetPf2e';
import { SummaryTable, TurnOrderList } from '../PartyView';
import { RollsContext } from '../useRolls';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'en', fallbackLng: 'en', resources: {}, interpolation: { escapeValue: false } });
const render = (el: ReactElement) => renderToStaticMarkup(<I18nextProvider i18n={i18n}>{el}</I18nextProvider>);

const member = (over: Partial<PartyMemberView> = {}): PartyMemberView => ({
  userId: 'u1',
  name: 'Sam',
  joinedAt: 0,
  isGm: false,
  sheetShared: false,
  summary: {
    system: 'dnd5e',
    name: 'Ilsa',
    level: 3,
    ancestry: 'Human',
    classes: [{ name: 'Fighter', level: 3 }],
    ac: 17,
    hp: { current: 17, max: 28, temp: 4 },
    conditions: ['Prone'],
    perception: 12,
    speed: 30,
    initiative: 2,
  },
  ...over,
});

describe('SummaryTable', () => {
  it('is a table with column and row header cells', () => {
    const html = render(<SummaryTable system="dnd5e" members={[member()]} />);
    expect(html).toContain('<table');
    for (const h of ['Character', 'AC', 'HP', 'Conditions', 'Passive Perception', 'Speed', 'Initiative']) {
      expect(html).toMatch(new RegExp(`<th scope="col"[^>]*>${h}</th>`));
    }
    expect(html).toMatch(/<th scope="row"[^>]*>/);
    expect(html).toContain('17 / 28 (+4)');
    expect(html).toContain('Prone');
    expect(html).toContain('Fighter 3');
  });

  it('says Perception, signed, for Pathfinder', () => {
    const m = member();
    const html = render(
      <SummaryTable
        system="pf2e"
        members={[{ ...m, summary: m.summary && { ...m.summary, system: 'pf2e', perception: 7 } }]}
      />,
    );
    expect(html).toMatch(/<th scope="col"[^>]*>Perception<\/th>/);
    expect(html).toContain('+7');
  });

  it('offers the game master an open-sheet button only for a member who shared', () => {
    const shared = member({ userId: 'a', sheetShared: true });
    const private_ = member({ userId: 'b', sheetShared: false });
    const html = render(
      <SummaryTable system="dnd5e" members={[shared, private_]} onOpenSheet={() => {}} onRemove={() => {}} />,
    );
    expect(html.match(/Open sheet/g)).toHaveLength(1);
    expect(html).toContain('Sheet not shared');
    expect(render(<SummaryTable system="dnd5e" members={[shared]} />)).not.toContain('Open sheet');
  });

  it('shows a character that could not be read without numbers', () => {
    const html = render(<SummaryTable system="dnd5e" members={[member({ summary: null })]} />);
    expect(html).toContain('This character could not be read.');
  });
});

describe('TurnOrderList', () => {
  const order = [
    { id: 'a', kind: 'member' as const, userId: 'u1', name: 'Ilsa', value: 18 },
    { id: 'b', kind: 'extra' as const, userId: null, name: 'Goblin 1', value: 11 },
  ];

  it('marks the current turn with text, once, on the right line', () => {
    const html = render(<TurnOrderList order={order} turnIndex={1} />);
    expect(html.match(/Current turn/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="step"[^>]*>(?:(?!<li).)*Goblin 1(?:(?!<li).)*Current turn/s);
    expect(html.indexOf('Current turn')).toBeGreaterThan(html.indexOf('Goblin 1'));
  });

  it('says so when there is no order yet', () => {
    expect(render(<TurnOrderList order={[]} turnIndex={0} />)).toContain('No turn order yet.');
  });
});

describe('the read-only sheet', () => {
  const noop = () => {};
  const fighter = {
    ...newDnd5e(),
    name: 'Ilsa',
    speciesId: 'human',
    classes: [{ classId: 'fighter', level: 2, hpRolls: [null] }],
  };
  const rollsOn = { system: '5e', d20: () => {}, damage: () => {} } as never;

  it('has no input, button or roll control (5e), even inside a roll context', () => {
    const html = render(
      <RollsContext.Provider value={rollsOn}>
        <Sheet5e c={fighter} d={DND5E_DATA} set={noop} readOnly />
      </RollsContext.Provider>,
    );
    expect(html).toContain('Armor Class');
    expect(html).not.toMatch(/<input/);
    expect(html).not.toMatch(/<button/);
    expect(html).not.toMatch(/<textarea/);
  });

  it('has no input, button or roll control (PF2e)', () => {
    const html = render(
      <SheetPf2e
        c={{ ...newPf2e(), name: 'Tamsin', classId: 'fighter', ancestryId: 'human' }}
        d={PF2E_DATA}
        set={noop}
        readOnly
      />,
    );
    expect(html).toContain('Armor Class');
    expect(html).not.toMatch(/<input/);
    expect(html).not.toMatch(/<button/);
  });

  it('the editable sheet still has them', () => {
    const html = render(<Sheet5e c={fighter} d={DND5E_DATA} set={noop} />);
    expect(html).toMatch(/<input/);
    expect(html).toMatch(/<button/);
  });
});
