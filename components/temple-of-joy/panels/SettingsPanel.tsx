/**
 * Settings.
 *
 * Sound first, because it is the setting people reach for in the first ten
 * seconds and the one they resent having to hunt for. Music and effects are
 * separate sliders on top of a single mute, so a player who wants the chimes
 * but not the soundtrack — or the reverse — gets exactly that rather than an
 * all-or-nothing switch.
 *
 * Then motion, then the number format, then the save. Nothing here is buried
 * behind a sub-page.
 */
'use client';

import { useRef, useState } from 'react';
import { useClipboard } from '@/hooks/useClipboard';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import { fmt, formatDuration } from '@/lib/temple-of-joy/numbers';
import {
  AUTOSAVE_INTERVAL_MS,
  exportSave,
  importSave,
  saveNow,
} from '@/lib/temple-of-joy/persistence';
import { useSession } from '@/components/Providers';
import { useTempleSnapshot, useTempleValue } from '../hooks';
import { TempleButton, TempleSection, TempleSlider, TempleSwitch } from '../ui';

export function SettingsPanel() {
  const { t } = useTranslation('c-temple-of-joy');
  const store = useTempleStore;
  const signedIn = Boolean(useSession().data?.user);

  const sound = useTempleValue((s) => s.soundEnabled);
  const music = useTempleValue((s) => s.musicVolume);
  const sfx = useTempleValue((s) => s.sfxVolume);
  const theme = useTempleValue((s) => s.theme);
  const flourish = useTempleValue((s) => s.reducedFlourish);
  const format = useTempleValue((s) => s.numberFormat);
  const steward = useTempleValue((s) => s.stewardEnabled);
  const confirmAscend = useTempleValue((s) => s.confirmAscend);
  const hasSteward = useTempleValue((s) => s.blessings.has('steward'));

  const stats = useTempleSnapshot(
    (s) => ({
      playtime: s.playtime,
      lifetime: fmt(s.lifetimeJoy, s.numberFormat),
      sinceSave: Math.max(0, (Date.now() - s.lastSaved) / 1000),
    }),
    2_000,
  );

  return (
    <>
      <TempleSection>{t('section-sound', { defaultValue: 'Sound' })}</TempleSection>

      <Setting
        name={t('setting-sound', { defaultValue: 'Sound' })}
        note={t('setting-sound-note', {
          defaultValue: 'The soundtrack, the bells, and every chime below.',
        })}
      >
        <TempleSwitch
          checked={sound}
          onChange={(next) => store.getState().setSoundEnabled(next)}
          label={t('setting-sound', { defaultValue: 'Sound' })}
        />
      </Setting>

      <Setting
        name={t('setting-music', { defaultValue: 'Music' })}
        note={t('setting-music-note', {
          defaultValue: 'The temple soundtrack. Set to zero to stop it.',
        })}
      >
        <TempleSlider
          value={music}
          onChange={(next) => store.getState().setMusicVolume(next)}
          label={t('setting-music', { defaultValue: 'Music' })}
        />
      </Setting>

      <Setting
        name={t('setting-sfx', { defaultValue: 'Effects' })}
        note={t('setting-sfx-note', {
          defaultValue: 'Offerings, purchases, halos, harvests. Move the slider to hear it.',
        })}
      >
        <TempleSlider
          value={sfx}
          onChange={(next) => store.getState().setSfxVolume(next)}
          label={t('setting-sfx', { defaultValue: 'Effects' })}
          audible
        />
      </Setting>

      <TempleSection>{t('section-look', { defaultValue: 'Look' })}</TempleSection>

      <Setting
        name={t('setting-theme', { defaultValue: 'Vespers' })}
        note={t('setting-theme-note', { defaultValue: 'The same temple, after sunset.' })}
      >
        <TempleSwitch
          checked={theme === 'vespers'}
          onChange={(next) => store.getState().setTheme(next ? 'vespers' : 'dawn')}
          label={t('setting-theme', { defaultValue: 'Vespers' })}
        />
      </Setting>

      <Setting
        name={t('setting-flourish', { defaultValue: 'Reduced flourish' })}
        note={t('setting-flourish-note', {
          defaultValue:
            'Stops the drifting motes, the breathing light and the looping pulses. Everything you need to see still moves.',
        })}
      >
        <TempleSwitch
          checked={flourish}
          onChange={(next) => store.getState().setReducedFlourish(next)}
          label={t('setting-flourish', { defaultValue: 'Reduced flourish' })}
        />
      </Setting>

      <Setting
        name={t('setting-scientific', { defaultValue: 'Scientific notation' })}
        note={t('setting-scientific-note', { defaultValue: 'Show 1.24e18 instead of 1.24 Qi.' })}
      >
        <TempleSwitch
          checked={format === 'scientific'}
          onChange={(next) => store.getState().setNumberFormat(next ? 'scientific' : 'named')}
          label={t('setting-scientific', { defaultValue: 'Scientific notation' })}
        />
      </Setting>

      <TempleSection>{t('section-play', { defaultValue: 'Play' })}</TempleSection>

      {hasSteward && (
        <Setting
          name={t('setting-steward', { defaultValue: 'The Steward' })}
          note={t('setting-steward-note', {
            defaultValue:
              'Spends spare joy on whatever pays for itself soonest, keeping a minute of income in reserve.',
          })}
        >
          <TempleSwitch
            checked={steward}
            onChange={(next) => store.getState().setStewardEnabled(next)}
            label={t('setting-steward', { defaultValue: 'The Steward' })}
          />
        </Setting>
      )}

      <Setting
        name={t('setting-confirm', { defaultValue: 'Ask before ascending' })}
        note={t('setting-confirm-note', {
          defaultValue: 'An ascension gives the whole run back. Worth a second look.',
        })}
      >
        <TempleSwitch
          checked={confirmAscend}
          onChange={(next) => store.getState().setConfirmAscend(next)}
          label={t('setting-confirm', { defaultValue: 'Ask before ascending' })}
        />
      </Setting>

      <TempleSection>{t('section-save', { defaultValue: 'The save' })}</TempleSection>

      <p className="toj-panel-note">
        {t('save-note', {
          seconds: Math.round(AUTOSAVE_INTERVAL_MS / 1000),
          defaultValue:
            'The temple saves itself every {{seconds}} seconds, again shortly after you stop playing, and again the moment the tab is closed or backgrounded. You should never need the button below.',
        })}
      </p>

      <SaveDestination />

      <Setting
        name={t('save-last', { defaultValue: 'Last saved' })}
        note={
          signedIn
            ? t('save-where', {
                defaultValue: 'To your account, and to this browser as a fallback.',
              })
            : t('save-where-guest', {
                defaultValue: 'To this browser only.',
              })
        }
      >
        <span className="toj-setting-value">
          {stats.sinceSave < 5
            ? t('save-just-now', { defaultValue: 'just now' })
            : t('save-ago', {
                time: formatDuration(stats.sinceSave),
                defaultValue: '{{time}} ago',
              })}
        </span>
      </Setting>

      <Setting
        name={t('save-playtime', { defaultValue: 'Time in the temple' })}
        note={t('save-lifetime', {
          joy: stats.lifetime,
          defaultValue: '{{joy}} joy, all time.',
        })}
      >
        <span className="toj-setting-value">{formatDuration(stats.playtime)}</span>
      </Setting>

      <SaveTools />
    </>
  );
}

/**
 * Where this temple lives, and the offer to put it somewhere better.
 *
 * The sign-in prompt is HERE rather than at the door, and that is the whole
 * argument for letting people play signed out: the account buys one specific
 * thing — the same temple on your phone and your laptop — and the honest place
 * to say so is next to the save, once somebody has a temple worth carrying.
 *
 * A signed-in player gets the same row without the button, because "where is my
 * save" is a reasonable question to be able to answer at any point.
 */
function SaveDestination() {
  const { t } = useTranslation('c-temple-of-joy');
  const signedIn = Boolean(useSession().data?.user);

  if (signedIn) {
    return (
      <Setting
        name={t('save-account', { defaultValue: 'Your account' })}
        note={t('save-account-note', {
          defaultValue: 'This temple follows you to every device you sign in on.',
        })}
      >
        <span className="toj-setting-value">✓</span>
      </Setting>
    );
  }

  return (
    <>
      <Setting
        name={t('save-guest', { defaultValue: 'Playing as a guest' })}
        note={t('save-guest-note', {
          defaultValue:
            'This temple lives in this browser. Clearing your site data takes it with them, and it will not be here on another device.',
        })}
      >
        <TempleButton
          size="sm"
          variant="gold"
          onClick={() => {
            // Saved first, and locally, so the temple on this device is current
            // before the navigation — signing in is exactly the moment this save
            // gets claimed by an account, and it should be the newest one.
            saveNow().catch(() => {});
            window.location.href = '/login?callbackURL=/temple-of-joy';
          }}
        >
          {t('save-sign-in', { defaultValue: 'Sign in' })}
        </TempleButton>
      </Setting>
      <p className="toj-panel-note">
        {t('save-guest-carry', {
          defaultValue:
            'Signing in carries this temple up to your account as it is — you do not start again.',
        })}
      </p>
    </>
  );
}

/**
 * Export, import, and a save-now button.
 *
 * The game saves itself on a timer, shortly after you stop playing, and on
 * every way a tab can close — but "I am about to shut this laptop" is a real
 * feeling and a button that answers it costs one request.
 */
function SaveTools() {
  const { t } = useTranslation('c-temple-of-joy');
  const [status, setStatus] = useState('');
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const { copy } = useClipboard();

  // One place both the paste box and the file picker land. `window.prompt` was
  // the old path: embedded browsers and installed web apps suppress it, and
  // there was no file route at all, so on those a save could never be loaded.
  const applyImport = (code: string) => {
    const parsed = importSave(code);
    if (!parsed) {
      setStatus(t('import-failed', { defaultValue: 'That is not a save.' }));
      return false;
    }
    useTempleStore.getState().load(parsed);
    setStatus(t('import-done', { defaultValue: 'Loaded.' }));
    return true;
  };

  return (
    <>
      <div className="toj-desk">
        <TempleButton
          size="sm"
          onClick={() => {
            saveNow()
              .then(() => setStatus(t('save-done', { defaultValue: 'Saved.' })))
              .catch(() =>
                setStatus(t('save-failed', { defaultValue: 'Could not reach the server.' })),
              );
          }}
        >
          {t('save-now', { defaultValue: 'Save now' })}
        </TempleButton>

        <TempleButton
          size="sm"
          onClick={() => {
            const code = exportSave(useTempleStore.getState());
            void copy(code).then((ok) =>
              setStatus(
                ok
                  ? t('export-done', { defaultValue: 'Copied to the clipboard.' })
                  : t('export-failed', { defaultValue: 'Clipboard refused.' }),
              ),
            );
          }}
        >
          {t('export-save', { defaultValue: 'Copy save' })}
        </TempleButton>

        <TempleButton
          size="sm"
          onClick={() => {
            try {
              const code = exportSave(useTempleStore.getState());
              const url = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
              const a = document.createElement('a');
              a.href = url;
              a.download = 'temple-of-joy-save.txt';
              document.body.appendChild(a);
              a.click();
              a.remove();
              window.setTimeout(() => URL.revokeObjectURL(url), 4000);
              setStatus(t('download-done', { defaultValue: 'Save file downloaded.' }));
            } catch {
              setStatus(t('download-failed', { defaultValue: 'Could not make a file.' }));
            }
          }}
        >
          {t('download-save', { defaultValue: 'Download save' })}
        </TempleButton>

        <TempleButton size="sm" variant="danger" onClick={() => fileRef.current?.click()}>
          {t('import-file', { defaultValue: 'Load from file' })}
        </TempleButton>
        <input
          ref={fileRef}
          type="file"
          // No strict accept list: iOS greys out .txt files it does not know,
          // and a wrong file simply fails to parse with a clear message.
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            if (file.size > 2_000_000) {
              setStatus(
                t('import-too-big', { defaultValue: 'That file is too large to be a save.' }),
              );
              return;
            }
            file
              .text()
              .then((text) => applyImport(text))
              .catch(() => setStatus(t('import-failed', { defaultValue: 'That is not a save.' })));
          }}
        />

        <TempleButton size="sm" variant="danger" onClick={() => setPasting((v) => !v)}>
          {t('import-save', { defaultValue: 'Load a save' })}
        </TempleButton>
      </div>

      {pasting && (
        <div className="toj-desk">
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={3}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label={t('import-prompt', {
              defaultValue: 'Paste a save. This replaces the current one.',
            })}
            placeholder={t('import-prompt', {
              defaultValue: 'Paste a save. This replaces the current one.',
            })}
            // 16px: anything smaller makes iOS Safari zoom the page on focus.
            style={{
              width: '100%',
              fontSize: '16px',
              padding: '0.5rem',
              borderRadius: 'var(--toj-radius-sm)',
              border: '1px solid var(--toj-rule-strong)',
              background: 'var(--toj-surface-sunk)',
              color: 'var(--toj-ink)',
            }}
          />
          <TempleButton
            size="sm"
            variant="danger"
            onClick={() => {
              if (!pasted.trim()) return;
              if (applyImport(pasted)) {
                setPasted('');
                setPasting(false);
              }
            }}
          >
            {t('import-confirm', { defaultValue: 'Replace my temple' })}
          </TempleButton>
        </div>
      )}

      {status && (
        <p className="toj-panel-note" role="status">
          {status}
        </p>
      )}

      {/* Its own group, below the note, so it is never the button next to the
          one you meant. The confirmation is a dialog — see `ResetDialog`. */}
      <TempleSection>{t('start-again', { defaultValue: 'Start again' })}</TempleSection>

      <p className="toj-panel-note">
        {t('reset-note-anywhere', {
          defaultValue:
            'Deletes this temple everywhere it is kept — this device, and your account if you are signed in. Copy your save first if you want it back.',
        })}
      </p>

      <div className="toj-desk">
        <TempleButton
          size="sm"
          variant="danger"
          onClick={() => useTempleStore.getState().setShowResetDialog(true)}
        >
          {t('reset-save', { defaultValue: 'Empty the temple' })}
        </TempleButton>
      </div>
    </>
  );
}

function Setting({
  name,
  note,
  children,
}: {
  name: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="toj-setting">
      <span className="toj-setting-label">
        <span className="toj-setting-name">{name}</span>
        {note && <span className="toj-setting-note">{note}</span>}
      </span>
      <span className="toj-setting-control">{children}</span>
    </div>
  );
}

/** Kept next to the panel that plays them, so a new cue is easy to preview. */
export { templeAudio };
