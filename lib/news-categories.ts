export const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    "AI/ML": { bg: "bg-violet-500/15", text: "text-violet-400", border: "border-violet-500/30" },
    "Gaming": { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30" },
    "Neuroscience": { bg: "bg-pink-500/15", text: "text-pink-400", border: "border-pink-500/30" },
    "Cognitive Science": { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30" },
    "Tech Industry": { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/30" },
    "Science": { bg: "bg-cyan-500/15", text: "text-cyan-400", border: "border-cyan-500/30" },
    "Culture": { bg: "bg-rose-500/15", text: "text-rose-400", border: "border-rose-500/30" },
    "Arts": { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/30" },
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_COLORS);

export function getCategoryColor(category: string) {
    return CATEGORY_COLORS[category] ?? { bg: "bg-gray-500/15", text: "text-gray-400", border: "border-gray-500/30" };
}
