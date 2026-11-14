/**
 * RmhosApp: starts the machine inside the Screen, shows the boot screen until the desktop is
 * ready, and a status line with the save state under it. The machine, the identity handshake
 * and the home-folder sync live in useRmhosSession.tsx. Client only (the route wraps it in
 * ClientOnly): v86 and the canvas have no server render.
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BootScreen from './BootScreen';
import Screen from './Screen';
import { RmhosSessionProvider, useRmhosMachine, type RmhosSessionValue } from './useRmhosSession';

function isPhone(): boolean {
  return window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 768;
}

function SaveStatus({ session }: { session: RmhosSessionValue }) {
  const { t } = useTranslation('c-rmhos');
  const { saving, lastSave } = session;
  let text: string;
  if (saving) text = t('save-saving', { defaultValue: 'Saving' });
  else if (!lastSave) text = t('save-none', { defaultValue: 'Not saved yet' });
  else {
    const time = new Date(lastSave.at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    const r = lastSave.result;
    if (r.status === 'saved') text = t('save-saved', { defaultValue: 'Saved at {{time}}', time });
    else if (r.status === 'unchanged')
      text = t('save-unchanged', { defaultValue: 'No changes since {{time}}', time });
    else if (r.status === 'storage-full')
      text = t('save-storage-full', {
        defaultValue: 'Browser storage is full. Changes are not saved.',
      });
    else text = t('save-failed', { defaultValue: 'Could not save ({{code}})', code: r.code });
  }
  return (
    <div className="rmhos-status text-xs font-mono text-(--app-text-muted)" role="status">
      {text}
    </div>
  );
}

export default function RmhosApp() {
  const { t } = useTranslation('c-rmhos');
  const screenRef = useRef<HTMLDivElement>(null);
  const [confirmed, setConfirmed] = useState(() => !isPhone());
  const session = useRmhosMachine(screenRef, confirmed);

  return (
    <RmhosSessionProvider value={session}>
      <div className="rmhos-root">
        <div className="rmhos-stage">
          <Screen ref={screenRef} label={t('screen-label', { defaultValue: 'rmhOS desktop' })} />
          {session.phase !== 'running' && (
            <BootScreen
              phase={session.phase}
              detail={session.detail}
              needsKeyboardNotice={!confirmed}
              onStart={() => setConfirmed(true)}
              onRetry={() => void session.restart()}
            />
          )}
        </div>
        {session.phase === 'running' && <SaveStatus session={session} />}
      </div>
    </RmhosSessionProvider>
  );
}
