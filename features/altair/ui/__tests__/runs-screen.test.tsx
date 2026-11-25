/**
 * The runs list rendered to markup (no DOM): the empty line, a verified run with the replay's numbers, a refused run
 * with its reason in words, and a co-op row with teammates by name.
 */
import i18next from 'i18next';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CoopMatchView, SoloRunView } from '../../engine/runs';
import { RunsList } from '../screens/RunsScreen';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'en', fallbackLng: 'en', resources: {}, interpolation: { escapeValue: false } });
const render = (el: ReactElement) => renderToStaticMarkup(<I18nextProvider i18n={i18n}>{el}</I18nextProvider>);

const base: SoloRunView = {
  id: 'r1',
  classId: 'knight',
  doubleTime: false,
  issuedAt: '2026-11-01T10:00:00.000Z',
  status: 'verified',
  result: { outcome: 'victory', timeSurvived: 754, kills: 311, level: 14, bosses: 2 },
  reason: null,
  coinsCredited: 320,
  firstClear: true,
};

describe('RunsList', () => {
  it('says so when there are no finished runs', () => {
    expect(render(<RunsList kind="solo" soloRuns={[]} matches={[]} />)).toContain('No finished runs yet');
    expect(render(<RunsList kind="coop" soloRuns={[]} matches={[]} />)).toContain('No finished runs yet');
  });

  it('shows a verified run with the replay time and kills', () => {
    const html = render(<RunsList kind="solo" soloRuns={[base]} matches={[]} />);
    expect(html).toContain('Verified');
    expect(html).toContain('Survived 12:34');
    expect(html).toContain('311 kills');
    expect(html).toContain('First clear');
  });

  it('shows a refused run with its reason in words and no numbers', () => {
    const refused: SoloRunView = {
      ...base,
      status: 'rejected',
      result: null,
      reason: 'claim_mismatch',
      coinsCredited: 0,
      firstClear: false,
    };
    const html = render(<RunsList kind="solo" soloRuns={[refused]} matches={[]} />);
    expect(html).toContain('Refused');
    expect(html).toContain('The numbers sent did not match the replay');
    expect(html).not.toContain('Survived');
  });

  it('says it could not be checked for an unknown reason', () => {
    const refused: SoloRunView = { ...base, status: 'rejected', result: null, reason: 'unknown' };
    expect(render(<RunsList kind="solo" soloRuns={[refused]} matches={[]} />)).toContain(
      'The run could not be checked',
    );
  });

  it('lists co-op teammates by name, with the blocked one as "A player"', () => {
    const match: CoopMatchView = {
      id: 'p1',
      playedAt: '2026-11-01T10:00:00.000Z',
      victory: true,
      durationMs: 600_000,
      playerCount: 3,
      doubleTime: false,
      sharedKills: 100,
      bossesDefeated: 1,
      me: {
        classId: 'knight',
        finalLevel: 9,
        kills: 80,
        coinsEarned: 40,
        timeSurvived: 600,
        wasDowned: false,
        wasRevived: false,
        revivesGiven: 0,
        wasAliveAtEnd: true,
      },
      teammates: [
        { kind: 'player', name: 'Sam', classId: 'mage' },
        { kind: 'blocked', classId: 'rogue' },
        { kind: 'deleted', classId: 'knight' },
      ],
    };
    const html = render(<RunsList kind="coop" soloRuns={[]} matches={[match]} />);
    expect(html).toContain('<bdi dir="auto">Sam</bdi>');
    expect(html).toContain('A player');
    expect(html).toContain('Deleted user');
    expect(html).toContain('Victory');
  });
});
