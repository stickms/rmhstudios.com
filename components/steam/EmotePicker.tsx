'use client';

import { Smile } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { listCuratedBuilds } from '@/lib/builds/curated';
import { EMOTE_MOTIFS, emoteToken } from '@/lib/games/customize';
import { Emote } from './Emote';

/** The emoticons a member has unlocked (one set per title they hold a badge for). */
export function EmotePicker({ titles, onPick }: { titles: string[]; onPick: (token: string) => void }) {
  const { t } = useTranslation('games-hub');
  if (titles.length === 0) return null;
  const names = new Map(listCuratedBuilds().map((b) => [b.id, b.title]));
  return (
    <details className="stm-collmenu">
      <summary className="stm-btn">
        <Smile aria-hidden size={16} />
        {t('steam-emotes', { defaultValue: 'Emoticons' })}
      </summary>
      <div className="stm-collmenu-panel">
        {titles.map((id) => (
          <div key={id} className="stm-emote-row">
            <span className="stm-person-sub">{names.get(id) ?? id}</span>
            <span className="stm-emote-buttons">
              {EMOTE_MOTIFS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="stm-emote-btn"
                  title={emoteToken(id, m)}
                  onClick={() => onPick(emoteToken(id, m))}
                >
                  <Emote gameId={id} motif={m} size={22} />
                </button>
              ))}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}
