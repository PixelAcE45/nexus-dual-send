import { z } from "zod";
import type { ToolContext, ToolResult } from "./tasks.tools.server";

const WebSearchArgs = z.object({
  query: z.string().trim().min(2).max(300),
  limit: z.number().int().min(1).max(8).optional(),
  scrape_content: z.boolean().optional(),
});

const ScrapeUrlArgs = z.object({
  url: z.string().trim().min(4).max(2000),
});

export const researchTools: Record<
  string,
  (ctx: ToolContext, raw: unknown) => Promise<ToolResult>
> = {
  async web_search(_ctx, raw): Promise<ToolResult> {
    const args = WebSearchArgs.parse(raw);
    const { searchWeb, FirecrawlError } = await import("./firecrawl.server");
    try {
      const sources = await searchWeb(args.query, {
        limit: args.limit,
        scrapeContent: args.scrape_content,
      });
      if (sources.length === 0) {
        return { ok: true, data: { sources: [], note: "No web results were found for that query." } } as ToolResult;
      }
      return { ok: true, data: { sources } } as ToolResult;
    } catch (error) {
      if (error instanceof FirecrawlError) return { ok: false, error: error.message } as ToolResult;
      console.error("[nexus-research] web_search failed", error);
      return { ok: false, error: "Web research failed unexpectedly." } as ToolResult;
    }
  },

  async scrape_url(_ctx, raw): Promise<ToolResult> {
    const args = ScrapeUrlArgs.parse(raw);
    const { scrapeUrl, FirecrawlError } = await import("./firecrawl.server");
    try {
      const result = await scrapeUrl(args.url);
      return {
        ok: true,
        data: {
          sources: [result.source],
          title: result.source.title,
          description: result.description,
          language: result.language,
          links: result.links,
          content: result.source.markdown,
        },
      } as ToolResult;
    } catch (error) {
      if (error instanceof FirecrawlError) return { ok: false, error: error.message } as ToolResult;
      console.error("[nexus-research] scrape_url failed", error);
      return { ok: false, error: "That page couldn't be read." } as ToolResult;
    }
  },
};

export const RESEARCH_TOOLS = ["web_search", "scrape_url"];
