/**
 * RMH News sources: the free, public RSS/Atom feeds the wire ingest reads (lib/news-wire/ingest.server.ts).
 *
 * Every feed here is published by its outlet for exactly this use: headline, short excerpt, picture and a link back.
 * RMH News shows those and links out for the full story; it never copies an article body. The Conversation is
 * licensed CC BY-ND, NASA is public domain, and the rest are the outlets' own public syndication feeds.
 *
 * `hint` is the category the feed mostly covers. The keyword categorizer (./categorize.ts) uses it as a tie-breaker
 * and as the answer when no keyword matches, so a general feed like BBC Top Stories gets "World" by default and
 * "Sports" when the headline says so.
 *
 * Client-safe and dependency-free: the article page's attribution line and the sources list read it too.
 */

import type { NewsCategory } from './categorize';

export interface NewsSource {
  /** Stable id stored on each article as `feedId`. Renaming one orphans nothing, but dedupe is per URL anyway. */
  id: string;
  /** The outlet's name as readers know it; stored as `sourcePublisher`. */
  publisher: string;
  url: string;
  hint: NewsCategory;
  /**
   * Some outlets publish small thumbnails in the feed and larger renditions at a predictable URL (BBC's ichef
   * `/standard/240/` path takes any of its standard widths). Applied to the feed's own image URL only.
   */
  upgradeImage?: (url: string) => string;
}

const bbcImage = (url: string) => url.replace(/\/(ace\/standard|news)\/\d+\//, '/$1/976/');

export const NEWS_SOURCES: readonly NewsSource[] = [
  {
    id: 'bbc-top',
    publisher: 'BBC News',
    url: 'https://feeds.bbci.co.uk/news/rss.xml',
    hint: 'World',
    upgradeImage: bbcImage,
  },
  {
    id: 'bbc-tech',
    publisher: 'BBC News',
    url: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
    hint: 'Technology',
    upgradeImage: bbcImage,
  },
  {
    id: 'bbc-science',
    publisher: 'BBC News',
    url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
    hint: 'Science',
    upgradeImage: bbcImage,
  },
  { id: 'guardian-world', publisher: 'The Guardian', url: 'https://www.theguardian.com/world/rss', hint: 'World' },
  { id: 'npr-news', publisher: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml', hint: 'Politics' },
  { id: 'aljazeera', publisher: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', hint: 'World' },
  { id: 'ars', publisher: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', hint: 'Technology' },
  { id: 'verge', publisher: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', hint: 'Technology' },
  { id: 'engadget', publisher: 'Engadget', url: 'https://www.engadget.com/rss.xml', hint: 'Technology' },
  { id: 'techcrunch', publisher: 'TechCrunch', url: 'https://techcrunch.com/feed/', hint: 'Business' },
  { id: 'wired', publisher: 'Wired', url: 'https://www.wired.com/feed/rss', hint: 'Technology' },
  { id: 'mit-tr', publisher: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', hint: 'AI' },
  { id: 'nasa', publisher: 'NASA', url: 'https://www.nasa.gov/news-release/feed/', hint: 'Space' },
  { id: 'sciencedaily', publisher: 'ScienceDaily', url: 'https://www.sciencedaily.com/rss/all.xml', hint: 'Science' },
  {
    id: 'conversation',
    publisher: 'The Conversation',
    url: 'https://theconversation.com/us/articles.atom',
    hint: 'Science',
  },
  { id: 'rps', publisher: 'Rock Paper Shotgun', url: 'https://www.rockpapershotgun.com/feed', hint: 'Gaming' },
  { id: 'espn', publisher: 'ESPN', url: 'https://www.espn.com/espn/rss/news', hint: 'Sports' },
  { id: 'variety', publisher: 'Variety', url: 'https://variety.com/feed/', hint: 'Entertainment' },
];

/** The distinct outlet names, for the attribution line under the front page. */
export const NEWS_PUBLISHERS: readonly string[] = [...new Set(NEWS_SOURCES.map((s) => s.publisher))];

/** The cache tag the front page's reads carry (app/routes/_site/news/index.tsx), dropped after every ingest that changed something. */
export const NEWS_FRONT_TAG = 'news-front';
