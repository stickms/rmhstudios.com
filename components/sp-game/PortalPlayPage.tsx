/**
 * /portal — Portal: First Slice (test chambers 00–10) on the browser engine,
 * with the portal gun and recursive portal views.
 */
'use client';

import { useTranslation } from 'react-i18next';
import SpPlayPage from './SpPlayPage';

export default function PortalPlayPage() {
  const { t } = useTranslation('c-tf2-game');
  return (
    <SpPlayPage
      game="portal"
      title={t('play_portal_title', { defaultValue: 'Portal' })}
      subtitle={t('play_portal_subtitle', { defaultValue: 'First Slice — test chambers 00 to 10 of the Aperture Science Enrichment Center.' })}
      chapters={{
        testchmb_a_00: t('play_portal_ch00', { defaultValue: 'Test Chambers 00–01' }),
        testchmb_a_01: t('play_portal_ch01', { defaultValue: 'Test Chambers 02–03' }),
        testchmb_a_02: t('play_portal_ch02', { defaultValue: 'Test Chambers 04–05' }),
        testchmb_a_03: t('play_portal_ch03', { defaultValue: 'Test Chambers 06–07' }),
        testchmb_a_04: t('play_portal_ch04', { defaultValue: 'Test Chamber 08' }),
        testchmb_a_05: t('play_portal_ch05', { defaultValue: 'Test Chamber 09' }),
        testchmb_a_06: t('play_portal_ch06', { defaultValue: 'Test Chamber 10' }),
      }}
    />
  );
}
