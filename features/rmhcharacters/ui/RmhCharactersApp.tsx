/**
 * RMHCharacters: the roster and one open character. The open character's id
 * rides in the URL hash (`#c=<id>`), so a reload or the back button lands on
 * the same sheet without a route per character. Parties (the Parties list at
 * `#parties`, one party at `#p=<id>`, an invite link at `?party=<code>`) live
 * in the same page. Characters are saved to the
 * signed-in account (engine/store.ts), so a signed-out visitor gets the sign-in
 * prompt here; the route itself renders for everyone so its link preview works
 * (app/routes/rmhcharacters.tsx).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollText, LogOut } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { useQuitGame } from '@/hooks/useQuitGame';
import { useRoster, flushRoster } from '@features/rmhcharacters/engine/store';
import { Editor5e } from './dnd5e/Editor5e';
import { EditorPf2e } from './pf2e/EditorPf2e';
import { JoinParty } from './JoinParty';
import { Parties } from './Parties';
import { PartyView } from './PartyView';
import { Roster } from './Roster';

type View =
  | { kind: 'roster' }
  | { kind: 'character'; id: string }
  | { kind: 'parties' }
  | { kind: 'party'; id: string }
  | { kind: 'join'; code: string };

/** The screen the URL names: an invite code in the query, else the hash (`#c=`, `#p=`, `#parties`). */
function readView(): View {
  if (typeof location === 'undefined') return { kind: 'roster' };
  const code = /^[\w-]{8,16}$/.exec(new URLSearchParams(location.search).get('party') ?? '')?.[0];
  if (code) return { kind: 'join', code };
  const c = /^#c=([\w-]+)$/.exec(location.hash)?.[1];
  if (c) return { kind: 'character', id: c };
  const p = /^#p=([\w-]+)$/.exec(location.hash)?.[1];
  if (p) return { kind: 'party', id: p };
  if (location.hash === '#parties') return { kind: 'parties' };
  return { kind: 'roster' };
}

export default function RmhCharactersApp() {
  const { t } = useTranslation('c-rmhcharacters');
  const { data: session, isPending } = useSession();
  const quit = useQuitGame();
  // A signed-out player who opened an invite link comes back to it after signing in.
  const invite = readView();
  if (isPending) return <main className="app-page" />;
  if (!session?.user) {
    return (
      <main className="app-page">
        <div className="rmhc-page">
          <div className="flex justify-end">
            <Button type="button" variant="ghost" onClick={quit}>
              <LogOut aria-hidden /> {t('roster.exit', { defaultValue: 'Exit' })}
            </Button>
          </div>
          <SignedOutPrompt
            icon={ScrollText}
            title={t('signin.title', { defaultValue: 'Sign in to build your characters' })}
            description={t('signin.body', {
              defaultValue:
                'RMHCharacters builds and runs D&D 5e (2024) and Pathfinder 2e (Remaster) characters, with a rules advisor you can ask anything. Characters are saved to your account, so they open on any device.',
            })}
            callbackURL={invite.kind === 'join' ? `/rmhcharacters?party=${invite.code}` : '/rmhcharacters'}
          />
        </div>
      </main>
    );
  }
  return <SignedInApp />;
}

function SignedInApp() {
  const { t } = useTranslation('c-rmhcharacters');
  const load = useRoster((s) => s.load);
  const status = useRoster((s) => s.status);
  const [view, setView] = useState<View>(readView);
  const openId = view.kind === 'character' ? view.id : null;
  const character = useRoster((s) => s.characters.find((c) => c.id === openId));

  useEffect(() => {
    void load();
    const onHash = () => setView(readView());
    const onHide = () => flushRoster();
    window.addEventListener('hashchange', onHash);
    // Back and forward between an invite link (a query) and a hash view change no hash, so popstate re-reads too.
    window.addEventListener('popstate', onHash);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
      window.removeEventListener('pagehide', onHide);
      flushRoster();
    };
  }, [load]);

  const go = (next: View) => {
    const url =
      next.kind === 'character'
        ? `#c=${next.id}`
        : next.kind === 'party'
          ? `#p=${next.id}`
          : next.kind === 'parties'
            ? '#parties'
            : next.kind === 'join'
              ? `?party=${next.code}`
              : '';
    // The roster, a party and a character drop the invite code from the query; the join screen keeps it.
    history.pushState(null, '', location.pathname + url);
    setView(next);
    window.scrollTo(0, 0);
  };
  const open = (id: string | null) => go(id ? { kind: 'character', id } : { kind: 'roster' });

  return (
    <main className="app-page">
      <div className="rmhc-page">
        {status === 'loading' || status === 'idle' ? (
          <p className="py-8 text-sm text-app-text-muted">
            {t('app.loading', { defaultValue: 'Loading your characters…' })}
          </p>
        ) : status === 'error' ? (
          <div className="flex flex-col items-start gap-3 py-8">
            <p role="alert" className="text-sm text-app-text">
              {t('app.loadFailed', { defaultValue: 'Your characters could not be loaded.' })}
            </p>
            <Button
              type="button"
              onClick={() => {
                useRoster.setState({ status: 'idle' });
                void load();
              }}
            >
              {t('app.retry', { defaultValue: 'Try again' })}
            </Button>
          </div>
        ) : view.kind === 'join' ? (
          <JoinParty
            code={view.code}
            onJoined={(id) => go({ kind: 'party', id })}
            onCancel={() => go({ kind: 'parties' })}
          />
        ) : view.kind === 'party' ? (
          <PartyView
            id={view.id}
            onBack={() => go({ kind: 'parties' })}
            onBring={(code) => go({ kind: 'join', code })}
          />
        ) : view.kind === 'parties' ? (
          <Parties onBack={() => go({ kind: 'roster' })} onOpen={(id) => go({ kind: 'party', id })} />
        ) : character?.system === 'dnd5e' ? (
          <Editor5e key={character.id} c={character} onBack={() => open(null)} />
        ) : character?.system === 'pf2e' ? (
          <EditorPf2e key={character.id} c={character} onBack={() => open(null)} />
        ) : (
          <Roster onOpen={open} onParties={() => go({ kind: 'parties' })} />
        )}
      </div>
    </main>
  );
}
