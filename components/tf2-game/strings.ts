/**
 * Translated names the HUD looks up by number (classes, teams, voice lines,
 * win reasons, buildings). Every key is a literal so `pnpm i18n:extract` finds it.
 */
'use client';

import { useTranslation } from 'react-i18next';

/** Class names indexed by ETFClass (0 = random). */
export function useClassNames(): string[] {
  const { t } = useTranslation('c-tf2-game');
  return [
    t('class_random', { defaultValue: 'Random' }),
    t('class_scout', { defaultValue: 'Scout' }),
    t('class_sniper', { defaultValue: 'Sniper' }),
    t('class_soldier', { defaultValue: 'Soldier' }),
    t('class_demoman', { defaultValue: 'Demoman' }),
    t('class_medic', { defaultValue: 'Medic' }),
    t('class_heavy', { defaultValue: 'Heavy' }),
    t('class_pyro', { defaultValue: 'Pyro' }),
    t('class_spy', { defaultValue: 'Spy' }),
    t('class_engineer', { defaultValue: 'Engineer' }),
  ];
}

/** Team names indexed by TEAM_* (0 unassigned, 1 spectator, 2 RED, 3 BLU). */
export function useTeamNames(): string[] {
  const { t } = useTranslation('c-tf2-game');
  return [
    t('team_unassigned', { defaultValue: 'Unassigned' }),
    t('team_spectator', { defaultValue: 'Spectator' }),
    t('team_red', { defaultValue: 'RED' }),
    t('team_blu', { defaultValue: 'BLU' }),
  ];
}

/** The three voice menus (Z, X, C), eight lines each (voicemenu <menu> <item>). */
export function useVoiceMenus(): Array<{ title: string; items: string[] }> {
  const { t } = useTranslation('c-tf2-game');
  return [
    {
      title: t('voice_menu_1', { defaultValue: 'Voice Menu 1' }),
      items: [
        t('voice_medic', { defaultValue: 'MEDIC!' }),
        t('voice_thanks', { defaultValue: 'Thanks!' }),
        t('voice_go', { defaultValue: 'Go! Go! Go!' }),
        t('voice_move_up', { defaultValue: 'Move Up!' }),
        t('voice_go_left', { defaultValue: 'Go Left' }),
        t('voice_go_right', { defaultValue: 'Go Right' }),
        t('voice_yes', { defaultValue: 'Yes' }),
        t('voice_no', { defaultValue: 'No' }),
      ],
    },
    {
      title: t('voice_menu_2', { defaultValue: 'Voice Menu 2' }),
      items: [
        t('voice_incoming', { defaultValue: 'Incoming' }),
        t('voice_spy', { defaultValue: 'Spy!' }),
        t('voice_sentry_ahead', { defaultValue: 'Sentry Ahead!' }),
        t('voice_teleporter_here', { defaultValue: 'Teleporter Here' }),
        t('voice_dispenser_here', { defaultValue: 'Dispenser Here' }),
        t('voice_sentry_here', { defaultValue: 'Sentry Here' }),
        t('voice_activate_uber', { defaultValue: 'Activate Charge!' }),
        t('voice_uber_ready', { defaultValue: 'MEDIC: ÜberCharge Ready' }),
      ],
    },
    {
      title: t('voice_menu_3', { defaultValue: 'Voice Menu 3' }),
      items: [
        t('voice_help', { defaultValue: 'Help!' }),
        t('voice_battle_cry', { defaultValue: 'Battle Cry' }),
        t('voice_cheers', { defaultValue: 'Cheers' }),
        t('voice_jeers', { defaultValue: 'Jeers' }),
        t('voice_positive', { defaultValue: 'Positive' }),
        t('voice_negative', { defaultValue: 'Negative' }),
        t('voice_nice_shot', { defaultValue: 'Nice Shot' }),
        t('voice_good_job', { defaultValue: 'Good Job' }),
      ],
    },
  ];
}

/** The win panel's reason line (WINREASON_*), with the winning team's name. */
export function useWinReason(): (reason: number, team: string) => string {
  const { t } = useTranslation('c-tf2-game');
  return (reason, team) => {
    switch (reason) {
      case 1:
        return t('win_all_points', { defaultValue: '{{team}} captured all control points', team });
      case 2:
        return t('win_opponents_dead', { defaultValue: '{{team}} killed all opponents', team });
      case 3:
        return t('win_flag_limit', { defaultValue: '{{team}} captured the enemy intelligence', team });
      case 4:
        return t('win_defended', { defaultValue: '{{team}} successfully defended until time ran out', team });
      case 6:
        return t('win_time_limit', { defaultValue: '{{team}} had the most points when time ran out', team });
      default:
        return t('win_generic', { defaultValue: '{{team}} wins the round', team });
    }
  };
}

/** Building names (sentry, dispenser, entrance, exit). */
export function useBuildingNames(): Record<'sentry' | 'dispenser' | 'entrance' | 'exit', string> {
  const { t } = useTranslation('c-tf2-game');
  return {
    sentry: t('building_sentry', { defaultValue: 'Sentry Gun' }),
    dispenser: t('building_dispenser', { defaultValue: 'Dispenser' }),
    entrance: t('building_entrance', { defaultValue: 'Teleporter Entrance' }),
    exit: t('building_exit', { defaultValue: 'Teleporter Exit' }),
  };
}

/** The kill feed's text for a kill icon when no sprite is drawn: custom kills first, then the weapon. */
export function useKillIconLabel(): (icon: string, weaponName: string, customKill: number) => string {
  const { t } = useTranslation('c-tf2-game');
  return (icon, weaponName, customKill) => {
    if (customKill === 1) return t('kill_headshot', { defaultValue: 'Headshot' });
    if (customKill === 2) return t('kill_backstab', { defaultValue: 'Backstab' });
    if (customKill === 3) return t('kill_burning', { defaultValue: 'Afterburn' });
    if (customKill === 16) return t('kill_telefrag', { defaultValue: 'Telefrag' });
    if (icon.startsWith('obj_sentrygun')) return t('kill_sentry', { defaultValue: 'Sentry' });
    if (icon === 'world' || icon === 'trigger_hurt' || icon === '') return t('kill_world', { defaultValue: 'Skull' });
    if (weaponName) return weaponName;
    return icon.replace(/^tf_(weapon|projectile)_/, '').replace(/_/g, ' ');
  };
}
