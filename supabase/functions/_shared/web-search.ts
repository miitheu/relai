/**
 * Web Search utility using Brave Search API.
 * Free tier: 2000 queries/month, 1 query/second.
 */

export interface WebSearchResult {
  title: string;
  url: string;
  description: string;
  age?: string;
}

export interface WebSearchResponse {
  results: WebSearchResult[];
  query: string;
}

const BRAVE_API = "https://api.search.brave.com/res/v1/web/search";

/**
 * Search the web using Brave Search API.
 */
export async function webSearch(
  query: string,
  options: { count?: number; freshness?: string } = {},
): Promise<WebSearchResponse> {
  const apiKey = Deno.env.get("BRAVE_SEARCH_API_KEY");
  if (!apiKey) throw new Error("BRAVE_SEARCH_API_KEY not configured");

  const params = new URLSearchParams({
    q: query,
    count: String(options.count || 5),
  });
  if (options.freshness) params.set("freshness", options.freshness);

  const resp = await fetch(`${BRAVE_API}?${params}`, {
    headers: {
      "Accept": "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!resp.ok) {
    if (resp.status === 429) throw new Error("Brave Search rate limited — try again");
    throw new Error(`Brave Search error: HTTP ${resp.status}`);
  }

  const data = await resp.json();
  const results: WebSearchResult[] = (data.web?.results || []).map((r: any) => ({
    title: r.title || "",
    url: r.url || "",
    description: r.description || "",
    age: r.age || undefined,
  }));

  return { results, query };
}

/**
 * Fetch a URL and extract text content (strip HTML tags).
 */
export async function fetchPageText(
  url: string,
  maxChars = 5000,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Relai CRM Bot/1.0 (support@relai.com)",
        "Accept": "text/html,application/xhtml+xml",
      },
    });

    if (!resp.ok) return "";

    const html = await resp.text();
    // Strip HTML tags and normalize whitespace
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();

    return text.slice(0, maxChars);
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Batch web search with rate limiting between requests.
 */
export async function batchWebSearch(
  queries: string[],
  delayMs = 1100,
): Promise<WebSearchResponse[]> {
  const results: WebSearchResponse[] = [];
  for (let i = 0; i < queries.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, delayMs));
    try {
      results.push(await webSearch(queries[i]));
    } catch {
      results.push({ results: [], query: queries[i] });
    }
  }
  return results;
}
