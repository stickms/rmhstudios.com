import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '@/components/session/session-context';
import { useGameSession } from '@/hooks/useGameSession';
import type { SaveOrigin } from '@/lib/game-saves/conflict';
import { useLobbyInvite } from '@/hooks/useLobbyLink';
import { hearthworksStore, useHearthworks } from '@features/hearthworks/engine/store';
import { leaveLobby } from '@features/hearthworks/engine/net/lobby';
import {
  createAccountSave,
  loadWorld,
  saveWorld,
  type AccountStatus,
  type TownCopy,
} from '@features/hearthworks/engine/save';
import { Hud } from './Hud';
import { MainMenu } from './MainMenu';
import Scene from './scene/Scene';
import './hearthworks.css';

const SLOT = 'main';
const AUTOSAVE_MS = 20_000;

/**
 * The town this tab would save, and whether it is a shared world's (never sent to the account). A joined session saves
 * the offline world set aside, which is the member's own; a hosted one carries the other players, so it stays local.
 */
function currentTown() {
  const s = hearthworksStore.getState();
  return { world: s.stash?.world ?? s.world, shared: s.driver !== null && s.stash === null };
}

/** Hearthworks — one world, drawn isometrically here (the third-person view arrives with the avatar). */
export default function HearthworksGame() {
  // The game opens on its main menu; the world loads (and is paused) behind it. Start / Continue lifts the menu,
  // and the HUD's "Main menu" chip brings it back — nothing is reset either way, the save keeps autosaving.
  const [inMenu, setInMenu] = useState(true);
  const [hasSave, setHasSave] = useState(false);
  const [togetherSignal, setTogetherSignal] = useState(0);
  const shared = useHearthworks((s) => s.driver !== null);
  // An invite link goes straight to the world: the multiplayer panel that joins it lives in the HUD.
  const invite = useLobbyInvite();
  useEffect(() => {
    if (invite) setInMenu(false);
  }, [invite]);
  // The local copy is IndexedDB, first and always; the account copy follows it (features/hearthworks/engine/save/account.ts).
  const session = useSession();
  const userId = session.data?.user?.id ?? null;
  const sessionPending = session.isPending;
  const [account] = useState(createAccountSave);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>(() => account.status());
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<{ local: TownCopy; cloud: TownCopy } | null>(null);
  // Another device saved since this one last read the account (a 409): the choice opens with the menu.
  const [stale, setStale] = useState(false);
  // Both copies are known. Until then nothing is autosaved (an empty town must not replace the saved one) and Start waits.
  const [loaded, setLoaded] = useState(false);
  const ready = useRef(false);
  const owner = useRef<string | null>(null);
  const play = useCallback(() => {
    if (!ready.current) return;
    setHasSave(true);
    setInMenu(false);
  }, []);
  const playTogether = useCallback(() => {
    if (!ready.current) return;
    setTogetherSignal((n) => n + 1);
    play();
  }, [play]);
  const toMenu = useCallback(() => setInMenu(true), []);

  // Wake lock while playing and quiet chrome; the sim itself stops with the tab (no rAF while hidden).
  useGameSession({
    id: 'hearthworks',
    active: !inMenu,
  });

  useEffect(() => account.subscribe(setAccountStatus), [account]);

  // Open: read this device's town, then the account's, and let the player choose if both moved on.
  useEffect(() => {
    if (sessionPending) return;
    let cancelled = false;
    ready.current = false;
    setLoaded(false);
    setConflict(null);
    owner.current = userId;
    account.setIdentity(userId);
    void (async () => {
      const stored = await loadWorld(SLOT, userId);
      const result = await account.resolveOnOpen(stored ? { world: stored.world, savedAt: stored.savedAt } : null);
      if (cancelled) return;
      if (result.kind === 'conflict') {
        setConflict({ local: result.local, cloud: result.cloud });
        return;
      }
      if (result.world) {
        hearthworksStore.getState().replaceWorld(result.world);
        setHasSave(true);
        // A town that came from the account is this device's copy from now on.
        if (result.world !== stored?.world) void saveWorld(SLOT, result.world, userId);
      }
      ready.current = true;
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [account, sessionPending, userId]);

  // The next time the menu opens after a 409, offer the choice (nothing is overwritten before the player picks).
  useEffect(() => {
    if (!inMenu || !stale || conflict || !ready.current || hearthworksStore.getState().driver) return;
    let cancelled = false;
    void (async () => {
      const { world } = currentTown();
      const result = await account.reconcileStale({ world, savedAt: Date.now() });
      if (cancelled) return;
      if (result.kind === 'conflict') setConflict({ local: result.local, cloud: result.cloud });
      else if (!account.isStale()) setStale(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [account, conflict, inMenu, stale]);

  // Autosave: the local copy first, then the account's (throttled and only when the town changed).
  useEffect(() => {
    const persist = async () => {
      if (!ready.current) return;
      const { world, shared } = currentTown();
      await saveWorld(SLOT, world, owner.current);
      const result = await account.uploadIfChanged(world, { shared });
      if (result.kind === 'stale') setStale(true);
      void account.prepareBeacon(world, { shared });
    };
    const timer = window.setInterval(() => void persist(), AUTOSAVE_MS);
    const onHide = () => {
      if (document.visibilityState === 'hidden') void persist();
    };
    const onPageHide = () => {
      if (!ready.current) return;
      const { world, shared } = currentTown();
      void saveWorld(SLOT, world, owner.current);
      account.beaconOnHide(world, { shared });
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      // Leaving the page hands a hosted world to its successor (a no-op when multiplayer was never opened).
      leaveLobby();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      if (ready.current) {
        const { world } = currentTown();
        void saveWorld(SLOT, world, owner.current);
      }
    };
  }, [account]);

  const saveToAccount = useCallback(async () => {
    setSaving(true);
    try {
      const { world, shared } = currentTown();
      await saveWorld(SLOT, world, owner.current);
      const result = await account.enable(world, { shared });
      if (result.kind === 'stale') setStale(true);
    } finally {
      setSaving(false);
    }
  }, [account]);

  const choose = useCallback(
    async (origin: SaveOrigin) => {
      if (!conflict) return;
      const world = await account.keep(origin, conflict);
      if (hearthworksStore.getState().world !== world) hearthworksStore.getState().replaceWorld(world);
      void saveWorld(SLOT, world, owner.current);
      setHasSave(true);
      setStale(false);
      setConflict(null);
      ready.current = true;
      setLoaded(true);
    },
    [account, conflict],
  );

  return (
    <div className="hw" data-jelly-zone="playfield">
      {/* Behind the menu the world neither draws nor takes focus — except a shared one, which must keep ticking. */}
      <div className="hw-world" inert={inMenu}>
        <Scene paused={inMenu && !shared} />
        <Hud onMainMenu={toMenu} togetherSignal={togetherSignal} />
      </div>
      {inMenu && (
        <MainMenu
          hasSave={hasSave}
          account={{
            status: loaded || conflict ? accountStatus : 'checking',
            loaded,
            saving,
            onSave: () => void saveToAccount(),
          }}
          conflict={conflict && { ...conflict, onChoose: (origin) => void choose(origin) }}
          onStart={play}
          onTogether={playTogether}
        />
      )}
    </div>
  );
}
