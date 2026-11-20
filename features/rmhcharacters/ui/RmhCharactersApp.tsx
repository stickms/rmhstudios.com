/**
 * RMHCharacters: the roster and one open character. The open character's id
 * rides in the URL hash (`#c=<id>`), so a reload or the back button lands on
 * the same sheet without a route per character. Characters are saved to the
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
import { Roster } from './Roster';

const readHash = () => (typeof location === 'undefined' ? null : (/^#c=([\w-]+)$/.exec(location.hash)?.[1] ?? null));

export default function RmhCharactersApp() {
  const { t } = useTranslation('c-rmhcharacters');
  const { data: session, isPending } = useSession();
  const quit = useQuitGame();
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
            callbackURL="/rmhcharacters"
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
  const [openId, setOpenId] = useState<string | null>(readHash);
  const character = useRoster((s) => s.characters.find((c) => c.id === openId));

  useEffect(() => {
    void load();
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
        {status === 'loading' || status === 'idle' ? (
          <p className="py-8 text-sm text-app-text-muted">{t('app.loading', { defaultValue: 'Loading your characters…' })}</p>
        ) : status === 'error' ? (
          <div className="flex flex-col items-start gap-3 py-8">
            <p role="alert" className="text-sm text-app-text">
              {t('app.loadFailed', { defaultValue: 'Your characters could not be loaded.' })}
            </p>
            <Button type="button" onClick={() => {
                useRoster.setState({ status: 'idle' });
                void load();
              }}>
              {t('app.retry', { defaultValue: 'Try again' })}
            </Button>
          </div>
        ) : character?.system === 'dnd5e' ? (
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
