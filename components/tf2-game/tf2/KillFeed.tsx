/**
 * The kill feed (HudDeathNotice), top right: "Attacker + Assister [weapon]
 * Victim", names in team colours, the weapon as a stylised label where the
 * game draws its kill icon (the icon sprites are not in the shipped default
 * HUD), crits on a red plate, kills involving you on a light plate, and the
 * domination / revenge notes.
 */
'use client';

import { useTranslation } from 'react-i18next';
import type { HudKillEntry } from '@/lib/tf2-game/client/hud-state';
import { useKillIconLabel } from '../strings';
import { usePanelStyle } from '../use-hud';

export default function KillFeed({ entries }: { entries: HudKillEntry[] }) {
  const { t } = useTranslation('c-tf2-game');
  const style = usePanelStyle('HudDeathNotice');
  const iconLabel = useKillIconLabel();
  if (!style || entries.length === 0) return null;
  return (
    <div className="tf2g-panel" style={style}>
      <ol className="tf2g-killfeed" aria-live="polite" aria-label={t('killfeed_aria', { defaultValue: 'Kill feed' })}>
        {entries.map((k) => {
          const weapon = k.object ? t('kill_destroyed', { defaultValue: 'Destroyed' }) : iconLabel(k.icon, k.weaponName, k.customKill);
          return (
            <li key={k.id} className="tf2g-kill" data-local={k.involvesLocal}>
              {k.attacker ? (
                <span className={`tf2g-kill-name tf2g-team-${k.attacker.team}`}>{k.attacker.name}</span>
              ) : null}
              {k.assister ? (
                <>
                  <span className="tf2g-kill-plus">+</span>
                  <span className={`tf2g-kill-name tf2g-team-${k.assister.team}`}>{k.assister.name}</span>
                </>
              ) : null}
              <span className="tf2g-kill-icon" data-crit={k.crit === 2}>
                {k.crit === 2 ? t('kill_crit_prefix', { defaultValue: 'Crit' }) + ' · ' : ''}
                {weapon}
              </span>
              <span className={`tf2g-kill-name tf2g-team-${k.victim.team}`}>{k.victim.name}</span>
              {k.domination ? (
                <span className="tf2g-kill-note">{t('kill_dominating', { defaultValue: 'Dominating' })}</span>
              ) : null}
              {k.revenge ? <span className="tf2g-kill-note">{t('kill_revenge', { defaultValue: 'Revenge' })}</span> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
