const JINA_PREFIX = "https://r.jina.ai/";
const MAX_CONTENT_LENGTH = 6000;
const MIN_CONTENT_LENGTH = 200;
const TIMEOUT_MS = 15000;

export async function scrapeArticle(url: string): Promise<string> {
  try {
    const jinaUrl = `${JINA_PREFIX}${url}`;
    const res = await fetch(jinaUrl, {
      headers: {
        Accept: "text/markdown",
        "User-Agent": "RMHStudios-News-Pipeline/1.0",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`Jina returned ${res.status}`);

    const text = await res.text();

    if (text.length < MIN_CONTENT_LENGTH) {
      throw new Error(`Content too short (${text.length} chars)`);
    }

    return text.slice(0, MAX_CONTENT_LENGTH);
  } catch (err) {
    console.warn(`[scraper] Jina.ai failed for ${url}: ${err}. Will fall back to RSS snippet.`);
    return "";
  }
}
