import { useTranslation } from "react-i18next";
import { useDoctrineCountdown } from '@/hooks/useDoctrineCountdown';

interface CountdownTimerProps {
  target: Date | null;
  label?: string;
  onExpired?: () => void;
}

export function CountdownTimer({ target, label }: CountdownTimerProps) {
  const { t } = useTranslation("c-doctrine");
  const { hours, minutes, seconds, expired } = useDoctrineCountdown(target);

  if (expired) {
    return (
      <span className="font-mono text-sm" style={{ color: 'var(--doctrine-accent, #F97316)' }}>
        {t("now", { defaultValue: "NOW" })}
      </span>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      {label && <span className="text-xs text-white/40 mr-1">{label}</span>}
      <span className="font-mono text-sm tabular-nums text-white/80">
        {hours > 0 && <>{String(hours).padStart(2, '0')}:</>}
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
    </div>
  );
}
