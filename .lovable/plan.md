# Firecrawl web research inside Nexus

Give the Nexus assistant real web research: it can scrape a URL you paste, or search the web on its own, then answer using what it actually read — with source cards you can click through.

No redesign: same glassmorphism, same routes, same auth, same AI core (Nemotron via OpenRouter with Lovable fallback), same task/email/n8n tools.

## What you get

- Ask "research the latest AI coding tools" → Nexus searches the web, reads the best results, and answers from that content.
- Paste a public URL → Nexus fetches its title, metadata, links and main content as Markdown and works with it.
- Under each research answer: source cards with title, domain, a short excerpt and a clickable original link. Sources come only from real Firecrawl results — never invented.
- Live status while it works: "Searching the web…" → "Reading sources…" → "Analyzing information…" → "Research complete", styled like the existing thinking bubble.
- Clear, non-technical messages for a bad URL, a site that won't load, no results, a timeout, rate limits, or Firecrawl not being configured yet.

## Setup step (needs you)

Firecrawl is added as a connector, which securely provides `FIRECRAWL_API_KEY` to the server. A connect card will appear in chat — pick or create the connection. Nothing is hardcoded and the key is never sent to the browser.

## Technical approach

Reuse the existing tool pipeline; no new architecture.

- `src/lib/ai/firecrawl.server.ts` — server-only Firecrawl v2 client (`scrape`, `search`, `map` optional). Reads `FIRECRAWL_API_KEY` (and `LOVABLE_API_KEY` if the linked connection is gateway-backed) inside the call, per-request timeout via `AbortSignal.timeout`, normalises v2's top-level/`data` response shapes, maps HTTP status to friendly errors (401/402/429/5xx), truncates content to a token-safe size, and caches identical calls briefly in-memory to avoid duplicate requests.
- `src/lib/ai/research.tools.server.ts` — two executors: `web_search` (query, limit, optional `scrape_content`) and `scrape_url` (URL validated as http/https, public host, no localhost/private ranges). Both return `{ ok, sources: [{ title, url, domain, excerpt, markdown }] }`.
- Register them in `src/lib/ai/registry.server.ts` and add declarations to `src/lib/ai/tool-schemas.ts` (read-only, so not in `MUTATING_TOOLS`).
- `src/lib/ai.functions.ts` — add a research section to the system prompt (when to search, must cite only returned URLs, never fabricate), and collect sources returned by research tool calls during the loop; return them as `sources` alongside `text`. Also emit a coarse `phase` per tool call for the UI status text.
- `src/routes/assistant.tsx` + a new `src/components/nexus/source-cards.tsx` — render source cards under the assistant message using existing `GlassPanel`/glass tokens and `nexus-fade-rise`; status phrases drive the existing `ThinkingBubble` label. Markdown is already rendered through `react-markdown` without raw HTML, so scraped content stays sanitized; excerpts are plain text only.
- Optional small addition on `/knowledge`: a "Research a URL" input calling the same scrape server function — only if it fits the page without layout changes.

## Verification

Typecheck + build, then real runs: a live scrape of a public URL, a real search query through the assistant, a malformed URL, an unreachable domain, and a simulated missing/invalid key — confirming no crash and no server details leaked. Finally commit and push to the connected GitHub repo.
