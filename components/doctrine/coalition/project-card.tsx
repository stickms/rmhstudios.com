import { ExternalLink } from 'lucide-react';
import { useTranslation } from "react-i18next";

interface ProjectCardProps {
  name: string;
  description: string;
  status: 'active' | 'beta' | 'coming-soon';
  userActive: boolean;
  url?: string;
}

const STATUS_COLORS = {
  active: '#22C55E',
  beta: '#F59E0B',
  'coming-soon': '#6B7280',
};

export function ProjectCard({ name, description, status, userActive, url }: ProjectCardProps) {
  const { t } = useTranslation("c-doctrine");
  return (
    <div
      className="rounded-lg p-4 space-y-2 transition-colors hover:bg-white/[0.02]"
      style={{
        background: 'var(--doctrine-bg-secondary, #141416)',
        border: `1px solid ${userActive ? 'var(--doctrine-accent, #F97316)30' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/90">{name}</h3>
        <span
          className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded"
          style={{ color: STATUS_COLORS[status], backgroundColor: `${STATUS_COLORS[status]}15` }}
        >
          {status}
        </span>
      </div>
      <p className="text-xs text-white/40">{description}</p>
      <div className="flex items-center justify-between">
        {userActive && (
          <span className="text-[10px] text-green-400/80 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
            {t("active", { defaultValue: "Active" })}
          </span>
        )}
        {url && (
          <a href={url} className="text-[10px] text-white/30 hover:text-white/50 flex items-center gap-1">
            {t("open", { defaultValue: "Open" })} <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  );
}
