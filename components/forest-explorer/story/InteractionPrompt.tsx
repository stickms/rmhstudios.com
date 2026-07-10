'use client';

import { useTranslation } from "react-i18next";
import { useStoryStore } from '@/lib/forest-explorer/store';
import { getInteractableById } from '@/lib/forest-explorer/interactables';

export function InteractionPrompt() {
    const { t } = useTranslation("c-forest-explorer");
    const nearbyId = useStoryStore(s => s.nearbyInteractable);
    const showPuzzle = useStoryStore(s => s.showPuzzleOverlay);
    const journalOpen = useStoryStore(s => s.journalOpen);

    if (!nearbyId || showPuzzle || journalOpen) return null;

    const interactable = getInteractableById(nearbyId);
    if (!interactable) return null;

    return (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
            <div className="px-4 py-2.5 rounded-xl bg-black/60 backdrop-blur-sm border border-white/15 text-center">
                <p className="text-white/90 text-sm font-medium">
                    {t("press-key-to-examine-before", { defaultValue: "Press" })} <span className="text-amber-300 font-bold">E</span> {t("press-key-to-examine-after", { defaultValue: "to examine" })}
                </p>
                <p className="text-white/50 text-xs mt-0.5">{interactable.label}</p>
            </div>
        </div>
    );
}
