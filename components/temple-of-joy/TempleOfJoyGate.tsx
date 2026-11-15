/**
 * The gate — resolve the save before the temple opens.
 *
 * It used to resolve the *session* too, and bounce anyone without one to
 * `/login`. It no longer does. An idle game is the least account-shaped thing on
 * this site: nothing in it is shared, nothing in it is competitive, and the only
 * reason it ever wanted an account was to have somewhere to put the save. There
 * is somewhere else — this browser — so a signed-out visitor now simply plays,
 * and their temple is waiting for them if they sign in later.
 *
 * What signing in buys is stated where it is true rather than at the door: the
 * save follows you to another device. That line lives in Settings, next to the
 * save, with a button.
 *
 * Once the save is known the title screen opens (`TempleMenu`): Enter starts the
 * game exactly as it always started, Quit is the one way out to the games list.
 *
 * The loading screen is the temple's own, not a generic spinner: it is the
 * first thing anyone sees and it should already feel like the game.
 */

import './temple-of-joy.css';
import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useCloudSave } from '@/hooks/useCloudSave';
import {
  saveToState,
  stateToSave,
  summarizeTempleSave,
  templeSave,
} from '@/lib/temple-of-joy/persistence';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import type { SaveData } from '@/lib/temple-of-joy/types';
import { MainMenuContext } from './menu-context';
import { TempleMenu } from './TempleMenu';
import { TempleOfJoyGame } from './TempleOfJoyGame';
import { TempleButton } from './ui';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

function LoadingScreen() {
  const {
    t,
  } =
    useTranslation(
      'c-temple-of-joy',
    );
  return (
    <div
      className="toj"
      data-theme="dawn"
    >
      <div
        className="toj-loading"
        role="status"
      >
        <h1 className="toj-loading-title">
          Temple
          of
          Joy
        </h1>
        <p className="toj-loading-note">
          {t(
            'entering-the-temple',
            {
              defaultValue:
                'Opening the doors…',
            },
          )}
        </p>
      </div>
    </div>
  );
}

export function TempleOfJoyGate() {
  const {
    t,
  } =
    useTranslation(
      'c-temple-of-joy',
    );

  const cloud =
    useCloudSave(
      templeSave,
      {
        gameName:
          'Temple of Joy',
        // The store's own summary runs in `lib/`, where there is no translator, so
        // it emits English. Here there is one.
        summarize:
          (
            save,
          ) =>
            summarizeTempleSave(
              save,
              t,
            ),
      },
    );

  // Which screen is up. The title screen comes first, every time the doors
  // open; the game is mounted only once the player walks in, and unmounted
  // again by "Main menu" in Settings (which saves on the way out).
  const [
    view,
    setView,
  ] =
    useState<
      | 'menu'
      | 'game'
    >(
      'menu',
    );
  // The temple as it was left. After a run, the cloud save the gate resolved is
  // stale, so the menu and the next entry read this instead.
  const [
    resume,
    setResume,
  ] =
    useState<SaveData | null>(
      null,
    );

  // A new identity or a reload re-resolves the save; start from the title.
  useEffect(() => {
    if (
      cloud.status !==
      'ready'
    ) {
      setView(
        'menu',
      );
      setResume(
        null,
      );
    }
  }, [
    cloud.status,
  ]);

  const returnToMenu =
    useCallback(() => {
      setResume(
        stateToSave(
          useTempleStore.getState(),
        ),
      );
      setView(
        'menu',
      );
    }, []);

  // What replaces the loading screen fades in (M9).
  const arrival =
    useArrival(
      cloud.status !==
        'loading',
    );

  if (
    cloud.status ===
    'loading'
  )
    return (
      <LoadingScreen />
    );

  // The cloud save could not be resolved, so neither copy is known. Mounting a
  // fresh temple here would let its autosave overwrite the account's save, so
  // the doors stay shut until a retry resolves it.
  if (
    cloud.status ===
    'failed'
  ) {
    return (
      <div
        className="toj"
        data-theme="dawn"
      >
        <div
          className={cn(
            'toj-loading',
            arrival,
          )}
          role="alert"
        >
          <h1 className="toj-loading-title">
            Temple
            of
            Joy
          </h1>
          <p className="toj-loading-note">
            {t(
              'save-load-failed',
              {
                defaultValue:
                  'Your save could not be loaded.',
              },
            )}
          </p>
          <TempleButton
            variant="gold"
            onClick={
              cloud.reload
            }
          >
            {t(
              'save-load-retry',
              {
                defaultValue:
                  'Try again',
              },
            )}
          </TempleButton>
        </div>
      </div>
    );
  }

  // Two temples that have both been played. The dialog is the only way out of
  // this state — see `SaveConflictDialog` for why it cannot be dismissed — and
  // the game is deliberately not mounted behind it: an autosave from a temple
  // nobody has chosen yet would overwrite the very save being offered.
  if (
    cloud.status ===
    'conflict'
  ) {
    return (
      <div
        className="toj"
        data-theme="dawn"
      >
        <div className="toj-loading">
          <h1 className="toj-loading-title">
            Temple
            of
            Joy
          </h1>
        </div>
        {
          cloud.conflictDialog
        }
      </div>
    );
  }

  const save =
    resume ??
    cloud.save;

  if (
    view ===
    'menu'
  ) {
    const menu =
      (
        <TempleMenu
          save={
            save
          }
          onEnter={() =>
            setView(
              'game',
            )
          }
        />
      );
    return arrival ? (
      <div className="arrive-group">
        {
          menu
        }
      </div>
    ) : (
      menu
    );
  }

  return (
    <MainMenuContext.Provider
      value={
        returnToMenu
      }
    >
      <TempleOfJoyGame
        initialSave={
          save
            ? saveToState(
                save,
              )
            : null
        }
      />
    </MainMenuContext.Provider>
  );
}
