export const CATEGORY_QUERIES: Record<string, string> = {
  "AI/ML": "artificial intelligence machine learning 2026",
  "Gaming": "video games gaming news 2026",
  "Tech Industry": "tech industry technology business 2026",
  "Science": "science discovery research breakthrough 2026",
  "Neuroscience": "neuroscience brain research 2026",
  "Cognitive Science": "cognitive science psychology behavior 2026",
  "Culture": "culture society trends internet 2026",
  "Arts": "arts entertainment music film 2026",
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_QUERIES);

export const ARTICLES_PER_RUN = 2;

export const STAGING_DIR = "content/news/staging";
export const NEWS_DIR = "content/news";

// Staging files older than this get auto-deleted at the start of each run
export const STAGING_MAX_AGE_HOURS = 48;

export function buildRssUrl(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

export function pickRandomCategories(count: number): string[] {
  const shuffled = [...ALL_CATEGORIES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
