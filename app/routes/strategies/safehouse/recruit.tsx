import { createFileRoute } from '@tanstack/react-router';
import { RecruitForm } from '@/components/doctrine/safehouse/recruit-form';
import { UserPlus } from 'lucide-react';
import { useTranslation } from "react-i18next";

export const Route = createFileRoute('/strategies/safehouse/recruit')({
  component: RecruitPage,
});

function RecruitPage() {
  const { t } = useTranslation("r-strategies");
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-20 md:pb-6">
      <div className="flex items-center gap-2">
        <UserPlus size={20} style={{ color: 'var(--doctrine-accent)' }} />
        <h1 className="text-xl font-bold" style={{ color: 'var(--doctrine-text-primary)' }}>
          {t("asset-recruitment", { defaultValue: "Asset Recruitment" })}
        </h1>
      </div>
      <p className="text-base md:text-sm" style={{ color: 'var(--doctrine-text-muted)' }}>
        {t("recruit-description", { defaultValue: "You don't sign up for this. You're recruited. Generate personalized invite links for targets whose skills would strengthen the coalition." })}
      </p>

      <RecruitForm />

      <div className="rounded-lg p-4 space-y-2" style={{ background: 'var(--doctrine-bg-secondary)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 className="text-sm md:text-xs font-mono uppercase tracking-wider text-white/40">{t("how-recruitment-works", { defaultValue: "How Recruitment Works" })}</h3>
        <ul className="text-sm md:text-xs text-white/30 space-y-1.5 md:space-y-1">
          <li>{t("recruit-step-1", { defaultValue: "1. Generate a personalized invite link with a custom message" })}</li>
          <li>{t("recruit-step-2", { defaultValue: "2. Share the link with your target recruit" })}</li>
          <li>{t("recruit-step-3", { defaultValue: "3. When they join, you earn 50 XP per signup" })}</li>
          <li>{t("recruit-step-4", { defaultValue: "4. If they convert to a paid tier, you earn 200 XP" })}</li>
          <li>{t("recruit-step-5", { defaultValue: "5. Links expire after 30 days or max uses" })}</li>
        </ul>
      </div>
    </div>
  );
}
