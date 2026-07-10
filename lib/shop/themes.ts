/**
 * Premium theme palettes (the shop's `THEME` cosmetics).
 *
 * Equipping a premium theme used to do nothing — `applyItem` had no `THEME`
 * case, so the purchase had zero visible effect. Each theme now carries a real
 * palette: an accent (which recolors the owner's profile — follow button, links,
 * name, badges, tab indicator) plus a backdrop gradient shown behind the profile
 * header. Keyed by the catalog item's `data.themeId`.
 */
export interface PremiumThemePalette {
  accent: string;
  accentHover: string;
  accentFg: string;
  accentDim: string;
  gradient: string;
}

export const PREMIUM_THEMES: Record<string, PremiumThemePalette> = {
  midnight: { accent: '#3b82f6', accentHover: '#2563eb', accentFg: '#ffffff', accentDim: 'rgba(59,130,246,0.14)', gradient: 'linear-gradient(135deg,#0f172a,#1e3a8a,#2563eb)' },
  vapor: { accent: '#f472b6', accentHover: '#ec4899', accentFg: '#1a0b1f', accentDim: 'rgba(244,114,182,0.16)', gradient: 'linear-gradient(135deg,#7c3aed,#db2777,#22d3ee)' },
  arctic: { accent: '#22d3ee', accentHover: '#06b6d4', accentFg: '#062c33', accentDim: 'rgba(34,211,238,0.14)', gradient: 'linear-gradient(135deg,#0e7490,#a5f3fc)' },
  meadow: { accent: '#84cc16', accentHover: '#65a30d', accentFg: '#0c1c05', accentDim: 'rgba(132,204,22,0.16)', gradient: 'linear-gradient(135deg,#166534,#a3e635)' },
  'neon-city': { accent: '#22d3ee', accentHover: '#06b6d4', accentFg: '#06121f', accentDim: 'rgba(34,211,238,0.16)', gradient: 'linear-gradient(135deg,#0f172a,#22d3ee,#db2777)' },
  'golden-hour': { accent: '#fbbf24', accentHover: '#f59e0b', accentFg: '#2b1a00', accentDim: 'rgba(251,191,36,0.16)', gradient: 'linear-gradient(135deg,#b45309,#fbbf24,#fde68a)' },
  'deep-space': { accent: '#7c3aed', accentHover: '#6d28d9', accentFg: '#ffffff', accentDim: 'rgba(124,58,237,0.18)', gradient: 'linear-gradient(135deg,#020617,#4338ca,#7c3aed)' },
  cyberpunk: { accent: '#22d3ee', accentHover: '#0ea5b7', accentFg: '#1a0312', accentDim: 'rgba(34,211,238,0.16)', gradient: 'linear-gradient(135deg,#831843,#22d3ee,#fde047)' },
  inferno: { accent: '#ef4444', accentHover: '#dc2626', accentFg: '#ffffff', accentDim: 'rgba(239,68,68,0.16)', gradient: 'linear-gradient(135deg,#450a0a,#ef4444,#fbbf24)' },
  'prism-break': { accent: '#f43f5e', accentHover: '#e11d48', accentFg: '#ffffff', accentDim: 'rgba(244,63,94,0.14)', gradient: 'linear-gradient(135deg,#f43f5e,#fbbf24,#34d399,#38bdf8,#a78bfa)' },
  iridescence: { accent: '#a78bfa', accentHover: '#8b5cf6', accentFg: '#1a1030', accentDim: 'rgba(167,139,250,0.16)', gradient: 'linear-gradient(135deg,#fca5a5,#fde68a,#a7f3d0,#bfdbfe,#ddd6fe)' },
};

export function getPremiumTheme(themeId: string | undefined | null): PremiumThemePalette | undefined {
  return themeId ? PREMIUM_THEMES[themeId] : undefined;
}
