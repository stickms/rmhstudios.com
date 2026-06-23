/**
 * OnboardingTour — First-time user onboarding experience.
 *
 * Shows a series of tooltip-style steps explaining the UI.
 * Only appears once (tracked via `hasSeenTour` in settings).
 */
'use client';

import { useState, useCallback } from 'react';
import { X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { useTranslation } from 'react-i18next';

export default function OnboardingTour() {
  const { t } = useTranslation("c-rmhtube");
  const hasSeenTour = useRmhTubeStore((s) => s.settings.hasSeenTour);
  const updateSettings = useRmhTubeStore((s) => s.updateSettings);
  const [step, setStep] = useState(0);

  const TOUR_STEPS = [
    {
      title: t("tour-welcome-title", { defaultValue: "Welcome to RmhTube!" }),
      description: t("tour-welcome-desc", { defaultValue: "Watch videos together in real-time with friends. The host controls playback and everyone stays in sync." }),
      icon: '🎬',
    },
    {
      title: t("tour-add-videos-title", { defaultValue: "Add Videos" }),
      description: t("tour-add-videos-desc", { defaultValue: 'Click the "Add" button in the queue panel to add YouTube, Twitch, or direct video links.' }),
      icon: '➕',
    },
    {
      title: t("tour-chat-title", { defaultValue: "Chat & React" }),
      description: t("tour-chat-desc", { defaultValue: "Chat with everyone in real-time. React to messages, mention others with @, and send emoji reactions." }),
      icon: '💬',
    },
    {
      title: t("tour-shortcuts-title", { defaultValue: "Keyboard Shortcuts" }),
      description: t("tour-shortcuts-desc", { defaultValue: "Press Shift+? to see all keyboard shortcuts. Use Space to play/pause, arrows to seek, and more." }),
      icon: '⌨️',
    },
    {
      title: t("tour-share-title", { defaultValue: "Share the Room" }),
      description: t("tour-share-desc", { defaultValue: "Click the room code in the header to copy the invite link. Share it with friends to watch together!" }),
      icon: '🔗',
    },
  ];

  const handleClose = useCallback(() => {
    updateSettings({ hasSeenTour: true });
  }, [updateSettings]);

  const handleNext = useCallback(() => {
    if (step < TOUR_STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      handleClose();
    }
  }, [step, handleClose]);

  const handlePrev = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  if (hasSeenTour) return null;

  const current = TOUR_STEPS[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={handleClose} />
      <div className="relative w-full max-w-sm rounded-xl border border-(--rmhtube-border) bg-(--rmhtube-surface) p-6 shadow-xl">
        {/* Close */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 rounded p-1 text-(--rmhtube-text-dim) hover:text-(--rmhtube-text)"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-4">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-(--rmhtube-accent)' : 'bg-(--rmhtube-border)'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="text-center mb-6">
          <span className="text-4xl mb-3 block">{current.icon}</span>
          <h3 className="text-lg font-semibold mb-2 text-(--rmhtube-text)">{current.title}</h3>
          <p className="text-sm text-(--rmhtube-text-muted)">{current.description}</p>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={handlePrev}
            disabled={step === 0}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-md transition-colors disabled:opacity-30 text-(--rmhtube-text-muted) hover:text-(--rmhtube-text) hover:bg-(--rmhtube-surface-hover)"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {t("back", { defaultValue: "Back" })}
          </button>

          <span className="text-xs text-(--rmhtube-text-dim)">
            {step + 1} / {TOUR_STEPS.length}
          </span>

          <button
            onClick={handleNext}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-md transition-colors bg-(--rmhtube-accent) text-white hover:bg-(--rmhtube-accent-hover)"
          >
            {step < TOUR_STEPS.length - 1 ? (
              <>
                {t("next", { defaultValue: "Next" })}
                <ChevronRight className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                {t("get-started", { defaultValue: "Get Started" })}
              </>
            )}
          </button>
        </div>

        {/* Skip */}
        {step < TOUR_STEPS.length - 1 && (
          <button
            onClick={handleClose}
            className="w-full mt-3 text-xs text-center text-(--rmhtube-text-dim) hover:text-(--rmhtube-text-muted)"
          >
            {t("skip-tour", { defaultValue: "Skip tour" })}
          </button>
        )}
      </div>
    </div>
  );
}
