/**
 * The RMH News keyword categorizer: one category per headline, by counting words.
 *
 * No model and no network: each category has a list of words and phrases, a headline scores one point per match in
 * its excerpt, two per match in the outlet's own tags, and three per match in the headline itself. The feed's `hint`
 * (./sources.ts) breaks ties and answers when nothing scores at least {@link MIN_SCORE}. It runs over a few hundred
 * items every ingest, in well under a millisecond each.
 *
 * The hint is worth 1.5: one excerpt word does not move a story out of its specialist feed (an ESPN story that mentions
 * "Apple" stays Sports), one headline word (3) does.
 *
 * Words match whole (`\b`), case-insensitively, with an optional plural `s`/`es`, so "chip" finds "chips" and "ai"
 * does not find "said". Words that mean different things in two categories ("game", "season", "model") are left out
 * on purpose: a wrong category is worse than the feed's own.
 *
 * Client-safe and dependency-free (it is in the strict island, tsconfig.strict.json).
 */

import { NEWS_CATEGORIES, type NewsCategory } from './categories';

export { NEWS_CATEGORIES, isNewsCategory, type NewsCategory } from './categories';

/** A headline needs at least this score to leave its feed's hint (one headline word, or two excerpt words). */
export const MIN_SCORE = 2;

// One line per few words, not one per word: the lists are read and tuned as lists.
// prettier-ignore
const KEYWORDS: Record<NewsCategory, readonly string[]> = {
  World: [
    'war', 'ceasefire', 'refugee', 'united nations', 'un security council', 'nato', 'ukraine', 'russia', 'kremlin',
    'gaza', 'israel', 'hamas', 'hezbollah', 'iran', 'syria', 'china', 'beijing', 'taiwan', 'north korea', 'india',
    'pakistan', 'afghanistan', 'africa', 'sudan', 'europe', 'european union', 'middle east', 'troops', 'airstrike',
    'drone strike', 'warship', 'missile', 'embassy', 'diplomat', 'sanction', 'humanitarian', 'coup', 'protester',
    'foreign minister',
  ],
  Politics: [
    'election', 'congress', 'senate', 'senator', 'house of representatives', 'white house', 'president',
    'prime minister', 'parliament', 'supreme court', 'governor', 'democrat', 'republican', 'gop', 'labour party',
    'conservative party', 'campaign', 'ballot', 'voter', 'legislation', 'bill', 'policy', 'impeachment', 'cabinet',
    'trump', 'biden', 'lawmaker', 'administration', 'politics', 'political', 'tariff', 'immigration',
  ],
  Business: [
    'stock', 'stock market', 'wall street', 'dow', 'nasdaq', 's&p 500', 'shares', 'investor', 'earnings', 'revenue',
    'profit', 'ipo', 'merger', 'acquisition', 'acquire', 'startup', 'funding round', 'venture capital', 'valuation',
    'layoff', 'ceo', 'economy', 'economic', 'inflation', 'interest rate', 'federal reserve', 'central bank',
    'recession', 'gdp', 'retail', 'bank', 'crypto', 'bitcoin', 'antitrust', 'billion',
  ],
  Technology: [
    'apple inc', 'apple intelligence', 'tim cook', 'app store', 'iphone', 'ipad', 'macbook', 'macos', 'ios', 'google',
    'android', 'microsoft', 'windows', 'meta', 'amazon', 'samsung', 'smartphone', 'laptop', 'chip', 'semiconductor',
    'nvidia', 'intel', 'amd', 'software', 'app', 'browser', 'cybersecurity', 'hacker', 'data breach', 'ransomware',
    'privacy', 'encryption', 'gadget', 'wearable', 'tesla', 'electric vehicle', 'ev', 'robot', 'internet',
    'broadband', 'social media', 'tiktok', 'open source', 'linux', 'developer', 'cloud', 'quantum computer',
    'quantum computing', 'tech',
  ],
  AI: [
    'ai', 'a.i.', 'artificial intelligence', 'machine learning', 'deep learning', 'neural network', 'chatbot',
    'chatgpt', 'openai', 'anthropic', 'claude', 'gemini', 'llm', 'large language model', 'generative ai', 'deepfake',
    'deepseek', 'copilot', 'agi', 'ai model', 'ai agent', 'midjourney', 'hugging face', 'mistral',
  ],
  Science: [
    'scientist', 'researcher', 'study finds', 'study', 'research', 'physics', 'physicist', 'chemistry', 'biology',
    'biologist', 'genetic', 'gene', 'dna', 'evolution', 'fossil', 'dinosaur', 'archaeology', 'archaeologist',
    'species', 'neuroscience', 'brain', 'neuron', 'psychology', 'cognitive', 'experiment', 'laboratory', 'particle',
    'quantum', 'mathematician', 'ocean', 'ecosystem', 'microbe', 'bacteria', 'peer-reviewed', 'journal nature',
  ],
  Space: [
    'nasa', 'space', 'spacex', 'rocket', 'orbit', 'satellite', 'astronaut', 'iss', 'space station', 'moon', 'lunar',
    'mars', 'jupiter', 'saturn', 'asteroid', 'comet', 'galaxy', 'black hole', 'telescope', 'webb', 'hubble',
    'exoplanet', 'solar system', 'artemis', 'blue origin', 'esa', 'cosmic', 'astronomer', 'starship',
  ],
  Health: [
    'health', 'hospital', 'doctor', 'nurse', 'patient', 'disease', 'virus', 'vaccine', 'covid', 'flu', 'outbreak',
    'pandemic', 'cancer', 'tumor', 'diabetes', 'obesity', 'heart disease', 'alzheimer', 'dementia', 'mental health',
    'depression', 'drug', 'fda', 'clinical trial', 'medicine', 'medical', 'surgery', 'therapy', 'nutrition', 'diet',
    'nhs', 'measles', 'opioid', 'overdose',
  ],
  Climate: [
    'climate', 'climate change', 'global warming', 'carbon', 'emission', 'greenhouse gas', 'fossil fuel', 'renewable',
    'solar power', 'wind power', 'wind farm', 'heatwave', 'heat wave', 'drought', 'wildfire', 'flood', 'hurricane',
    'typhoon', 'cyclone', 'storm', 'glacier', 'sea level', 'deforestation', 'cop30', 'cop31', 'net zero', 'pollution',
    'environment', 'environmental',
  ],
  Gaming: [
    'video game', 'gaming', 'gamer', 'playstation', 'ps5', 'xbox', 'nintendo', 'switch 2', 'steam', 'valve',
    'epic games', 'esports', 'gameplay', 'console', 'indie game', 'rpg', 'roguelike', 'mmo', 'dlc', 'patch notes',
    'early access', 'game pass', 'twitch', 'speedrun', 'minecraft', 'fortnite', 'zelda', 'pokemon', 'call of duty',
    'game developer', 'game studio', 'rock paper shotgun',
  ],
  Entertainment: [
    'film', 'movie', 'box office', 'trailer', 'netflix', 'disney', 'hbo', 'streaming', 'tv series', 'tv show',
    'television', 'actor', 'actress', 'director', 'hollywood', 'oscar', 'emmy', 'grammy', 'album', 'song', 'singer',
    'rapper', 'concert', 'tour', 'music', 'celebrity', 'broadway', 'theater', 'theatre', 'novel', 'author', 'book',
    'festival', 'premiere', 'sequel', 'anime', 'comic', 'art', 'artist', 'museum', 'exhibition',
  ],
  Sports: [
    'nfl', 'nba', 'mlb', 'nhl', 'mls', 'wnba', 'ncaa', 'premier league', 'champions league', 'la liga', 'serie a',
    'football', 'soccer', 'basketball', 'baseball', 'hockey', 'tennis', 'golf', 'cricket', 'rugby', 'olympic',
    'olympics', 'world cup', 'super bowl', 'quarterback', 'touchdown', 'playoff', 'championship', 'formula 1', 'f1',
    'grand prix', 'ufc', 'boxing', 'wimbledon', 'transfer window', 'striker', 'goalkeeper', 'pitcher', 'coach',
    'athlete', 'stadium', 'espn',
  ],
};

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * One regular expression per category, built once. `\b` does not work next to a non-word character ("s&p 500",
 * "a.i."), so each word is wrapped in look-arounds on letters and digits instead.
 */
const MATCHERS: ReadonlyArray<readonly [NewsCategory, RegExp]> = NEWS_CATEGORIES.map((category) => {
  const alternatives = [...KEYWORDS[category]]
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join('|');
  return [category, new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?:e?s)?(?![\\p{L}\\p{N}])`, 'giu')] as const;
});

function count(re: RegExp, text: string): number {
  if (!text) return 0;
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(text) !== null) n++;
  return n;
}

export interface CategorizeInput {
  title: string;
  description?: string;
  /** The outlet's own tags from the feed (`<category>`), when it publishes any. */
  tags?: readonly string[];
  /** The feed's usual category: the tie-breaker and the fallback. */
  hint: NewsCategory;
}

/** Scores for every category, highest first. Exported for the tests and for tuning. */
export function scoreCategories(input: CategorizeInput): Array<{ category: NewsCategory; score: number }> {
  const title = input.title;
  const description = input.description ?? '';
  const tags = (input.tags ?? []).join(' · ');
  return MATCHERS.map(([category, re]) => ({
    category,
    score: 3 * count(re, title) + count(re, description) + 2 * count(re, tags) + (category === input.hint ? 1.5 : 0),
  })).sort((a, b) => b.score - a.score);
}

/** The headline's category. */
export function categorize(input: CategorizeInput): NewsCategory {
  const best = scoreCategories(input)[0];
  return best && best.score >= MIN_SCORE ? best.category : input.hint;
}

/**
 * Keywords that matched, for the article's `tags` column (search and the story-timeline suggestions read it). At most
 * `limit`, in the order they first appear in the headline, then the excerpt.
 */
export function matchedKeywords(title: string, description = '', limit = 6): string[] {
  const text = `${title} ${description}`;
  const found: Array<{ word: string; at: number }> = [];
  for (const [, re] of MATCHERS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const word = m[0].toLowerCase();
      if (!found.some((f) => f.word === word)) found.push({ word, at: m.index });
    }
  }
  return found
    .sort((a, b) => a.at - b.at)
    .slice(0, limit)
    .map((f) => f.word);
}
