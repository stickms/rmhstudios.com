/**
 * The daily-puzzle desk's mode titles and descriptions, translated.
 *
 * `DESK_MODES` in `lib/daily-puzzles/desk-modes.ts` is the list. Keys built
 * from a mode (`mode-title-${id}`) or carried on it as data
 * (`descriptionKey`) are invisible to `pnpm i18n:extract`, so most of these
 * strings never reached `locales/en/c-daily-puzzles.json`. Each is written out
 * here as a literal call instead, with the English the list carries;
 * `components/daily-puzzles/__tests__/mode-labels.test.ts` holds the two
 * together.
 */
import type { TFunction } from 'i18next';

export interface DeskModeText {
  title: string;
  description: string;
}

/** Translated title and description per desk mode id (namespace `c-daily-puzzles`). */
export function deskModeText(t: TFunction): Record<string, DeskModeText> {
  return {
    'lights-out': {
      title: t('mode-title-lights-out', { ns: 'c-daily-puzzles', defaultValue: 'Lights Out' }),
      description: t('lights-out-desc', {
        ns: 'c-daily-puzzles',
        defaultValue: 'Turn off every light. Tap to toggle neighbors.',
      }),
    },
    alibi: {
      title: t('mode-title-alibi', { ns: 'c-daily-puzzles', defaultValue: 'Alibi' }),
      description: t('alibi-desc', {
        ns: 'c-daily-puzzles',
        defaultValue: 'Four suspects. One liar. Find the contradiction.',
      }),
    },
    spectrum: {
      title: t('mode-title-spectrum', { ns: 'c-daily-puzzles', defaultValue: 'Spectrum' }),
      description: t('spectrum-desc', {
        ns: 'c-daily-puzzles',
        defaultValue: 'Rank 5 items along a hidden scale.',
      }),
    },
    outcast: {
      title: t('mode-title-outcast', { ns: 'c-daily-puzzles', defaultValue: 'Outcast' }),
      description: t('outcast-desc', {
        ns: 'c-daily-puzzles',
        defaultValue: 'Five rounds. Spot the odd one out.',
      }),
    },
    chainlink: {
      title: t('mode-title-chainlink', { ns: 'c-daily-puzzles', defaultValue: 'Chainlink' }),
      description: t('chainlink-desc', {
        ns: 'c-daily-puzzles',
        defaultValue: 'Connect two words through association jumps.',
      }),
    },
    impostor: {
      title: t('mode-title-impostor', { ns: 'c-daily-puzzles', defaultValue: 'Impostor' }),
      description: t('impostor-desc', {
        ns: 'c-daily-puzzles',
        defaultValue: 'Five facts. Two are lies. Find the fakes.',
      }),
    },
    globeset: {
      title: t('mode-title-globeset', { ns: 'c-daily-puzzles', defaultValue: 'GlobeSet' }),
      description: t('globeset-desc', {
        ns: 'c-daily-puzzles',
        defaultValue: 'Spin the globe. Find the sets whose colours all pair up.',
      }),
    },
  };
}
