import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { toast } from '@/lib/toast';
import { useTranslation } from 'react-i18next';
import { api, errorField } from '@/lib/contract/client';
import { unpackGemsApi } from '@/lib/cards/steam.contract';
import { gemValue } from '@/lib/cards/gems';
import { gemsErrorText } from './gems-errors';

/** Turn one card into gems. Two steps, because the card is destroyed. */
export function UnpackCard({ gameId, cardIndex, foil }: { gameId: string; cardIndex: number; foil: boolean }) {
  const { t } = useTranslation('games-hub');
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const gems = gemValue(foil);

  async function go() {
    setBusy(true);
    try {
      await api(unpackGemsApi, { body: { gameId, cardIndex, foil, qty: 1 } });
      toast.success(t('steam-gems-unpacked', { defaultValue: 'Turned into {{n}} gems.', n: gems }));
      await router.invalidate();
    } catch (e) {
      toast.error(gemsErrorText(errorField<string>(e, 'error'), t));
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  if (!confirm) {
    return (
      <button type="button" className="stm-btn stm-sell-open" onClick={() => setConfirm(true)}>
        {t('steam-gems-unpack', { defaultValue: 'Gems' })}
      </button>
    );
  }
  return (
    <span className="stm-sell-actions">
      <button type="button" className="stm-btn stm-btn-blue" disabled={busy} onClick={() => void go()}>
        {t('steam-gems-confirm', { defaultValue: '+{{n}} gems', n: gems })}
      </button>
      <button type="button" className="stm-btn" disabled={busy} onClick={() => setConfirm(false)}>
        {t('steam-market-cancel', { defaultValue: 'Cancel' })}
      </button>
    </span>
  );
}
