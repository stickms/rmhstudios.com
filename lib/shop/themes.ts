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

  // ── Accent expansion ───────────────────────────────────────────────────
  // The set above left most of the wheel empty — six of its eleven accents sit
  // in blue/cyan/violet — and nothing below `epic` was buyable at all. These
  // fill the gaps (teal, orange, emerald, fuchsia, neutral, indigo, sky,
  // yellow, purple, green, gold, acid, multi) and open the cheaper rarities.
  // Every `accent`/`accentFg` pair here clears WCAG AA (>= 4.5:1): these are
  // written straight onto the profile subtree, so nothing re-checks them at
  // runtime the way `ensureReadableAccent()` guards a user's custom accent.
  seafoam: { accent: '#2dd4bf', accentHover: '#14b8a6', accentFg: '#04302b', accentDim: 'rgba(45,212,191,0.16)', gradient: 'linear-gradient(135deg,#134e4a,#2dd4bf,#ccfbf1)' },
  ember: { accent: '#f97316', accentHover: '#ea580c', accentFg: '#2a0d00', accentDim: 'rgba(249,115,22,0.16)', gradient: 'linear-gradient(135deg,#7c2d12,#f97316,#fdba74)' },
  jade: { accent: '#10b981', accentHover: '#059669', accentFg: '#04241a', accentDim: 'rgba(16,185,129,0.16)', gradient: 'linear-gradient(135deg,#064e3b,#10b981,#6ee7b7)' },
  orchid: { accent: '#d946ef', accentHover: '#c026d3', accentFg: '#2b0533', accentDim: 'rgba(217,70,239,0.16)', gradient: 'linear-gradient(135deg,#4a044e,#d946ef,#f5d0fe)' },
  steel: { accent: '#94a3b8', accentHover: '#64748b', accentFg: '#0f172a', accentDim: 'rgba(148,163,184,0.18)', gradient: 'linear-gradient(135deg,#0f172a,#475569,#cbd5e1)' },
  'indigo-drift': { accent: '#4f46e5', accentHover: '#4338ca', accentFg: '#ffffff', accentDim: 'rgba(79,70,229,0.18)', gradient: 'linear-gradient(135deg,#1e1b4b,#4f46e5,#a5b4fc)' },
  tidepool: { accent: '#38bdf8', accentHover: '#0ea5e9', accentFg: '#052033', accentDim: 'rgba(56,189,248,0.16)', gradient: 'linear-gradient(135deg,#082f49,#38bdf8,#bae6fd)' },
  harvest: { accent: '#eab308', accentHover: '#ca8a04', accentFg: '#2a1f00', accentDim: 'rgba(234,179,8,0.16)', gradient: 'linear-gradient(135deg,#713f12,#eab308,#fef08a)' },
  'royal-plum': { accent: '#9333ea', accentHover: '#7e22ce', accentFg: '#ffffff', accentDim: 'rgba(147,51,234,0.18)', gradient: 'linear-gradient(135deg,#2e1065,#9333ea,#e9d5ff)' },
  moss: { accent: '#4ade80', accentHover: '#22c55e', accentFg: '#052e16', accentDim: 'rgba(74,222,128,0.16)', gradient: 'linear-gradient(135deg,#14532d,#4ade80,#d9f99d)' },
  obsidian: { accent: '#e5c07b', accentHover: '#d4a95c', accentFg: '#241a05', accentDim: 'rgba(229,192,123,0.16)', gradient: 'linear-gradient(135deg,#09090b,#3f3f46,#e5c07b)' },
  venom: { accent: '#bef264', accentHover: '#a3e635', accentFg: '#1a2400', accentDim: 'rgba(190,242,100,0.16)', gradient: 'linear-gradient(135deg,#1a0b2e,#4c1d95,#bef264)' },
  nebula: { accent: '#c084fc', accentHover: '#a855f7', accentFg: '#1b0733', accentDim: 'rgba(192,132,252,0.16)', gradient: 'linear-gradient(135deg,#0b1026,#4338ca,#c084fc,#f472b6,#38bdf8)' },
};

export function getPremiumTheme(themeId: string | undefined | null): PremiumThemePalette | undefined {
  return themeId ? PREMIUM_THEMES[themeId] : undefined;
}
