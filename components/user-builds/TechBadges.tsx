'use client';

interface TechBadgesProps {
  technologies: string[];
  size?: 'sm' | 'md';
  limit?: number;
}

// Tech chips were a hardcoded Tailwind-palette map (`bg-*-500/20 text-*-400`, plus
// an invisible `bg-white/20 text-white` for Next.js/Vercel). Those `*-400` inks are
// tuned for dark backgrounds and drop below WCAG AA on the three light themes, and
// white-on-white vanished entirely. Since the app wires no `dark:` variant, a
// per-tech tint can't be made legible in both polarities — so every chip now uses
// one design-system token pair (accent tint + accent ink) that is guaranteed to
// contrast in every theme.
const TECH_CHIP = 'bg-site-accent-dim text-site-accent border-site-border';

export function TechBadges({ technologies, size = 'md', limit }: TechBadgesProps) {
  let parsedTechs: string[] = [];
  if (Array.isArray(technologies)) {
    parsedTechs = technologies;
  } else if (typeof technologies === 'string') {
    try {
      const parsed = JSON.parse(technologies);
      if (Array.isArray(parsed)) {
        parsedTechs = parsed;
      } else {
        parsedTechs = [technologies];
      }
    } catch {
      parsedTechs = [technologies];
    }
  }

  const displayTechs = limit ? parsedTechs.slice(0, limit) : parsedTechs;
  const remaining = limit && parsedTechs.length > limit ? parsedTechs.length - limit : 0;

  const sizeClasses = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';

  return (
    <div className="flex flex-wrap gap-1.5">
      {displayTechs.map((tech, i) => (
        <span
          key={`${tech}-${i}`}
          className={`${sizeClasses} rounded border font-medium ${TECH_CHIP}`}
        >
          {tech}
        </span>
      ))}
      {remaining > 0 && (
        <span className={`${sizeClasses} rounded border bg-site-surface text-site-text-dim border-site-border`}>
          +{remaining}
        </span>
      )}
    </div>
  );
}
