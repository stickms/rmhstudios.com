import { Shield, Lock } from 'lucide-react';
import { useTranslation } from "react-i18next";
import { TIERS } from '@/lib/doctrine/constants';
import type { TierId } from '@/lib/doctrine/types';

interface AccessGateProps {
  requiredTier: TierId;
  children: React.ReactNode;
  userTier: TierId;
}

export function AccessGate({ requiredTier, children, userTier }: AccessGateProps) {
  const { t } = useTranslation("c-doctrine");
  const hasAccess = (
    requiredTier === 'PUBLIC' ||
    (requiredTier === 'INSIDER' && (userTier === 'INSIDER' || userTier === 'OPERATOR')) ||
    (requiredTier === 'OPERATOR' && userTier === 'OPERATOR')
  );

  if (hasAccess) return <>{children}</>;

  const tier = TIERS[requiredTier];

  return (
    <div
      className="rounded-lg p-8 flex flex-col items-center justify-center text-center space-y-3"
      style={{
        background: 'var(--doctrine-bg-secondary, #141416)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: `${tier.color}20` }}>
        <Lock size={20} style={{ color: tier.color }} />
      </div>
      <h3 className="text-sm font-semibold text-white/80">
        {t("access-required", { defaultValue: "{{tierName}} Access Required", tierName: tier.name })}
      </h3>
      <p className="text-xs text-white/40 max-w-xs">
        {t("content-restricted", { defaultValue: "This content is restricted to {{tierName}} tier and above.", tierName: tier.name })}
        {requiredTier === 'INSIDER' && ' ' + t("upgrade-insider", { defaultValue: "Upgrade to Asset ($5/mo) to unlock." })}
        {requiredTier === 'OPERATOR' && ' ' + t("upgrade-operator", { defaultValue: "Upgrade to Operator ($15/mo) to unlock." })}
      </p>
      <div className="flex items-center gap-1 text-[10px] text-white/20 font-mono">
        <Shield size={10} />
        <span>{t("classification", { defaultValue: "CLASSIFICATION: {{tier}}", tier: requiredTier })}</span>
      </div>
    </div>
  );
}
