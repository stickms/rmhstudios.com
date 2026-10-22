import { TriangleAlert, OctagonAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Tone } from '@/lib/perf/derive';
import { cn } from '@/lib/utils';

/** Ink for a tone, from the site tokens only. */
export function toneClass(tone: Tone): string {
  if (tone === 'danger') return 'text-site-danger';
  if (tone === 'warn') return 'text-site-warning';
  return 'text-site-text';
}

interface KpiProps {
  label: string;
  value: string;
  tone?: Tone;
  hint?: string;
}

/**
 * One headline number. A warning or danger tone changes the ink AND adds a glyph
 * with screen-reader text, so the state does not depend on telling amber from red
 * (the same rule `Badge` follows for status variants).
 */
export function Kpi({ label, value, tone = 'none', hint }: KpiProps) {
  const { t } = useTranslation('f-perf');
  return (
    <div className="glass-fill rounded-site p-4">
      <p className="text-xs text-site-text-muted">{label}</p>
      <p
        className={cn(
          'mt-1 flex items-center gap-1.5 text-2xl font-bold tabular-nums',
          toneClass(tone),
        )}
      >
        {value}
        {tone === 'warn' && (
          <>
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            <span className="sr-only">{t('tone-warn', { defaultValue: 'Warning' })}</span>
          </>
        )}
        {tone === 'danger' && (
          <>
            <OctagonAlert className="size-4 shrink-0" aria-hidden />
            <span className="sr-only">{t('tone-danger', { defaultValue: 'Critical' })}</span>
          </>
        )}
      </p>
      {hint && <p className="mt-1 text-xs text-site-text-dim">{hint}</p>}
    </div>
  );
}
