/**
 * The pause / escape menu: Resume, Options, Change team, Change class
 * (TF2), Disconnect — in the TF2 Hub's app-tier dialog, so it has a real
 * focus trap and Esc closes it. Options opens the settings in the same dialog.
 */
'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HudGame } from '@/lib/tf2-game/client/hud-state';
import type { GameSettings } from '@/lib/tf2-game/client/settings';
import { Btn, Modal } from '../../tf2-hud/ui';
import SettingsPanel from './SettingsPanel';

export default function PauseMenu({
  open,
  game,
  settings,
  onSettings,
  onResume,
  onChangeTeam,
  onChangeClass,
  onDisconnect,
  initialView = 'menu',
}: {
  open: boolean;
  game: HudGame;
  settings: GameSettings;
  onSettings: (next: GameSettings) => void;
  onResume: () => void;
  onChangeTeam?: () => void;
  onChangeClass?: () => void;
  onDisconnect: () => void;
  initialView?: 'menu' | 'settings';
}) {
  const { t } = useTranslation('c-tf2-game');
  const [view, setView] = useState<'menu' | 'settings'>(initialView);
  const title = view === 'settings' ? t('settings', { defaultValue: 'Options' }) : t('paused', { defaultValue: 'Paused' });
  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setView('menu');
          onResume();
        }
      }}
      title={title}
      wide={view === 'settings'}
      footer={
        view === 'settings' ? (
          <Btn size="sm" onClick={() => setView('menu')}>
            {t('back', { defaultValue: 'Back' })}
          </Btn>
        ) : undefined
      }
    >
      {view === 'settings' ? (
        <SettingsPanel game={game} settings={settings} onChange={onSettings} />
      ) : (
        <div className="flex flex-col gap-2">
          <Btn size="md" variant="primary" onClick={onResume}>
            {t('resume', { defaultValue: 'Resume game' })}
          </Btn>
          <Btn size="md" onClick={() => setView('settings')}>
            {t('settings', { defaultValue: 'Options' })}
          </Btn>
          {onChangeTeam ? (
            <Btn size="md" onClick={onChangeTeam}>
              {t('change_team', { defaultValue: 'Change team' })}
            </Btn>
          ) : null}
          {onChangeClass ? (
            <Btn size="md" onClick={onChangeClass}>
              {t('change_class', { defaultValue: 'Change class' })}
            </Btn>
          ) : null}
          <Btn size="md" variant="danger" onClick={onDisconnect}>
            {game === 'tf2' ? t('disconnect', { defaultValue: 'Disconnect' }) : t('quit_game', { defaultValue: 'Quit game' })}
          </Btn>
        </div>
      )}
    </Modal>
  );
}
