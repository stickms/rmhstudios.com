/**
 * The boot, signed-out, notice, toolbar and screen components rendered to markup (react-dom/server,
 * no browser): what each state says and offers, and the attributes that decide who can focus what.
 * Behaviour that needs a real page (Back, sign-out in another tab, Tab order) was checked in
 * Chromium and is described in the fix-wave report.
 */
import i18next from 'i18next';
import { createRef, type ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import BootScreen from '../BootScreen';
import Notices from '../Notices';
import Screen from '../Screen';
import SignedOut from '../SignedOut';
import Toolbar from '../Toolbar';
import { toolbarState } from '../toolbar-state';
import type { RmhosSessionValue } from '../useRmhosSession';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'en', fallbackLng: 'en', resources: {}, interpolation: { escapeValue: false } });

const render = (el: ReactElement) =>
  renderToStaticMarkup(<I18nextProvider i18n={i18n}>{el}</I18nextProvider>);
const noop = () => {};

const bootProps = {
  needsKeyboardNotice: false,
  onStart: noop,
  onRetry: noop,
  onDownloadDamaged: noop,
  onStartEmpty: noop,
  onRestoreBackup: noop,
  previousAvailable: false,
  onPutPreviousBack: noop,
};
const boot = (p: Partial<Parameters<typeof BootScreen>[0]> & Pick<Parameters<typeof BootScreen>[0], 'phase' | 'failure'>) =>
  render(<BootScreen {...bootProps} {...p} />);

/** The markup of the live region only. */
const liveRegion = (html: string) => /<div role="status"[^>]*>(.*?)<\/div>/s.exec(html)?.[1] ?? '';

describe('BootScreen', () => {
  it.each([
    ['image-missing', 'The files rmhOS needs are not available right now'],
    ['image-invalid', 'The files rmhOS needs could not be used'],
    ['network', 'could not download its files. Check your connection'],
    ['stalled', 'The download stopped'],
    ['boot-timeout', 'did not start in time'],
  ] as const)('a %s failure says it in plain words, with the technical text under Details', (reason, copy) => {
    const html = boot({ phase: 'failed', failure: 'load', detail: { error: 'no download progress for 30 s', reason } });
    expect(html).toContain(copy);
    expect(html).toContain('<summary');
    expect(html).toContain('no download progress for 30 s');
    expect(html).toContain('Try again');
  });

  it('a load failure with no reason keeps the plain default', () => {
    expect(boot({ phase: 'failed', failure: 'load', detail: { error: 'x' } })).toContain('rmhOS could not be loaded.');
  });

  it('the failure kinds keep their own words and buttons', () => {
    expect(boot({ phase: 'failed', failure: 'locked' })).toContain('already open in another tab');
    expect(boot({ phase: 'failed', failure: 'handshake', detail: { error: 'agent: timeout' } })).toContain('Restart');
    const corrupt = boot({ phase: 'failed', failure: 'corrupt' });
    for (const label of ['Download the damaged backup', 'Restore backup', 'Start with an empty home'])
      expect(corrupt).toContain(label);
    const stopped = boot({ phase: 'stopped', failure: null });
    expect(stopped).toContain('rmhOS has stopped.');
    expect(stopped).toContain('Restart');
  });

  it('the live region holds the phase and the 25 % steps, never the buttons or a changing percentage', () => {
    const half = boot({ phase: 'downloading', failure: null, detail: { loaded: 50, total: 100 } });
    const live = liveRegion(half);
    expect(live).toContain('Downloading the machine');
    expect(live).toContain('50%');
    expect(live).not.toContain('<button');
    // The visible percentage is hidden from assistive technology (it changes every few bytes).
    expect(half).toMatch(/aria-hidden="true">51%|aria-hidden="true">50%/);
    const failed = boot({ phase: 'failed', failure: 'load', detail: { error: 'x' } });
    expect(liveRegion(failed)).not.toContain('<button');
    expect(boot({ phase: 'downloading', failure: null, detail: { loaded: 24, total: 100 } })).not.toMatch(/sr-only[^>]*>\d+%/);
  });

  it('a phone is asked first, and told when the memory may be short', () => {
    const plain = boot({ phase: 'idle', failure: null, needsKeyboardNotice: true });
    expect(plain).toContain('rmhOS needs a keyboard.');
    expect(plain).toContain('Start anyway');
    expect(plain).not.toContain('enough memory');
    expect(boot({ phase: 'idle', failure: null, needsKeyboardNotice: true, lowMemory: true })).toContain('enough memory');
  });
});

describe('SignedOut', () => {
  it('says so and links to sign in, coming back to /rmhos', () => {
    const html = render(<SignedOut />);
    expect(html).toContain('You are signed out');
    expect(html).toMatch(/<a [^>]*href="\/login\?callbackURL=%2Frmhos"[^>]*>Sign in<\/a>/);
  });
});

describe('Notices', () => {
  const session = (over: Partial<RmhosSessionValue> = {}) =>
    ({
      lastSave: null,
      desktopReady: true,
      storeKind: 'indexeddb',
      net: null,
      netEnded: false,
      saving: false,
      saveNow: noop,
      restart: noop,
      ...over,
    }) as unknown as RmhosSessionValue;

  it('says the browser may delete the files, with Keep and Download, only when it said so', () => {
    const risk = render(<Notices session={session()} busy={false} onDownload={noop} evictionRisk onKeep={noop} />);
    expect(risk).toContain('This browser may delete these files to free space. Download a backup to keep them.');
    expect(risk).toContain('Keep my files in this browser');
    expect(risk).toContain('Download backup');
    expect(render(<Notices session={session()} busy={false} onDownload={noop} />)).toBe('');
  });

  it('says nothing about eviction before the desktop is up or with storage blocked (that notice says more)', () => {
    expect(render(<Notices session={session({ desktopReady: false })} busy={false} onDownload={noop} evictionRisk />)).toBe('');
    const blocked = render(<Notices session={session({ storeKind: 'memory' })} busy={false} onDownload={noop} evictionRisk />);
    expect(blocked).toContain('this browser is blocking storage');
    expect(blocked).not.toContain('may delete these files');
  });
});

describe('Screen', () => {
  const screen = (interactive: boolean) =>
    render(
      <Screen ref={createRef()} label="rmhOS desktop" hint="h" hintId="x" interactive={interactive} onCapture={noop} onRelease={noop} onInput={noop} />,
    );

  it('is focusable only while the desktop is on screen, and always left to right', () => {
    const on = screen(true);
    expect(on).toContain('tabindex="0"');
    expect(on).not.toContain('inert');
    expect(on).toContain('dir="ltr"');
    const off = screen(false);
    expect(off).toContain('tabindex="-1"');
    expect(off).toContain('inert=""');
    expect(off).toContain('dir="ltr"');
  });
});

describe('Toolbar', () => {
  const toolbar = (fullscreen: boolean) =>
    render(
      <Toolbar
        state={toolbarState({ phase: 'running', desktopReady: true, lastSave: null, saving: false, dirty: false, net: 'off' })}
        storeKind="indexeddb"
        busy={false}
        ready
        fullscreen={fullscreen}
        fullscreenAvailable
        fileInputRef={createRef()}
        onSave={noop}
        onRestart={noop}
        onFullscreen={noop}
        onAbout={noop}
        onDownload={noop}
        onPickBackup={noop}
      />,
    );

  it("the fullscreen button's visible text matches its accessible name in both states", () => {
    expect(toolbar(false)).toMatch(/aria-label="Fullscreen"[^>]*>.*?<span[^>]*>Fullscreen<\/span>/s);
    expect(toolbar(true)).toMatch(/aria-label="Exit fullscreen"[^>]*>.*?<span[^>]*>Exit fullscreen<\/span>/s);
  });

  it('the network word for an account that may not use it', () => {
    const html = render(
      <Toolbar
        state={toolbarState({ phase: 'running', desktopReady: true, lastSave: null, saving: false, dirty: false, net: 'not-eligible' })}
        storeKind="indexeddb"
        busy={false}
        ready
        fullscreen={false}
        fullscreenAvailable
        fileInputRef={createRef()}
        onSave={noop}
        onRestart={noop}
        onFullscreen={noop}
        onAbout={noop}
        onDownload={noop}
        onPickBackup={noop}
      />,
    );
    expect(html).toContain('Network not available for this account.');
    expect(html).not.toContain('Network off');
  });
});
