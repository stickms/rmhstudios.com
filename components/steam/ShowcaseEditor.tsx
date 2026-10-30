'use client';

import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { MAX_SHOWCASE } from '@/lib/games/showcase';
import type { ShowcaseEditorData } from '@/lib/games/community-types';

/** Choose which achievements and badges your profile features (up to six of each). */
export function ShowcaseEditor({ data }: { data: ShowcaseEditorData }) {
  const { t } = useTranslation('games-hub');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ach, setAch] = useState<string[]>(data.selected.achievements);
  const [badges, setBadges] = useState<string[]>(data.selected.badges);
  const [busy, setBusy] = useState(false);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : list.length < MAX_SHOWCASE ? [...list, id] : list);

  async function save(next: { achievements: string[]; badges: string[] }) {
    setBusy(true);
    try {
      const res = await fetch('/api/games/showcase', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (res.ok) {
        toast.success(t('steam-showcase-saved', { defaultValue: 'Showcase saved.' }));
        setOpen(false);
        await router.invalidate();
      } else {
        toast.error(t('steam-showcase-err', { defaultValue: 'Could not save your showcase.' }));
      }
    } catch {
      toast.error(t('steam-showcase-err', { defaultValue: 'Could not save your showcase.' }));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="stm-btn" onClick={() => setOpen(true)}>
        {t('steam-showcase-edit', { defaultValue: 'Edit showcase' })}
      </button>
    );
  }
  return (
    <div className="stm-showcase-editor">
      <fieldset>
        <legend className="stm-subhead">
          {t('steam-showcase-achievements', {
            defaultValue: 'Achievements ({{n}} of {{max}})',
            n: ach.length,
            max: MAX_SHOWCASE,
          })}
        </legend>
        {data.achievements.length === 0 ? (
          <p className="stm-muted">{t('steam-no-achievements', { defaultValue: 'No achievements unlocked yet.' })}</p>
        ) : (
          data.achievements.map((a) => (
            <label key={a.id} className="stm-collmenu-row">
              <input
                type="checkbox"
                checked={ach.includes(a.id)}
                disabled={!ach.includes(a.id) && ach.length >= MAX_SHOWCASE}
                onChange={() => toggle(ach, setAch, a.id)}
              />
              {a.name}
            </label>
          ))
        )}
      </fieldset>
      <fieldset>
        <legend className="stm-subhead">
          {t('steam-showcase-badges', { defaultValue: 'Badges ({{n}} of {{max}})', n: badges.length, max: MAX_SHOWCASE })}
        </legend>
        {data.badges.length === 0 ? (
          <p className="stm-muted">{t('steam-no-badges', { defaultValue: 'No badges crafted yet.' })}</p>
        ) : (
          data.badges.map((b) => (
            <label key={b.key} className="stm-collmenu-row">
              <input
                type="checkbox"
                checked={badges.includes(b.key)}
                disabled={!badges.includes(b.key) && badges.length >= MAX_SHOWCASE}
                onChange={() => toggle(badges, setBadges, b.key)}
              />
              {b.title}
              {b.foil ? ` (${t('steam-market-foil', { defaultValue: 'foil' })})` : ''}
            </label>
          ))
        )}
      </fieldset>
      <div className="stm-write-actions">
        <button type="button" className="stm-btn stm-btn-blue" disabled={busy} onClick={() => void save({ achievements: ach, badges })}>
          {t('steam-showcase-save', { defaultValue: 'Save' })}
        </button>
        <button type="button" className="stm-btn" disabled={busy} onClick={() => void save({ achievements: [], badges: [] })}>
          {t('steam-showcase-reset', { defaultValue: 'Show my most recent' })}
        </button>
        <button type="button" className="stm-btn" disabled={busy} onClick={() => setOpen(false)}>
          {t('steam-market-cancel', { defaultValue: 'Cancel' })}
        </button>
      </div>
    </div>
  );
}
