import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { m as motion } from 'framer-motion';
import { useGameStore } from '@/lib/versecraft/store';
import { getAllSaves, formatPlaytime, formatTimestamp, deleteSave } from '@/lib/versecraft/persistence';
import type { SaveFile } from '@/lib/versecraft/types';
import { DuskBackdrop } from './DuskBackdrop';
import './VersecraftMenu.css';

export function SaveLoadMenu({ mode }: { mode: 'save' | 'load' }) {
  const { t } = useTranslation("c-versecraft");
  const saveToSlot = useGameStore(s => s.saveToSlot);
  const loadFromSlot = useGameStore(s => s.loadFromSlot);
  const goBack = useGameStore(s => s.goBack);
  const reducedMotion = useGameStore(s => s.settings.reducedMotion);
  const [saves, setSaves] = useState<(SaveFile | null)[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setSaves(getAllSaves());
  }, []);

  const handleSlotClick = (slotId: number) => {
    if (mode === 'save') {
      const success = saveToSlot(slotId);
      if (success) {
        setMessage(t("saved-to-slot", { defaultValue: "Saved to slot {{slotId}}", slotId }));
        setSaves(getAllSaves());
        setTimeout(() => setMessage(''), 2000);
      }
    } else {
      const success = loadFromSlot(slotId);
      if (!success) {
        setMessage(t("no-save-in-slot", { defaultValue: "No save in this slot" }));
        setTimeout(() => setMessage(''), 2000);
      }
    }
  };

  const handleDelete = (slotId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSave(slotId);
    setSaves(getAllSaves());
  };

  return (
    <div className="vc-screen" data-reduced-motion={reducedMotion ? 'true' : undefined}>
      <DuskBackdrop verses={false} />

      <div className="vc-slots">
        <motion.div
          className="vc-panel vc-slots__card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="vc-slots__head">
            <h2 className="vc-slots__title">
              {mode === 'save' ? t("save-game", { defaultValue: "Save Game" }) : t("load-game", { defaultValue: "Load Game" })}
            </h2>
            <button type="button" onClick={goBack} className="vc-btn">
              {t("back", { defaultValue: "Back" })}
            </button>
          </div>

          {/* Message */}
          {message && (
            <motion.p
              className="vc-slots__msg"
              role="status"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {message}
            </motion.p>
          )}

          {/* Save slots */}
          <ul className="vc-slot-list">
            {saves.map((save, i) => (
              <li key={i} className={`vc-slot ${save ? '' : 'vc-slot--empty'}`}>
                <button type="button" onClick={() => handleSlotClick(i)} className="vc-slot__main">
                  <span
                    className={`vc-slot__badge ${i === 0 ? 'vc-slot__badge--auto' : ''}`}
                    aria-label={i === 0 ? undefined : t("slot-number", { defaultValue: "Slot {{i}}", i })}
                  >
                    {i === 0 ? t("slot-auto", { defaultValue: "Auto" }) : i}
                  </span>
                  <span className="vc-slot__body">
                    {save ? (
                      <>
                        <span className="vc-slot__name">{save.playerName}</span>
                        <span className="vc-slot__meta">
                          {save.chapterTitle} | {formatPlaytime(save.playtime)} | {formatTimestamp(save.timestamp)}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="vc-slot__name">
                          {i === 0 ? t("slot-auto", { defaultValue: "Auto" }) : t("slot-number", { defaultValue: "Slot {{i}}", i })}
                        </span>
                        <span className="vc-slot__meta">{t("slot-empty", { defaultValue: "Empty" })}</span>
                      </>
                    )}
                  </span>
                </button>
                {save && mode === 'save' && i !== 0 && (
                  <button
                    type="button"
                    onClick={(e) => handleDelete(i, e)}
                    className="vc-slot__del"
                    aria-label={t("delete-slot", { defaultValue: "Delete slot {{i}}", i })}
                  >
                    {t("delete", { defaultValue: "Del" })}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </div>
  );
}
