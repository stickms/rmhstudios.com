/**
 * What /rmhos shows while no machine image has been published (resolveImageManifest returns
 * null): a plain panel in the app shell and the About button. It starts nothing: no emulator, no
 * session request, no tab lock. The home store is opened only when About is, to list the stored
 * copies: a returning person can still download their files if the image is withdrawn later.
 */
import { Info } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/session/session-context';
import AboutDialog from './AboutDialog';
import { usePersisted } from './usePersisted';
import { useStoredHome } from './useStoredHome';

export default function ComingSoon() {
  const { t } = useTranslation('c-rmhos');
  const rootRef = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => setContainer(rootRef.current?.closest<HTMLElement>('.app-theme') ?? null), []);
  const [about, setAbout] = useState(false);
  const { data: account } = useSession();
  const { stored } = useStoredHome(account?.user?.id ?? null);
  const keeping = usePersisted(about);
  return (
    <div className="rmhos-root" ref={rootRef}>
      <div className="rmhos-toolbar" role="group" aria-label={t('toolbar-label', { defaultValue: 'rmhOS controls' })}>
        <div className="rmhos-toolbar-status" />
        <div className="rmhos-toolbar-actions">
          <Button size="sm" aria-label={t('about', { defaultValue: 'About' })} onClick={() => setAbout(true)}>
            <Info aria-hidden="true" />
            <span className="rmhos-toolbar-text">{t('about', { defaultValue: 'About' })}</span>
          </Button>
        </div>
      </div>
      <div className="rmhos-stage">
        <div className="rmhos-boot">
          <div className="rmhos-boot-panel">
            <h1 className="text-lg font-semibold">
              {t('coming-soon-title', { defaultValue: 'rmhOS is coming soon' })}
            </h1>
            <p className="text-sm text-(--app-text-muted)">
              {t('coming-soon-body', { defaultValue: 'The machine image has not been published yet.' })}
            </p>
          </div>
        </div>
      </div>
      <AboutDialog
        open={about}
        onOpenChange={setAbout}
        container={container}
        session={{
          storedCopies: stored.copies,
          exportCopy: stored.exportCopy,
          removeCopy: stored.removeCopy,
          deleteAll: stored.deleteAll,
        }}
        evictionRisk={keeping.risk}
        onKeep={() => void keeping.keep()}
        currentDamaged={false}
      />
    </div>
  );
}
