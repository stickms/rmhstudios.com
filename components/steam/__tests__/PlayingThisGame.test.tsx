import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      o: {
        defaultValue: string;
        [k: string]: unknown;
      },
    ) => o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o[name])),
    i18n: {
      language: 'en',
    },
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

import { PlayingThisGame } from '../PlayingThisGame';
import {
  accessOptionLabels,
  descriptorLabels,
  featureLabels,
  inputLabels,
  playOptionLabels,
  playerLabels,
  requiredLabels,
} from '../access-labels';
import { capabilitiesFor, type GameCapabilities } from '@/lib/game-capabilities';
import {
  ACCESS_OPTION_LABEL_KEYS,
  DESCRIPTOR_LABEL_KEYS,
  FEATURE_LABEL_KEYS,
  INPUT_LABEL_KEYS,
  PLAYER_LABEL_KEYS,
  PLAYER_OPEN_LABEL_KEYS,
  PLAY_OPTION_LABEL_KEYS,
  REQUIRED_LABEL_KEYS,
} from '@/lib/games/capability-labels';

const base: GameCapabilities = {
  genre: ['arcade'],
  players: ['single'],
  input: {
    supported: ['keyboard'],
    required: ['keyboard'],
  },
  sessionMinutes: [5, 10],
  engine: 'dom',
  demanding: false,
  save: 'none',
  accessibility: [],
};
const render = (gameId: string, caps: GameCapabilities | undefined) =>
  renderToStaticMarkup(<PlayingThisGame gameId={gameId} caps={caps} />);

describe('PlayingThisGame', () => {
  it("lists a shared-assist game's assists and links to Game assists", () => {
    const html = render('void-breaker', capabilitiesFor('void-breaker'));
    expect(html).toContain('Playing this game');
    expect(html).toContain('href="/settings/game-assists"');
    expect(html).toContain('Assists: set them once in Game assists');
  });

  it('points Slice It at its own settings, with no link to the shared page', () => {
    const html = render('slice-it', capabilitiesFor('slice-it'));
    expect(html).toContain('Assists are in this game&#x27;s own settings');
    expect(html).not.toContain('/settings/game-assists');
  });

  it('says so plainly when a game lists no accessibility claims', () => {
    const html = render('x', base);
    expect(html).toContain('No accessibility features are listed for this game yet.');
    expect(html).not.toContain('not accessible');
  });

  it('shows controls, requirement and player cap', () => {
    const html = render('x', {
      ...base,
      players: ['single', 'online-versus'],
      maxPlayers: 8,
    });
    expect(html).toContain('Play with keyboard');
    expect(html).toContain('Needs a keyboard');
    expect(html).toContain('1 player');
    expect(html).toContain('Up to 8 online');
  });

  it('shows the flashing sentence only for a game with the descriptor', () => {
    expect(
      render('x', {
        ...base,
        descriptors: ['flashing'],
      }),
    ).toContain('This game contains flashing lights.');
    expect(render('x', base)).not.toContain('flashing');
  });

  it('renders nothing without an entry', () => {
    expect(render('app', undefined)).toBe('');
  });
});

describe('label maps', () => {
  const recorder = () => {
    const keys: string[] = [];
    const t = ((key: string) => {
      keys.push(key);
      return key;
    }) as never;
    return {
      keys,
      t,
    };
  };

  it('the key names in lib are exactly the literal keys the components translate', () => {
    const { keys, t } = recorder();
    featureLabels(t);
    descriptorLabels(t);
    inputLabels(t);
    requiredLabels(t);
    playerLabels(t, 1);
    playOptionLabels(t);
    accessOptionLabels(t);
    const declared = [
      ...Object.values(FEATURE_LABEL_KEYS),
      ...Object.values(DESCRIPTOR_LABEL_KEYS),
      ...Object.values(INPUT_LABEL_KEYS),
      ...Object.values(REQUIRED_LABEL_KEYS),
      ...Object.values(PLAYER_LABEL_KEYS),
      ...Object.values(PLAYER_OPEN_LABEL_KEYS),
      ...Object.values(PLAY_OPTION_LABEL_KEYS),
      ...Object.values(ACCESS_OPTION_LABEL_KEYS),
    ];
    expect([...keys].sort()).toEqual([...declared].sort());
  });
});
