import { describe, expect, it } from 'vitest';
import { runPrepaint } from '@/lib/__tests__/prepaint-harness';
import { buildPrepaintConfig } from '../config';

/** The generated script's steps, run end to end in a fake DOM (see prepaint-harness). */
describe('pre-paint steps', () => {
  it('locale: cookie → lang/dir, unknown falls back to en, RTL for ar', () => {
    expect(runPrepaint({ cookie: 'a=b; rmh-lang=ar' }).attrs.get('dir')).toBe('rtl');
    const de = runPrepaint({ cookie: 'rmh-lang=de' });
    expect(de.html.lang).toBe('de');
    expect(de.attrs.get('dir')).toBe('ltr');
    expect(runPrepaint({ cookie: 'rmh-lang=xx' }).html.lang).toBe('en');
    expect(runPrepaint().html.lang).toBe('en');
  });

  it('platform: marks iOS WebKit, not iOS Chrome or desktop', () => {
    const safari =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
    expect(runPrepaint({ userAgent: safari }).classes.has('ios-webkit')).toBe(true);
    expect(
      runPrepaint({ userAgent: safari + ' CriOS/120 Chrome/120' }).classes.has('ios-webkit'),
    ).toBe(false);
    expect(
      runPrepaint({
        userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17 Safari/605.1.15',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      }).classes.has('ios-webkit'),
    ).toBe(true);
  });

  it('access: text spacing, caption style and bedtime from rmh-access', () => {
    const run = runPrepaint({
      storage: {
        'rmh-access': JSON.stringify({
          spacing: 'wide',
          captionSize: 'xl',
          captionBg: 'solid',
          bedtime: true,
        }),
        'rmh-quiet-hours': '0,1440',
      },
      now: new Date(2026, 5, 15, 12, 0),
    });
    expect(run.attrs.get('data-text-spacing')).toBe('wide');
    expect(run.props.get('--rmh-ts-lh')).toBe('1.8');
    expect(run.props.get('--rmh-cue-scale')).toBe('1.7');
    expect(run.props.get('--rmh-cue-bg')).toBe('rgb(0 0 0 / 0.95)');
    expect(run.attrs.get('data-bedtime')).toBe('1');
  });

  it('account seed: writes land before the theme step reads them; null removes', () => {
    const run = runPrepaint({
      storage: { 'rmh-style': 'default', 'rmh-density': 'compact' },
      config: buildPrepaintConfig({ seed: { 'rmh-style': 'graphite', 'rmh-density': null } }),
    });
    expect(run.classes.has('style-graphite')).toBe(true);
    expect(run.html.style.backgroundColor).toBe('#000000');
    expect(run.attrs.has('data-density')).toBe(false);
  });

  it('cookie consent: stamps the class for an answered notice; media-reveal is installed', () => {
    expect(
      runPrepaint({ storage: { 'rmh-cookie-consent': 'all' } }).classes.has('cookie-consented'),
    ).toBe(true);
    expect(runPrepaint().classes.has('cookie-consented')).toBe(false);
    const run = runPrepaint();
    expect(run.classes.has('media-reveal')).toBe(true);
    expect(run.listeners).toEqual(['load', 'error']);
  });

  it('the Discord head never ran media-reveal or cookie-consent, and still does not', () => {
    const run = runPrepaint({
      storage: { 'rmh-cookie-consent': 'all' },
      config: buildPrepaintConfig({ discord: true }),
    });
    expect(run.classes.has('media-reveal')).toBe(false);
    expect(run.classes.has('cookie-consented')).toBe(false);
    expect(run.classes.has('style-graphite')).toBe(true);
  });

  it('app route: grounds from the per-page table and the body script paints the body', () => {
    const run = runPrepaint({ path: '/slice-it', storage: {} });
    expect(run.classes.has('app-route')).toBe(true);
    expect(run.attrs.get('data-app-dark')).toBe('1');
    expect(run.html.style.backgroundColor).toBe('#0b1241');
    expect(run.runBody().style.backgroundColor).toBe('#0b1241');
    // A site page leaves the body transparent.
    expect(runPrepaint({ path: '/' }).runBody().style.backgroundColor).toBe('');
  });

  it('one failing step never blocks the others', () => {
    // No config block: theme/seed skip themselves, the rest still run.
    const noCfg = runPrepaint({ noConfigBlock: true, cookie: 'rmh-lang=de' });
    expect(noCfg.html.lang).toBe('de');
    expect(noCfg.classes.has('media-reveal')).toBe(true);
    // Blocked storage: everything that needs it skips; platform/locale/media-reveal run.
    const broken = runPrepaint({ brokenStorage: true, cookie: 'rmh-lang=ar' });
    expect(broken.attrs.get('dir')).toBe('rtl');
    expect(broken.classes.has('media-reveal')).toBe(true);
  });
});
