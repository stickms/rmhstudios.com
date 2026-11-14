import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useGameSession } from '@/hooks/useGameSession';
import { useLobbyInvite } from '@/hooks/useLobbyLink';
import {
  hearthworksStore,
  useHearthworks,
} from '@features/hearthworks/engine/store';
import { leaveLobby } from '@features/hearthworks/engine/net/lobby';
import {
  loadWorld,
  saveWorld,
} from '@features/hearthworks/engine/save';
import { Hud } from './Hud';
import { MainMenu } from './MainMenu';
import Scene from './scene/Scene';
import './hearthworks.css';

const SLOT =
  'main';
const AUTOSAVE_MS = 20_000;

/** Hearthworks — one world, drawn isometrically here (the third-person view arrives with the avatar). */
export default function HearthworksGame() {
  // The game opens on its main menu; the world loads (and is paused) behind it. Start / Continue lifts the menu,
  // and the HUD's "Main menu" chip brings it back — nothing is reset either way, the save keeps autosaving.
  const [
    inMenu,
    setInMenu,
  ] =
    useState(
      true,
    );
  const [
    hasSave,
    setHasSave,
  ] =
    useState(
      false,
    );
  const [
    togetherSignal,
    setTogetherSignal,
  ] =
    useState(
      0,
    );
  const shared =
    useHearthworks(
      (
        s,
      ) =>
        s.driver !==
        null,
    );
  // An invite link goes straight to the world: the multiplayer panel that joins it lives in the HUD.
  const invite =
    useLobbyInvite();
  useEffect(() => {
    if (
      invite
    )
      setInMenu(
        false,
      );
  }, [
    invite,
  ]);
  const play =
    useCallback(() => {
      setHasSave(
        true,
      );
      setInMenu(
        false,
      );
    }, []);
  const playTogether =
    useCallback(() => {
      setTogetherSignal(
        (
          n,
        ) =>
          n +
          1,
      );
      play();
    }, [
      play,
    ]);
  const toMenu =
    useCallback(
      () =>
        setInMenu(
          true,
        ),
      [],
    );

  // Wake lock while playing and quiet chrome; the sim itself stops with the tab (no rAF while hidden).
  useGameSession(
    {
      id: 'hearthworks',
      active:
        !inMenu,
    },
  );

  useEffect(() => {
    let cancelled = false;
    void loadWorld(
      SLOT,
    ).then(
      (
        saved,
      ) => {
        if (
          !saved ||
          cancelled
        )
          return;
        hearthworksStore
          .getState()
          .replaceWorld(
            saved,
          );
        setHasSave(
          true,
        );
      },
    );
    // Joined someone else's world? The personal save is the offline world set aside, never the shared one.
    const save =
      () => {
        const s =
          hearthworksStore.getState();
        void saveWorld(
          SLOT,
          s
            .stash
            ?.world ??
            s.world,
        );
      };
    const timer =
      window.setInterval(
        save,
        AUTOSAVE_MS,
      );
    const onHide =
      () => {
        if (
          document.visibilityState ===
          'hidden'
        )
          save();
      };
    document.addEventListener(
      'visibilitychange',
      onHide,
    );
    window.addEventListener(
      'pagehide',
      save,
    );
    return () => {
      cancelled = true;
      // Leaving the page hands a hosted world to its successor (a no-op when multiplayer was never opened).
      leaveLobby();
      window.clearInterval(
        timer,
      );
      document.removeEventListener(
        'visibilitychange',
        onHide,
      );
      window.removeEventListener(
        'pagehide',
        save,
      );
      save();
    };
  }, []);

  return (
    <div
      className="hw"
      data-jelly-zone="playfield"
    >
      {/* Behind the menu the world neither draws nor takes focus — except a shared one, which must keep ticking. */}
      <div
        className="hw-world"
        inert={
          inMenu
        }
      >
        <Scene
          paused={
            inMenu &&
            !shared
          }
        />
        <Hud
          onMainMenu={
            toMenu
          }
          togetherSignal={
            togetherSignal
          }
        />
      </div>
      {inMenu && (
        <MainMenu
          hasSave={
            hasSave
          }
          onStart={
            play
          }
          onTogether={
            playTogether
          }
        />
      )}
    </div>
  );
}
