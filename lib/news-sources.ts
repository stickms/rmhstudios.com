/**
 * News Sources Registry
 *
 * Structural groundwork for future automated news ingestion via RSS/API.
 * Currently unused — no polling logic is implemented.
 * When ready to build automated ingestion, this registry defines where
 * to look and what categories each source maps to.
 */

export interface NewsSource {
    id: string;
    name: string;
    url: string;
    rssFeed?: string;
    apiEndpoint?: string;
    categories: string[];
    enabled: boolean;
}

export const NEWS_SOURCES: NewsSource[] = [
    {
        id: 'the-verge',
        name: 'The Verge',
        url: 'https://www.theverge.com',
        rssFeed: 'https://www.theverge.com/rss/index.xml',
        categories: ['AI/ML', 'Tech Industry', 'Gaming'],
        enabled: false,
    },
    {
        id: 'ars-technica',
        name: 'Ars Technica',
        url: 'https://arstechnica.com',
        rssFeed: 'https://feeds.arstechnica.com/arstechnica/index',
        categories: ['AI/ML', 'Tech Industry', 'Science'],
        enabled: false,
    },
    {
        id: 'science-daily',
        name: 'Science Daily',
        url: 'https://www.sciencedaily.com',
        rssFeed: 'https://www.sciencedaily.com/rss/all.xml',
        categories: ['Neuroscience', 'Science', 'Cognitive Science'],
        enabled: false,
    },
    {
        id: 'mit-tech-review',
        name: 'MIT Technology Review',
        url: 'https://www.technologyreview.com',
        rssFeed: 'https://www.technologyreview.com/feed/',
        categories: ['AI/ML', 'Tech Industry', 'Science'],
        enabled: false,
    },
    {
        id: 'ign',
        name: 'IGN',
        url: 'https://www.ign.com',
        rssFeed: 'https://feeds.feedburner.com/ign/all',
        categories: ['Gaming'],
        enabled: false,
    },
    {
        id: 'polygon',
        name: 'Polygon',
        url: 'https://www.polygon.com',
        rssFeed: 'https://www.polygon.com/rss/index.xml',
        categories: ['Gaming', 'Culture'],
        enabled: false,
    },
    {
        id: 'nature',
        name: 'Nature',
        url: 'https://www.nature.com',
        rssFeed: 'https://www.nature.com/nature.rss',
        categories: ['Neuroscience', 'Science'],
        enabled: false,
    },
    {
        id: 'wired',
        name: 'Wired',
        url: 'https://www.wired.com',
        rssFeed: 'https://www.wired.com/feed/rss',
        categories: ['AI/ML', 'Tech Industry', 'Culture'],
        enabled: false,
    },
];

// TODO: Future API endpoint at POST /api/news/ingest
// 1. Accept a URL
// 2. Fetch and summarize the article
// 3. Generate an MDX draft in content/news/
// 4. Require manual review before publishing
