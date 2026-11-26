/**
 * The table's log rendered to markup (no DOM): a roll of a character who left, the game master's roll, names in
 * `<bdi>`, a degree and the visibility notes in words, and an empty log's rows.
 */
import i18next from 'i18next';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PartyRoll } from '../../engine/party-rolls';
import { TableRollRow, TableRollsList } from '../TableRolls';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'en', fallbackLng: 'en', resources: {}, interpolation: { escapeValue: false } });
const render = (el: ReactElement) => renderToStaticMarkup(<I18nextProvider i18n={i18n}>{el}</I18nextProvider>);

const roll = (over: Partial<PartyRoll> = {}): PartyRoll => ({
  id: 'r1',
  at: 1_800_000_000_000,
  kind: 'skill',
  label: 'stealth',
  notation: '1d20+4',
  dice: [13],
  modifier: 4,
  total: 17,
  mode: 'normal',
  visibility: 'table',
  dc: null,
  degree: null,
  who: { kind: 'character', name: 'Ada' },
  mine: false,
  ...over,
});

describe('TableRollRow', () => {
  it('names the character in <bdi> and reads "Ada rolled Stealth" with the total', () => {
    const html = render(
      <ul>
        <TableRollRow roll={roll()} />
      </ul>,
    );
    expect(html).toContain('<bdi class="font-medium">Ada</bdi>');
    expect(html).toContain('rolled');
    expect(html).toContain('<bdi>Stealth</bdi>');
    expect(html).toContain('>17<');
    expect(html).toContain('1d20+4 (13) +4');
  });

  it('keeps a hostile or right-to-left name inside <bdi>, as text', () => {
    const html = render(
      <ul>
        <TableRollRow roll={roll({ who: { kind: 'character', name: 'مرحبا <img src=x>' } })} />
      </ul>,
    );
    expect(html).toContain('<bdi class="font-medium">مرحبا &lt;img src=x&gt;</bdi>');
    expect(html).not.toContain('<img');
  });

  it('shows a roll of a character who left, without a name', () => {
    const html = render(
      <ul>
        <TableRollRow roll={roll({ who: { kind: 'left' } })} />
      </ul>,
    );
    expect(html).toContain('A character who left');
    expect(html).not.toContain('Ada');
    expect(html).not.toContain('<bdi class="font-medium">');
  });

  it('shows the game master’s roll as "Game master" and a free roll by its notation', () => {
    const html = render(
      <ul>
        <TableRollRow
          roll={roll({
            who: { kind: 'gm' },
            kind: 'free',
            label: '',
            notation: '2d6+3',
            dice: [2, 5],
            modifier: 3,
            total: 10,
          })}
        />
      </ul>,
    );
    expect(html).toContain('Game master');
    expect(html).toContain('<bdi>2d6+3</bdi>');
    expect(html).toContain('2d6+3 (2, 5) +3');
  });

  it('names a short rest Hit Die', () => {
    const html = render(
      <ul>
        <TableRollRow
          roll={roll({ kind: 'free', label: 'hitDie', notation: '1d10+2', dice: [7], modifier: 2, total: 9 })}
        />
      </ul>,
    );
    expect(html).toContain('Hit Die, 1d10+2');
  });

  it('says who is let in on a private roll, in words, and the degree and DC', () => {
    expect(
      render(
        <ul>
          <TableRollRow roll={roll({ visibility: 'gm' })} />
        </ul>,
      ),
    ).toContain('Game master only');
    const secret = render(
      <ul>
        <TableRollRow roll={roll({ visibility: 'secret', who: { kind: 'gm' }, dc: 20, degree: 'critical-success' })} />
      </ul>,
    );
    expect(secret).toContain('Secret');
    expect(secret).toContain('DC 20');
    expect(secret).toContain('Critical success');
  });

  it('names an attack, a critical damage roll, a Strike and an ability save', () => {
    const one = (r: Partial<PartyRoll>) =>
      render(
        <ul>
          <TableRollRow roll={roll(r)} />
        </ul>,
      );
    expect(one({ kind: 'attack', label: 'a0' })).toContain('<bdi>Attack</bdi>');
    expect(one({ kind: 'damage', label: 'd0c' })).toContain('<bdi>Critical damage</bdi>');
    expect(one({ kind: 'strike', label: 's0m2' })).toContain('<bdi>Strike, attack 3</bdi>');
    expect(one({ kind: 'save', label: 'dex' })).toContain('<bdi>Dexterity save</bdi>');
    expect(one({ kind: 'skill', label: 'lore' })).toContain('<bdi>Lore</bdi>');
  });
});

describe('TableRollsList', () => {
  it('is a list with one row per roll, newest first as given, and fades only the rows that arrived', () => {
    const html = render(
      <TableRollsList rolls={[roll({ id: 'r2', total: 9 }), roll({ id: 'r1' })]} arriving={(id) => id === 'r2'} />,
    );
    expect(html.match(/<li /g)).toHaveLength(2);
    expect(html.indexOf('>9<')).toBeLessThan(html.indexOf('>17<'));
    expect(html.match(/arrive/g)).toHaveLength(1);
  });
});
