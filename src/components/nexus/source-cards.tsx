import { ExternalLink, Globe } from "lucide-react";

export type ResearchSourceCard = {
  title: string;
  url: string;
  domain: string;
  excerpt: string;
};

/**
 * Renders the real sources Nexus read for a research answer.
 * Everything here is plain text — no scraped HTML is ever rendered.
 */
export function SourceCards({ sources }: { sources: ResearchSourceCard[] }) {
  if (sources.length === 0) return null;

  return (
    <div className="nexus-fade-rise mt-4 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Sources · {sources.length}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {sources.map((source) => (
          <a
            key={source.url}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="glass glass-hover group block rounded-xl px-3.5 py-3 transition-colors"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Globe className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{source.domain || new URL(source.url).hostname}</span>
              <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <p className="mt-1.5 line-clamp-2 text-sm font-medium">{source.title}</p>
            {source.excerpt ? (
              <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                {source.excerpt}
              </p>
            ) : null}
          </a>
        ))}
      </div>
    </div>
  );
}
