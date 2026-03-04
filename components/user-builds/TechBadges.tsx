'use client';

interface TechBadgesProps {
  technologies: string[];
  size?: 'sm' | 'md';
  limit?: number;
}

// Common technology colors
const TECH_COLORS: Record<string, string> = {
  // Languages
  typescript: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  javascript: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  python: 'bg-green-500/20 text-green-400 border-green-500/30',
  rust: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  go: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  java: 'bg-red-500/20 text-red-400 border-red-500/30',
  'c++': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  c: 'bg-gray-500/20 text-gray-400 border-gray-500/30',

  // Frameworks
  react: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  nextjs: 'bg-white/20 text-white border-white/30',
  'next.js': 'bg-white/20 text-white border-white/30',
  vue: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  svelte: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  angular: 'bg-red-500/20 text-red-400 border-red-500/30',
  node: 'bg-green-500/20 text-green-400 border-green-500/30',
  nodejs: 'bg-green-500/20 text-green-400 border-green-500/30',
  'node.js': 'bg-green-500/20 text-green-400 border-green-500/30',
  express: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  fastapi: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  django: 'bg-green-600/20 text-green-400 border-green-600/30',
  flask: 'bg-gray-500/20 text-gray-400 border-gray-500/30',

  // Databases
  postgresql: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  postgres: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  mysql: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  mongodb: 'bg-green-500/20 text-green-400 border-green-500/30',
  redis: 'bg-red-500/20 text-red-400 border-red-500/30',
  sqlite: 'bg-blue-400/20 text-blue-400 border-blue-400/30',

  // Tools
  docker: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  kubernetes: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  aws: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  gcp: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  azure: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  vercel: 'bg-white/20 text-white border-white/30',
  tailwind: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  tailwindcss: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  prisma: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  graphql: 'bg-pink-500/20 text-pink-400 border-pink-500/30',

  // AI
  openai: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  anthropic: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  claude: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  langchain: 'bg-green-500/20 text-green-400 border-green-500/30',
};

function getTechColor(tech: string): string {
  const normalized = tech.toLowerCase().replace(/\s+/g, '');
  return TECH_COLORS[normalized] || 'bg-violet-500/20 text-violet-400 border-violet-500/30';
}

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
          className={`${sizeClasses} rounded border font-medium ${getTechColor(tech)}`}
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
