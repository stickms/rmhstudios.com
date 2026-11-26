/** The class resources on the sheet, rendered to markup: what is left, a stepper only on the player's own sheet. */
import i18next from 'i18next';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DND5E_DATA } from '../../engine/dnd5e/data/index';
import { newDnd5e } from '../../engine/factory';
import { Sheet5e } from '../dnd5e/Sheet5e';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'en', fallbackLng: 'en', resources: {}, interpolation: { escapeValue: false } });
const render = (el: ReactElement) => renderToStaticMarkup(<I18nextProvider i18n={i18n}>{el}</I18nextProvider>);

const barbarian = () => ({
  ...newDnd5e(),
  speciesId: 'human',
  backgroundId: 'soldier',
  classes: [{ classId: 'barbarian', level: 3, hpRolls: [null, null] }],
  resourcesUsed: { Rages: 2 },
});

describe('class resources on the sheet', () => {
  it('shows how many are left, with a stepper on the player sheet', () => {
    const html = render(<Sheet5e c={barbarian()} d={DND5E_DATA} set={() => {}} />);
    expect(html).toContain('1 of 3 left');
    expect(html).toContain('Uses of Rages left');
    expect(html).toContain('Rage Damage');
  });

  it('shows it read-only on a shared sheet', () => {
    const html = render(<Sheet5e c={barbarian()} d={DND5E_DATA} set={() => {}} readOnly />);
    expect(html).toContain('1 of 3 left');
    expect(html).not.toContain('Uses of Rages left');
  });

  it('an older save reads full', () => {
    const c = { ...barbarian(), resourcesUsed: {} };
    expect(render(<Sheet5e c={c} d={DND5E_DATA} set={() => {}} readOnly />)).toContain('3 of 3 left');
  });
});
