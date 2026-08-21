/**
 * Server-only Firecrawl v2 client for Nexus web research.
 *
 * The Firecrawl connection is gateway-backed, so calls go through the Lovable
 * connector gateway with both LOVABLE_API_KEY and FIRECRAWL_API_KEY. Neither
 * key ever leaves the server; the browser only ever sees normalised results.
 */

const GATEWAY_V2 = "https://connector-gateway.lovable.dev/firecrawl/v2";
const DIRECT_V2 = "https://api.firecrawl.dev/v2";
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_MARKDOWN_CHARS = 6_000;
const CACHE_TTL_MS = 5 * 60 * 1000;

export type ResearchSource = {
  title: string;
  url: string;
  domain: string;
  excerpt: string;
  markdown: string;
};

export class FirecrawlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirecrawlError";
  }
}

type CacheEntry = { at: number; value: unknown };
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet(key: string, value: unknown) {
  if (cache.size > 50) cache.clear();
  cache.set(key, { at: Date.now(), value });
}

function friendlyStatus(status: number): string {
  if (status === 401 || status === 403)
    return "Nexus isn't authorised to use web research right now.";
  if (status === 402) return "Web research has no remaining credits.";
  if (status === 429) return "Web research is rate limited. Try again in a moment.";
  if (status === 408 || status === 504) return "That page took too long to respond.";
  if (status >= 500) return "The web research service is temporarily unavailable.";
  return "The web research request was rejected.";
}

async function firecrawlFetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const key = process.env["FIRECRAWL_API_KEY"];
  if (!key) {
    throw new FirecrawlError(
      "Web research isn't configured yet — the Firecrawl connection is missing.",
    );
  }

  const gatewayKey = process.env["LOVABLE_API_KEY"];
  const isConnectionKey = key.startsWith("lovc_");
  if (isConnectionKey && !gatewayKey) {
    throw new FirecrawlError("Web research isn't configured yet — missing gateway credentials.");
  }

  const url = `${isConnectionKey ? GATEWAY_V2 : DIRECT_V2}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isConnectionKey) {
    headers["Authorization"] = `Bearer ${gatewayKey}`;
    headers["X-Connection-Api-Key"] = key;
  } else {
    headers["Authorization"] = `Bearer ${key}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && /abort|timeout/i.test(error.name + error.message);
    throw new FirecrawlError(
      timedOut
        ? "The web research request timed out."
        : "Nexus couldn't reach the web research service.",
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[nexus-firecrawl] request failed", path, response.status, detail.slice(0, 400));
    throw new FirecrawlError(friendlyStatus(response.status));
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new FirecrawlError("The web research service returned an unreadable response.");
  }
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Plain-text excerpt from markdown — strips markup so nothing renders as HTML. */
export function toExcerpt(markdown: string, max = 240): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/[#>*_`|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function clampMarkdown(markdown: string, max = MAX_MARKDOWN_CHARS): string {
  return markdown.length > max ? `${markdown.slice(0, max)}\n\n…[content truncated]` : markdown;
}

type ScrapeDoc = {
  markdown?: string;
  links?: string[];
  metadata?: { title?: string; description?: string; sourceURL?: string; language?: string; statusCode?: number };
};

/** Validates a user/model supplied URL: public http(s) only. */
export function normaliseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new FirecrawlError("That doesn't look like a valid web address.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new FirecrawlError("Only http and https links can be researched.");
  }
  const host = parsed.hostname.toLowerCase();
  const isPrivate =
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (isPrivate) throw new FirecrawlError("That address isn't a public website.");
  if (!host.includes(".")) throw new FirecrawlError("That doesn't look like a valid web address.");
  return parsed.toString();
}

export type ScrapeResult = {
  source: ResearchSource;
  description: string;
  language: string;
  links: string[];
};

export async function scrapeUrl(rawUrl: string): Promise<ScrapeResult> {
  const url = normaliseUrl(rawUrl);
  const cacheKey = `scrape:${url}`;
  const cached = cacheGet(cacheKey) as ScrapeResult | undefined;
  if (cached) return cached;

  const payload = await firecrawlFetch<{ data?: ScrapeDoc } & ScrapeDoc>("/scrape", {
    url,
    formats: ["markdown", "links"],
    onlyMainContent: true,
  });

  const doc: ScrapeDoc = payload.data ?? payload;
  const markdown = (doc.markdown ?? "").trim();
  if (!markdown) throw new FirecrawlError("That page didn't return any readable content.");

  const finalUrl = doc.metadata?.sourceURL ?? url;
  const result: ScrapeResult = {
    source: {
      title: doc.metadata?.title?.trim() || domainOf(finalUrl) || finalUrl,
      url: finalUrl,
      domain: domainOf(finalUrl),
      excerpt: toExcerpt(doc.metadata?.description || markdown),
      markdown: clampMarkdown(markdown),
    },
    description: doc.metadata?.description ?? "",
    language: doc.metadata?.language ?? "",
    links: (doc.links ?? []).slice(0, 25),
  };
  cacheSet(cacheKey, result);
  return result;
}

type SearchItem = {
  url?: string;
  title?: string;
  description?: string;
  markdown?: string;
};

export async function searchWeb(
  query: string,
  options: { limit?: number; scrapeContent?: boolean } = {},
): Promise<ResearchSource[]> {
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 8);
  const scrapeContent = options.scrapeContent !== false;
  const cacheKey = `search:${query}:${limit}:${scrapeContent}`;
  const cached = cacheGet(cacheKey) as ResearchSource[] | undefined;
  if (cached) return cached;

  const payload = await firecrawlFetch<{ data?: SearchItem[] | { web?: SearchItem[] } }>("/search", {
    query,
    limit,
    ...(scrapeContent ? { scrapeOptions: { formats: ["markdown"], onlyMainContent: true } } : {}),
  });

  const raw = payload.data;
  const items: SearchItem[] = Array.isArray(raw) ? raw : (raw?.web ?? []);
  const perSourceChars = Math.floor(MAX_MARKDOWN_CHARS / Math.max(items.length, 1));

  const sources = items
    .filter((item): item is SearchItem & { url: string } => typeof item.url === "string")
    .map((item) => {
      const markdown = (item.markdown ?? "").trim();
      return {
        title: item.title?.trim() || domainOf(item.url) || item.url,
        url: item.url,
        domain: domainOf(item.url),
        excerpt: toExcerpt(item.description || markdown),
        markdown: clampMarkdown(markdown, perSourceChars),
      };
    });

  cacheSet(cacheKey, sources);
  return sources;
}
