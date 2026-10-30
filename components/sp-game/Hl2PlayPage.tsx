/**
 * /half-life-2 — the Half-Life 2 demo (Point Insertion, the two maps the demo
 * licence ships data for) on the browser engine.
 */
'use client';

import { useTranslation } from 'react-i18next';
import SpPlayPage from './SpPlayPage';

export default function Hl2PlayPage() {
  const { t } = useTranslation('c-tf2-game');
  return (
    <SpPlayPage
      game="hl2"
      title={t('play_hl2_title', { defaultValue: 'Half-Life 2' })}
      subtitle={t('play_hl2_point_insertion', { defaultValue: 'Point Insertion. Walk off the train into City 17.' })}
      chapters={{
        d1_trainstation_01: t('play_hl2_ch1', { defaultValue: 'Point Insertion: Arrival' }),
        d1_trainstation_02: t('play_hl2_ch2', { defaultValue: 'Point Insertion: City 17 Plaza' }),
      }}
    />
  );
}
