/**
 * RMHCharacters: the roster and one open character. The open character's id
 * rides in the URL hash (`#c=<id>`), so a reload or the back button lands on
 * the same sheet without a route per character.
 */
import { useEffect, useState } from 'react';
import { useRoster, flushRoster } from '@features/rmhcharacters/engine/store';
import { Editor5e } from './dnd5e/Editor5e';
import { EditorPf2e } from './pf2e/EditorPf2e';
import { Roster } from './Roster';

const readHash = () => (typeof location === 'undefined' ? null : (/^#c=([\w-]+)$/.exec(location.hash)?.[1] ?? null));

export default function RmhCharactersApp() {
  const load = useRoster((s) => s.load);
  const loaded = useRoster((s) => s.loaded);
  const [openId, setOpenId] = useState<string | null>(readHash);
  const character = useRoster((s) => s.characters.find((c) => c.id === openId));

  useEffect(() => {
    load();
    const onHash = () => setOpenId(readHash());
    const onHide = () => flushRoster();
    window.addEventListener('hashchange', onHash);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('pagehide', onHide);
      flushRoster();
    };
  }, [load]);

  const open = (id: string | null) => {
    if (id) history.pushState(null, '', `#c=${id}`);
    else history.pushState(null, '', location.pathname + location.search);
    setOpenId(id);
    window.scrollTo(0, 0);
  };

  return (
    <main className="app-page">
      <div className="rmhc-page">
        {!loaded ? null : character?.system === 'dnd5e' ? (
          <Editor5e key={character.id} c={character} onBack={() => open(null)} />
        ) : character?.system === 'pf2e' ? (
          <EditorPf2e key={character.id} c={character} onBack={() => open(null)} />
        ) : (
          <Roster onOpen={open} />
        )}
      </div>
    </main>
  );
}
