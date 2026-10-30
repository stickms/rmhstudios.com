/**
 * This game's own names for its actions (c-tf2-game): the key list's labels where the game's
 * kb_act.lst does not name a row (or is not published yet), and the rebinding notices.
 */
'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Action } from '@/lib/tf2-game/client/input/actions';

export function useActionLabels(): Record<Action, string> {
  const { t } = useTranslation('c-tf2-game');
  return useMemo(() => ({
    forward: t('act_forward', { defaultValue: 'Move forward' }),
    back: t('act_back', { defaultValue: 'Move back' }),
    moveleft: t('act_moveleft', { defaultValue: 'Strafe left' }),
    moveright: t('act_moveright', { defaultValue: 'Strafe right' }),
    jump: t('act_jump', { defaultValue: 'Jump' }),
    duck: t('act_duck', { defaultValue: 'Crouch' }),
    attack: t('act_attack', { defaultValue: 'Fire' }),
    attack2: t('act_attack2', { defaultValue: 'Alt-fire' }),
    attack3: t('act_attack3', { defaultValue: 'Special attack' }),
    reload: t('act_reload', { defaultValue: 'Reload' }),
    use: t('act_use', { defaultValue: 'Use' }),
    speed: t('act_speed', { defaultValue: 'Sprint' }),
    walk: t('act_walk', { defaultValue: 'Walk' }),
    zoom: t('act_zoom', { defaultValue: 'Suit zoom' }),
    showscores: t('act_showscores', { defaultValue: 'Scoreboard' }),
    inspect: t('act_inspect', { defaultValue: 'Inspect weapon' }),
    slot1: t('act_slot1', { defaultValue: 'Weapon slot 1' }),
    slot2: t('act_slot2', { defaultValue: 'Weapon slot 2' }),
    slot3: t('act_slot3', { defaultValue: 'Weapon slot 3' }),
    slot4: t('act_slot4', { defaultValue: 'Weapon slot 4' }),
    slot5: t('act_slot5', { defaultValue: 'Weapon slot 5' }),
    slot6: t('act_slot6', { defaultValue: 'Weapon slot 6' }),
    slot7: t('act_slot7', { defaultValue: 'Weapon slot 7' }),
    slot8: t('act_slot8', { defaultValue: 'Weapon slot 8' }),
    slot9: t('act_slot9', { defaultValue: 'Weapon slot 9' }),
    lastinv: t('act_lastinv', { defaultValue: 'Last weapon' }),
    invnext: t('act_invnext', { defaultValue: 'Next weapon' }),
    invprev: t('act_invprev', { defaultValue: 'Previous weapon' }),
    say: t('act_say', { defaultValue: 'Chat' }),
    say_team: t('act_say_team', { defaultValue: 'Team chat' }),
    voice_menu_1: t('act_voice1', { defaultValue: 'Voice menu 1' }),
    voice_menu_2: t('act_voice2', { defaultValue: 'Voice menu 2' }),
    voice_menu_3: t('act_voice3', { defaultValue: 'Voice menu 3' }),
    medic: t('act_medic', { defaultValue: 'Call for Medic' }),
    changeclass: t('act_changeclass', { defaultValue: 'Change class' }),
    changeteam: t('act_changeteam', { defaultValue: 'Change team' }),
    taunt: t('act_taunt', { defaultValue: 'Taunt' }),
    dropitem: t('act_dropitem', { defaultValue: 'Drop intelligence' }),
    lastdisguise: t('act_lastdisguise', { defaultValue: 'Last disguise' }),
    flashlight: t('act_flashlight', { defaultValue: 'Flashlight' }),
    menu: t('act_menu', { defaultValue: 'Menu' }),
    menu_up: '',
    menu_down: '',
    menu_left: '',
    menu_right: '',
    menu_accept: '',
    menu_back: '',
  }), [t]);
}
