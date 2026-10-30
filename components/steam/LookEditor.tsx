'use client';

import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { LookEditorData } from '@/lib/games/community-types';

/** Choose your profile background and avatar frame from the ones your badges unlocked. */
export function LookEditor({ data }: { data: LookEditorData }) {
  const { t } = useTranslation('games-hub');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bg, setBg] = useState(data.selected.background ?? '');
  const [fr, setFr] = useState(data.selected.frame ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch('/api/games/customize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ background: bg || null, frame: fr || null }),
      });
      if (res.ok) {
        toast.success(t('steam-look-saved', { defaultValue: 'Profile look saved.' }));
        setOpen(false);
        await router.invalidate();
      } else {
        toast.error(t('steam-look-err', { defaultValue: 'Could not save your profile look.' }));
      }
    } catch {
      toast.error(t('steam-look-err', { defaultValue: 'Could not save your profile look.' }));
    } finally {
      setBusy(false);
    }
  }

  const none = t('steam-look-none', { defaultValue: 'None' });
  if (!open) {
    return (
      <button type="button" className="stm-btn" onClick={() => setOpen(true)}>
        {t('steam-look-edit', { defaultValue: 'Customize profile' })}
      </button>
    );
  }
  return (
    <div className="stm-look-editor">
      {data.backgrounds.length === 0 && data.frames.length === 0 ? (
        <p className="stm-muted">
          {t('steam-look-locked', { defaultValue: 'Craft a badge to unlock a background, and badge levels 3 and 5 for frames.' })}
        </p>
      ) : null}
      <label>
        <span className="stm-subhead">{t('steam-look-background', { defaultValue: 'Background' })}</span>
        <select className="stm-input" value={bg} onChange={(e) => setBg(e.target.value)}>
          <option value="">{none}</option>
          {data.backgrounds.map((b) => (
            <option key={b.key} value={b.key}>
              {b.title}
              {b.foil ? ` (${t('steam-market-foil', { defaultValue: 'foil' })})` : ''}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="stm-subhead">{t('steam-look-frame', { defaultValue: 'Avatar frame' })}</span>
        <select className="stm-input" value={fr} onChange={(e) => setFr(e.target.value)}>
          <option value="">{none}</option>
          {data.frames.map((f) => (
            <option key={f.key} value={f.key}>
              {f.title} · {t('steam-look-level', { defaultValue: 'level {{n}}', n: f.level })}
            </option>
          ))}
        </select>
      </label>
      <div className="stm-write-actions">
        <button type="button" className="stm-btn stm-btn-blue" disabled={busy} onClick={() => void save()}>
          {t('steam-showcase-save', { defaultValue: 'Save' })}
        </button>
        <button type="button" className="stm-btn" disabled={busy} onClick={() => setOpen(false)}>
          {t('steam-market-cancel', { defaultValue: 'Cancel' })}
        </button>
      </div>
    </div>
  );
}
