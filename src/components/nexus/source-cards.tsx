import { ChevronDown, ExternalLink, Globe } from "lucide-react";
import { useState } from "react";

export type ResearchSourceCard = {
  title: string;
  url: string;
  domain: string;
  excerpt: string;
};

function hostOf(source: ResearchSourceCard) {
  if (source.domain) return source.domain;
  try {
    return new URL(source.url).hostname;
  } catch {
    return source.url;
  }
}

/**
 * Renders the real sources Nexus read for a research answer.
 * Collapsed by default — the user expands only when they want detail.
 * Everything here is plain text — no scraped HTML is ever rendered.
 */
export function SourceCards({ sources }: { sources: ResearchSourceCard[] }) {
  const [open, setOpen] = useState(false);
  if (sources.length === 0) return null;

  return (
    <div className="nexus-fade-rise mt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="glass glass-hover flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground"
      >
        <Globe className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium uppercase tracking-wide">Sources · {sources.length}</span>
        {!open ? (
          <span className="min-w-0 truncate text-muted-foreground/80">
            {sources.map(hostOf).slice(0, 3).join(", ")}
            {sources.length > 3 ? "…" : ""}
          </span>
        ) : null}
        <ChevronDown
          className={`ml-auto h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="nexus-fade-rise mt-2 grid gap-2 sm:grid-cols-2">
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
                <span className="truncate">{hostOf(source)}</span>
                <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm font-medium">{source.title}</p>
              {source.excerpt ? (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {source.excerpt}
                </p>
              ) : null}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
