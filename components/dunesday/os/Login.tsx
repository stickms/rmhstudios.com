'use client';

/**
 * The Dunesday 7 logon screen — a homage to the Windows 7 welcome screen.
 *
 * - The user tile is the visitor's real RMH Studios profile (name and picture)
 *   when they are signed in to the site, otherwise Guest. "Switch user" shows
 *   both, and offers a real sign-in for a signed-out visitor.
 * - ANY password works, including none. The password never leaves this
 *   component: it is not stored, logged or sent anywhere, and the screen says
 *   so. It is a costume, not a credential prompt.
 * - Caps Lock warning, Ease of Access (larger text, high contrast, reduced
 *   motion, sounds) and a power menu (Shut down, Restart) like the original.
 * - Fully keyboard and screen-reader operable: a labelled form, live region
 *   for status, every icon-only control named.
 */

import { AnimatePresence, m as motion } from 'framer-motion';
import { Accessibility, ArrowRight, ChevronUp, LogIn, Power, RotateCcw, Users } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { sfx } from '../sound';
import { BusySpinner } from './BusySpinner';
import { PopupMenu, type MenuItem } from './Menu';
import { useOs } from './store';
import { useProfile } from './useProfile';
import { UserTile } from './UserTile';

type Step = 'password' | 'switch' | 'welcome';

export function Login({
  locked,
  muted,
  onToggleMuted,
  onLogin,
  onShutdown,
  onRestart,
}: {
  locked: boolean;
  muted: boolean;
  onToggleMuted: () => void;
  onLogin: (as: 'profile' | 'guest') => void;
  onShutdown: () => void;
  onRestart: () => void;
}) {
  const { t } = useTranslation('c-dunesday');
  const profile = useProfile();
  const prefs = useOs((s) => s.prefs);
  const setPrefs = useOs((s) => s.setPrefs);
  const [step, setStep] = useState<Step>('password');
  const [as, setAs] = useState<'profile' | 'guest'>('profile');
  const [password, setPassword] = useState('');
  const [caps, setCaps] = useState(false);
  const [menu, setMenu] = useState<null | { kind: 'power' | 'ease'; x: number; y: number }>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const shown =
    as === 'guest' || !profile.signedIn
      ? { name: t('guest', { defaultValue: 'Guest' }), image: null }
      : profile;

  useEffect(() => {
    if (step === 'password') inputRef.current?.focus();
  }, [step, as]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // The password is deliberately discarded: any value (or none) unlocks.
    setPassword('');
    setStep('welcome');
    sfx.startup();
    window.setTimeout(() => onLogin(as), 1400);
  };

  const easeItems: MenuItem[] = [
    {
      label: t('ease-text', { defaultValue: 'Make text larger' }),
      checked: prefs.textScale > 1,
      onSelect: () => setPrefs({ textScale: prefs.textScale > 1 ? 1 : 1.25 }),
    },
    {
      label: t('ease-contrast', { defaultValue: 'High contrast' }),
      checked: prefs.highContrast,
      onSelect: () => setPrefs({ highContrast: !prefs.highContrast }),
    },
    {
      label: t('ease-motion', { defaultValue: 'Reduce motion' }),
      checked: prefs.reduceMotion,
      onSelect: () => setPrefs({ reduceMotion: !prefs.reduceMotion }),
    },
    {
      label: t('ease-sounds', { defaultValue: 'Play sounds' }),
      checked: !muted,
      onSelect: onToggleMuted,
    },
  ];
  const powerItems: MenuItem[] = [
    {
      label: t('power-restart', { defaultValue: 'Restart' }),
      icon: <RotateCcw size={14} />,
      onSelect: onRestart,
    },
    {
      label: t('power-shutdown', { defaultValue: 'Shut down' }),
      icon: <Power size={14} />,
      onSelect: onShutdown,
      bold: true,
    },
  ];

  return (
    <main className="ds-logon" aria-labelledby="ds-logon-title">
      <div className="ds-logon-bg" aria-hidden="true">
        <svg viewBox="0 0 1440 900" preserveAspectRatio="none">
          <defs>
            <linearGradient id="ds-logon-sw" x1="0" x2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#bfe8ff" stopOpacity="0.55" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            className="ds-logon-sw1"
            d="M-100 640 C 300 460 720 760 1100 520 S 1500 420 1600 460"
            stroke="url(#ds-logon-sw)"
            strokeWidth="60"
            fill="none"
          />
          <path
            className="ds-logon-sw2"
            d="M-100 700 C 340 560 760 800 1150 580 S 1500 500 1600 520"
            stroke="url(#ds-logon-sw)"
            strokeWidth="14"
            fill="none"
          />
          <path
            className="ds-logon-sw3"
            d="M-100 560 C 260 460 640 640 1040 470 S 1480 360 1600 380"
            stroke="url(#ds-logon-sw)"
            strokeWidth="5"
            fill="none"
          />
        </svg>
        <div className="ds-logon-glow" />
      </div>

      <h1 id="ds-logon-title" className="ds-sr-only">
        {t('logon-title', { defaultValue: 'Dunesday 7 — log on' })}
      </h1>

      <div className="ds-logon-center">
        <AnimatePresence mode="wait">
          {step === 'welcome' ? (
            <motion.div
              key="welcome"
              className="ds-logon-welcome"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <BusySpinner size={44} label={t('logon-welcome', { defaultValue: 'Welcome' })} />
            </motion.div>
          ) : step === 'switch' ? (
            <motion.div
              key="switch"
              className="ds-logon-switch"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <ul
                className="ds-logon-tiles"
                aria-label={t('logon-users', { defaultValue: 'Users' })}
              >
                {profile.signedIn && (
                  <li>
                    <button
                      type="button"
                      className="ds-logon-tilebtn"
                      onClick={() => {
                        setAs('profile');
                        setStep('password');
                      }}
                    >
                      <UserTile image={profile.image} size={96} />
                      <span>{profile.name}</span>
                    </button>
                  </li>
                )}
                <li>
                  <button
                    type="button"
                    className="ds-logon-tilebtn"
                    onClick={() => {
                      setAs('guest');
                      setStep('password');
                    }}
                  >
                    <UserTile image={null} size={96} />
                    <span>{t('guest', { defaultValue: 'Guest' })}</span>
                  </button>
                </li>
                {!profile.signedIn && (
                  <li>
                    <a className="ds-logon-tilebtn" href="/login?callbackURL=%2Fdunesday">
                      <span
                        className="ds-usertile ds-logon-signin"
                        style={{ width: 96, height: 96 }}
                        aria-hidden="true"
                      >
                        <LogIn size={40} />
                      </span>
                      <span>{t('logon-rmh', { defaultValue: 'Sign in with RMH Studios' })}</span>
                    </a>
                  </li>
                )}
              </ul>
            </motion.div>
          ) : (
            <motion.form
              key="password"
              className="ds-logon-form"
              onSubmit={submit}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              <UserTile image={shown.image} size={128} className="ds-logon-tile" />
              <p className="ds-logon-name">{shown.name}</p>
              {locked && (
                <p className="ds-logon-locked">{t('logon-locked', { defaultValue: 'Locked' })}</p>
              )}
              <div className="ds-logon-row">
                <label htmlFor="ds-logon-pw" className="ds-sr-only">
                  {t('logon-password', { defaultValue: 'Password' })}
                </label>
                <input
                  ref={inputRef}
                  id="ds-logon-pw"
                  type="password"
                  className="ds-logon-input"
                  placeholder={t('logon-password', { defaultValue: 'Password' })}
                  value={password}
                  autoComplete="off"
                  aria-describedby="ds-logon-hint"
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={(e) => setCaps(e.getModifierState?.('CapsLock') ?? false)}
                  onKeyDown={(e) => setCaps(e.getModifierState?.('CapsLock') ?? false)}
                />
                <button
                  type="submit"
                  className="ds-logon-go"
                  aria-label={t('logon-submit', { defaultValue: 'Log on' })}
                >
                  <ArrowRight size={20} aria-hidden="true" />
                </button>
              </div>
              <div aria-live="polite" className="ds-logon-caps">
                {caps && t('logon-caps', { defaultValue: 'Caps Lock is on.' })}
              </div>
              <p id="ds-logon-hint" className="ds-logon-hint">
                {t('logon-hint', {
                  defaultValue:
                    'Any password works — or none. Nothing you type here is sent or saved.',
                })}
              </p>
              <button
                type="button"
                className="ds-logon-switchbtn"
                onClick={() => setStep('switch')}
              >
                <Users size={16} aria-hidden="true" />
                {t('logon-switch', { defaultValue: 'Switch User' })}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>

      <button
        type="button"
        className="ds-logon-corner ds-logon-ease"
        aria-haspopup="menu"
        aria-expanded={menu?.kind === 'ease'}
        aria-label={t('logon-ease', { defaultValue: 'Ease of Access' })}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ kind: 'ease', x: r.left, y: r.top - 6 });
        }}
      >
        <Accessibility size={22} aria-hidden="true" />
      </button>

      <p className="ds-logon-brand" aria-hidden="true">
        Dunesday<span>7</span> <small>Ultimate</small>
      </p>

      <div className="ds-logon-corner ds-logon-power">
        <button
          type="button"
          className="ds-logon-powerbtn"
          aria-label={t('power-shutdown', { defaultValue: 'Shut down' })}
          onClick={onShutdown}
        >
          <Power size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="ds-logon-powerarrow"
          aria-haspopup="menu"
          aria-expanded={menu?.kind === 'power'}
          aria-label={t('power-options', { defaultValue: 'Shut down options' })}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ kind: 'power', x: r.right - 160, y: r.top - 6 });
          }}
        >
          <ChevronUp size={14} aria-hidden="true" />
        </button>
      </div>

      {menu && (
        <PopupMenu
          at={{ x: menu.x, y: menu.y }}
          placement="above"
          label={
            menu.kind === 'ease'
              ? t('logon-ease', { defaultValue: 'Ease of Access' })
              : t('power-options', { defaultValue: 'Shut down options' })
          }
          items={menu.kind === 'ease' ? easeItems : powerItems}
          onClose={() => setMenu(null)}
        />
      )}
      <div className={cn('ds-sr-only')} aria-live="assertive">
        {step === 'welcome' ? t('logon-welcome', { defaultValue: 'Welcome' }) : ''}
      </div>
    </main>
  );
}
