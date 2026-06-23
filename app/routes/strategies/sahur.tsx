import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Moon, Zap, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDoctrineSahur } from '@/hooks/useDoctrineSahur';
import { useDoctrineStore } from '@/stores/doctrineStore';
import { CountdownTimer } from '@/components/doctrine/countdown-timer';
import { SAHUR_WINDOW } from '@/lib/doctrine/constants';

export const Route = createFileRoute('/strategies/sahur')({
  component: SahurPage,
});

function SahurPage() {
  const { t } = useTranslation("r-strategies");
  const { sahurActive, sahurConfig, sahurCountdown } = useDoctrineSahur();
  const setDoctrineTheme = useDoctrineStore(s => s.setDoctrineTheme);

  useEffect(() => {
    if (sahurActive) setDoctrineTheme('sahur');
    return () => setDoctrineTheme('default');
  }, [sahurActive, setDoctrineTheme]);

  if (sahurActive) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-8 pb-20 md:pb-6">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-black" style={{ color: '#F59E0B', textShadow: '0 0 30px rgba(245,158,11,0.4)' }}>
            {SAHUR_WINDOW.greeting}
          </h1>
          <div className="flex items-center justify-center gap-4">
            <span className="flex items-center gap-1 text-sm font-bold text-amber-400">
              <Zap size={16} /> {t("xp-multiplier-label", { defaultValue: "{{multiplier}}x XP", multiplier: SAHUR_WINDOW.xpMultiplier })}
            </span>
            <span className="flex items-center gap-1 text-sm text-amber-300/60">
              <Clock size={16} /> {t("min-remaining", { defaultValue: "{{count}} min remaining", count: sahurCountdown })}
            </span>
          </div>
        </div>

        {/* Sahur exclusive content */}
        <div className="rounded-xl p-6 text-center space-y-4" style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <Moon size={32} className="mx-auto text-amber-400" />
          <h2 className="text-lg font-bold text-amber-300">{t("sahur-challenge-heading", { defaultValue: "Sahur Challenge" })}</h2>
          <p className="text-sm text-amber-300/60">
            {t("sahur-challenge-desc", { defaultValue: "The exclusive 3 AM puzzle is available now. Complete it before the window closes. Miss it and it's gone. No archive. No second chance." })}
          </p>
          <a
            href="/strategies/puzzles"
            className="inline-block px-6 py-2.5 rounded-lg text-sm font-bold transition-all hover:brightness-110"
            style={{ background: '#F59E0B', color: '#000' }}
          >
            {t("play-sahur-puzzle", { defaultValue: "Play Sahur Puzzle" })}
          </a>
        </div>

        <div className="text-center">
          <p className="text-[10px] font-mono text-amber-400/30">
            {t("temporal-monopoly", { defaultValue: "TEMPORAL MONOPOLY — THIS CONTENT SELF-DESTRUCTS AT 4:00 AM" })}
          </p>
        </div>
      </div>
    );
  }

  // Sahur is not active — show countdown
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-20 md:pb-6">
      <div className="flex items-center gap-2">
        <Moon size={20} className="text-white/30" />
        <h1 className="text-xl font-bold" style={{ color: 'var(--doctrine-text-primary)' }}>
          {t("sahur-mode-title", { defaultValue: "Sahur Mode" })}
        </h1>
      </div>

      <div className="rounded-xl p-8 text-center space-y-6" style={{ background: 'var(--doctrine-bg-secondary)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <Moon size={48} className="mx-auto text-white/10" />
        <h2 className="text-lg font-semibold text-white/60">{t("not-active", { defaultValue: "Not Active" })}</h2>
        <p className="text-sm text-white/30 max-w-md mx-auto">
          {t("not-active-desc", { defaultValue: "Sahur Mode activates between 3:00–4:00 AM in your local timezone. Triple XP. Exclusive puzzles. Bat cursor. TUNG TUNG TUNG." })}
        </p>

        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg" style={{ background: 'var(--doctrine-bg-tertiary)' }}>
          <Clock size={14} className="text-white/30" />
          <span className="text-sm font-mono text-white/40">
            {sahurCountdown > 0
              ? t("until-sahur", { defaultValue: "{{hours}}h {{minutes}}m until Sahur", hours: Math.floor(sahurCountdown / 60), minutes: sahurCountdown % 60 })
              : t("calculating", { defaultValue: "Calculating..." })}
          </span>
        </div>
      </div>

      <div className="rounded-lg p-4 space-y-2" style={{ background: 'var(--doctrine-bg-secondary)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 className="text-xs font-mono uppercase tracking-wider text-white/40">{t("what-happens-heading", { defaultValue: "What happens during Sahur" })}</h3>
        <ul className="text-xs text-white/30 space-y-1">
          <li>• {t("benefit-xp", { defaultValue: "All XP earned is multiplied by {{multiplier}}x", multiplier: SAHUR_WINDOW.xpMultiplier })}</li>
          <li>• {t("benefit-puzzle", { defaultValue: "An exclusive puzzle appears (no archive, no replays)" })}</li>
          <li>• {t("benefit-theme", { defaultValue: "The entire UI transforms with the Sahur theme" })}</li>
          <li>• {t("benefit-badge", { defaultValue: "Participation earns a unique daily badge on your profile" })}</li>
          <li>• {t("benefit-cursor", { defaultValue: "The cursor becomes a baseball bat" })}</li>
        </ul>
      </div>
    </div>
  );
}
