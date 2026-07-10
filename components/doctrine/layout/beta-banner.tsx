import { useTranslation } from "react-i18next";
import { CURRENT_PHASE } from '@/lib/doctrine/constants';

/**
 * Perpetual beta banner — always visible.
 * Netanyahu Doctrine: The product is never done.
 */
export function BetaBanner() {
  const { t } = useTranslation("c-doctrine");
  return (
    <div
      className="h-7 flex items-center justify-center gap-2 text-[11px] font-mono tracking-wider shrink-0 select-none"
      style={{
        background: 'var(--doctrine-bg-secondary, #141416)',
        color: 'var(--doctrine-text-muted, #52525B)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <span style={{ color: 'var(--doctrine-accent, #F97316)' }}>{t("doctrine-engine", { defaultValue: "DOCTRINE ENGINE" })}</span>
      <span>—</span>
      <span>{CURRENT_PHASE.name}</span>
      <span>—</span>
      <span>{t("perpetual-beta", { defaultValue: "PERPETUAL BETA" })}</span>
    </div>
  );
}
