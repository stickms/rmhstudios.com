/**
 * Massive March — the shell.
 *
 * Owns the socket's lifetime and decides which of the four screens is up. The
 * world itself is loaded lazily: it drags in three.js, the terrain mesh builder
 * and a few thousand instanced trees, and none of that should be on the critical
 * path of a person who opened the page to read the campaign list.
 */

'use client';

import { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { useSession } from '@/components/Providers';
import { connectMassiveMarch, disconnectMassiveMarch } from '@/lib/massive-march/net/client';
import { useMmStore } from '@/lib/massive-march/store';
import { stopVoice } from '@/lib/massive-march/voice';
import { LAND } from '@/lib/massive-march/palette';
import { MainMenu } from './screens/MainMenu';
import { Lobby } from './screens/Lobby';
import { Ending } from './screens/Ending';
import { BOARD, INK, MarchButton, Panel } from './ui';

const WorldView = lazy(() =>
  import('./world/WorldView').then((m) => ({ default: m.WorldView })),
);

export function MassiveMarchGame() {
  const { t } = useTranslation('c-massive-march');
  const { data: session, isPending } = useSession();
  const screen = useMmStore((s) => s.screen);
  const connection = useMmStore((s) => s.connection);
  const signedIn = Boolean(session?.user);

  useEffect(() => {
    if (!signedIn) return;
    void connectMassiveMarch().catch(() => {
      // The store already carries `error`; nothing useful to add here.
    });
    return () => {
      stopVoice();
      disconnectMassiveMarch();
    };
  }, [signedIn]);

  if (isPending) {
    return <Standby>{t('loading', { defaultValue: 'Getting your boots…' })}</Standby>;
  }

  if (!signedIn) {
    return (
      <div
        className="app-page items-center-safe justify-center-safe flex px-5"
        style={{ background: LAND.waterDeep }}
      >
        <Panel className="w-full max-w-md space-y-4">
          <h1 className="text-2xl font-black tracking-tight">
            {t('signin-title', { defaultValue: 'Massive March' })}
          </h1>
          <p className="text-sm leading-relaxed opacity-80">
            {t('signin-body', {
              defaultValue:
                'A campaign is a save, and a save belongs to an account — so you need to be signed in before you can start one or walk somebody else’s.',
            })}
          </p>
          <Link to="/login" search={{ callbackURL: '/massive-march' }}>
            <MarchButton tone="primary" className="w-full">
              {t('signin-action', { defaultValue: 'Sign in' })}
            </MarchButton>
          </Link>
        </Panel>
      </div>
    );
  }

  if (screen === 'world') {
    return (
      <Suspense fallback={<Standby>{t('entering', { defaultValue: 'Walking down to the beach…' })}</Standby>}>
        <WorldView />
      </Suspense>
    );
  }

  if (screen === 'ending') return <Ending />;
  if (screen === 'lobby') return <Lobby />;

  return <MainMenu connecting={connection === 'connecting'} />;
}

function Standby({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="app-viewport items-center-safe justify-center-safe flex"
      style={{ background: LAND.waterDeep, color: BOARD }}
    >
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <span
          aria-hidden
          className="block size-6 animate-pulse"
          style={{ background: BOARD, borderRadius: 2, border: `3px solid ${INK}` }}
        />
        <p className="text-sm font-bold tracking-[0.16em] uppercase">{children}</p>
      </div>
    </div>
  );
}
