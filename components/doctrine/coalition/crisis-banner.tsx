import { AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import { useTranslation } from "react-i18next";

interface CrisisBannerProps {
  incidentId: string;
  codename: string;
  severity: string;
  title: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  COSMETIC: '#6B7280',
  DEGRADED: '#F59E0B',
  CRITICAL: '#EF4444',
  CATASTROPHIC: '#DC2626',
};

export function CrisisBanner({ incidentId, codename, severity, title }: CrisisBannerProps) {
  const { t } = useTranslation("c-doctrine");
  const color = SEVERITY_COLORS[severity] ?? '#EF4444';

  return (
    <Link to={`/strategies/incidents`}>
      <motion.div
        animate={{ borderColor: [`${color}30`, `${color}60`, `${color}30`] }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="rounded-lg p-3 flex items-center gap-3 cursor-pointer transition-colors hover:bg-white/[0.02]"
        style={{ background: `${color}08`, border: `1px solid ${color}30` }}
      >
        <AlertTriangle size={16} style={{ color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono" style={{ color }}>{codename}</span>
            <span className="text-[10px] font-mono uppercase px-1 rounded" style={{ color, background: `${color}15` }}>
              {severity}
            </span>
          </div>
          <p className="text-sm text-white/80 truncate">{title}</p>
        </div>
        <span className="text-[10px] text-white/20 shrink-0">{t("view-arrow", { defaultValue: "View →" })}</span>
      </motion.div>
    </Link>
  );
}
