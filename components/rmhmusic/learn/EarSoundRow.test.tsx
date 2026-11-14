/**
 * The ear lessons' sound row, rendered with react-dom/server under a real i18next instance with no
 * catalog (so every string is the `t()` call's own default), as StaffCard.test.tsx does.
 */
import {
  describe,
  expect,
  it,
} from 'vitest';
import { createInstance } from 'i18next';
import {
  I18nextProvider,
  initReactI18next,
} from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  soundRowOf,
  type SoundRow,
} from '@/lib/rmhmusic/learn/audio/ear-playback';
import type { SoundStatus } from '@/lib/rmhmusic/learn/audio/voice';
import { EarSoundRow } from './EarSoundRow';

const i18n =
  createInstance();
void i18n
  .use(
    initReactI18next,
  )
  .init(
    {
      lng: 'en',
      fallbackLng:
        'en',
      ns: [
        'c-rmhmusic',
      ],
      defaultNS:
        'c-rmhmusic',
      resources:
        {},
      interpolation:
        {
          escapeValue: false,
        },
      initAsync: false,
    },
  );

const render =
  (
    sound: SoundRow,
    inSession = true,
  ) =>
    renderToStaticMarkup(
      <I18nextProvider
        i18n={
          i18n
        }
      >
        <EarSoundRow
          sound={
            sound
          }
          inSession={
            inSession
          }
          onHear={() => {}}
        />
      </I18nextProvider>,
    );

describe('EarSoundRow', () => {
  it('says "Loading sound…" as plain text, not a button, while samples load', () => {
    // A stub engine status: unreachable with the synth, typed and handled.
    const stub: SoundStatus =
      'loading';
    const html =
      render(
        soundRowOf(
          stub,
          'idle',
        ),
      );
    expect(
      html,
    ).toContain(
      'Loading sound…',
    );
    expect(
      html,
    ).not.toContain(
      '<button',
    );
  });

  it('is a "Hear it again" button when ready', () => {
    const html =
      render(
        'ready',
      );
    expect(
      html,
    ).toContain(
      '<button',
    );
    expect(
      html,
    ).toContain(
      'Hear it again',
    );
  });

  it('is a button with the sentence when sound is asleep, waking or failed', () => {
    expect(
      render(
        'asleep',
      ),
    ).toContain(
      'Sound isn&#x27;t playing. Tap to turn it on.',
    );
    expect(
      render(
        'waking',
      ),
    ).toContain(
      'Turning sound on…',
    );
    expect(
      render(
        'waking',
      ),
    ).toContain(
      'aria-busy="true"',
    );
    expect(
      render(
        'failed',
      ),
    ).toContain(
      'Tap to try again.',
    );
    for (const s of [
      'asleep',
      'waking',
      'failed',
    ] as const)
      expect(
        render(
          s,
        ),
      ).toContain(
        '<button',
      );
  });

  it('is plain text when the browser cannot play sound', () => {
    const html =
      render(
        'none',
      );
    expect(
      html,
    ).toContain(
      'can&#x27;t play sound',
    );
    expect(
      html,
    ).not.toContain(
      '<button',
    );
  });

  it('keeps its box but hides after the session', () => {
    expect(
      render(
        'ready',
        false,
      ),
    ).toContain(
      'invisible',
    );
    expect(
      render(
        'ready',
        false,
      ),
    ).toContain(
      'inert',
    );
    expect(
      render(
        'loading',
        false,
      ),
    ).toContain(
      'invisible',
    );
  });
});
