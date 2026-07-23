// Category chips keep a distinct hue per topic, but the colour must stay legible
// in every theme. A translucent tint (`bg-*-500/15` + `text-*-400`) can't do that
// — the tint composites bright on light themes and dark on dark themes, so a
// single text shade always fails one polarity (and this app wires no Tailwind
// `dark:` variant). So each chip uses an OPAQUE, mid-dark background with white
// text: contrast is then independent of the surface underneath, and every shade
// below clears WCAG AA (4.5:1) against white.
export const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    "AI/ML": { bg: "bg-violet-600", text: "text-white", border: "border-transparent" },
    "Gaming": { bg: "bg-emerald-700", text: "text-white", border: "border-transparent" },
    "Neuroscience": { bg: "bg-pink-700", text: "text-white", border: "border-transparent" },
    "Cognitive Science": { bg: "bg-amber-700", text: "text-white", border: "border-transparent" },
    "Tech Industry": { bg: "bg-blue-600", text: "text-white", border: "border-transparent" },
    "Science": { bg: "bg-cyan-700", text: "text-white", border: "border-transparent" },
    "Culture": { bg: "bg-rose-700", text: "text-white", border: "border-transparent" },
    "Arts": { bg: "bg-orange-700", text: "text-white", border: "border-transparent" },
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_COLORS);

export function getCategoryColor(category: string) {
    return CATEGORY_COLORS[category] ?? { bg: "bg-gray-600", text: "text-white", border: "border-transparent" };
}
