"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button, ButtonLink, Card, CardTitle, ExternalLinkIcon, Pill, PlusIcon, SearchIcon, buttonClasses } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatCents, formatCount } from "@/lib/format";
import { addToInventoryHref, lookupHref, normalizeQuery } from "./query";
import type { LookupResponse, PricePoint, PriceResult, SourceInfo, SourceOutcome, SourceQuota } from "./types";

type PanelState = { status: "loading" } | { status: "failed"; message: string } | SourceOutcome;

const FIRST_PAGE = 8;
const MORE_PAGE = 20;

const SUMMARY_TONES = ["bg-mint", "bg-lilac", "bg-sky", "bg-peach"] as const;

async function fetchOutcome(sourceId: string, query: string, signal: AbortSignal): Promise<PanelState> {
  const response = await fetch(`/api/lookup?${new URLSearchParams({ q: query, source: sourceId }).toString()}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (response.status === 401) return { status: "failed", message: "You are signed out. Sign in again to search." };
  if (!response.ok) return { status: "failed", message: `The search failed (HTTP ${response.status}).` };
  const body = (await response.json()) as LookupResponse;
  const outcome = body.sources.find((entry) => entry.source === sourceId);
  return outcome ?? { status: "failed", message: "The search came back without this source." };
}

/**
 * One source's card on the lookup page. It runs its own request, so a slow or failing source never holds up the other.
 * The page gives it a `key` of source and query, so a new search starts from a fresh loading state.
 */
export function SourcePanel({ source, query }: { source: SourceInfo; query: string }) {
  const [state, setState] = useState<PanelState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!source.configured) return;
    const controller = new AbortController();
    fetchOutcome(source.id, query, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setState(next);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ status: "failed", message: "The search could not reach the app. Check your connection." });
        }
      });
    return () => controller.abort();
  }, [source.id, source.configured, query, attempt]);

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((count) => count + 1);
  };

  const view: PanelState = source.configured
    ? state
    : { source: source.id, label: source.label, status: "not_configured", message: source.setupHint };
  const headingId = `lookup-${source.id}-heading`;

  return (
    <Card aria-labelledby={headingId} aria-busy={view.status === "loading"} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <CardTitle>
            <span id={headingId}>{source.label}</span>
          </CardTitle>
          <p className="mt-0.5 text-ink-muted">{source.description}</p>
        </div>
        {view.status === "ok" ? (
          <Pill tone={view.data.results.length > 0 ? "lilac" : "neutral"}>
            {formatCount(view.data.results.length)} {view.data.results.length === 1 ? "result" : "results"}
          </Pill>
        ) : null}
      </div>

      {view.status === "loading" ? <LoadingRows label={source.label} /> : null}

      {view.status === "not_configured" ? (
        <div className="rounded-control bg-butter px-4 py-3 text-ink-secondary">
          <p className="font-semibold text-ink">{source.label} is not set up</p>
          <p className="mt-1">{view.message}</p>
        </div>
      ) : null}

      {view.status === "error" || view.status === "failed" ? (
        <div role="alert" className="rounded-control bg-danger-tint px-4 py-3">
          <p className="font-semibold text-danger">{source.label} could not be searched</p>
          <p className="mt-1 text-ink">{view.message}</p>
          <Button className="mt-3" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : null}

      {view.status === "ok" ? <Results outcome={view} query={query} siteName={source.siteName} /> : null}
    </Card>
  );
}

function LoadingRows({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="text-ink-muted">Searching {label}…</span>
      {[0, 1, 2].map((row) => (
        <div key={row} aria-hidden="true" className="flex animate-pulse gap-3 motion-reduce:animate-none">
          <div className="size-14 shrink-0 rounded-inner bg-track" />
          <div className="flex flex-1 flex-col gap-2 py-1">
            <div className="h-3.5 w-3/4 rounded-pill bg-track" />
            <div className="h-3 w-1/3 rounded-pill bg-track" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Results({ outcome, query, siteName }: { outcome: Extract<SourceOutcome, { status: "ok" }>; query: string; siteName: string }) {
  const { data } = outcome;
  const [shown, setShown] = useState(FIRST_PAGE);
  const visible = data.results.slice(0, shown);
  const hidden = data.results.length - visible.length;

  return (
    <>
      {data.summary.length > 0 ? (
        <div>
          <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {data.summary.map((point, index) => (
              <div key={point.key} className={cn("rounded-control px-3 py-2.5", SUMMARY_TONES[index % SUMMARY_TONES.length])}>
                <dt className="text-eyebrow">{point.label}</dt>
                <dd className="mt-0.5 font-display text-[20px] font-bold tabular-nums">{formatPrice(point)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[13px] text-ink-muted">
            Across the {formatCount(data.results.length)} most recent {data.results.length === 1 ? "sale" : "sales"}. Shipping is not included.
          </p>
        </div>
      ) : null}

      {data.notice ? <p className="rounded-control bg-sky px-3 py-2.5 text-sky-ink">{data.notice}</p> : null}

      {data.results.length === 0 ? (
        <p className="rounded-control bg-ground px-4 py-6 text-center text-ink-secondary">
          Nothing found for <span className="font-semibold text-ink">{query}</span>. Try fewer or different words.
        </p>
      ) : (
        <ul className="-my-1 flex flex-col divide-y divide-border">
          {visible.map((result) => (
            <ResultRow key={result.id} result={result} query={query} siteName={siteName} />
          ))}
        </ul>
      )}

      {hidden > 0 ? (
        <Button onClick={() => setShown((count) => count + MORE_PAGE)} className="self-start">
          Show {formatCount(Math.min(hidden, MORE_PAGE))} more
        </Button>
      ) : null}

      <footer className="flex flex-col gap-1 border-t border-border pt-3 text-[13px] text-ink-muted">
        <p>
          {outcome.cached ? "Saved result from " : "Fetched "}
          {formatTimestamp(outcome.fetchedAt)}. Results are kept for 24 hours.
        </p>
        {data.quota ? <p>{quotaText(data.quota, outcome.cached)}</p> : null}
        {data.searchUrl ? (
          <ExternalLink href={data.searchUrl} className="-ml-3 self-start">
            Open this search on {siteName}
          </ExternalLink>
        ) : null}
      </footer>
    </>
  );
}

function ResultRow({ result, query, siteName }: { result: PriceResult; query: string; siteName: string }) {
  const showSearchTitle = result.searchText !== null && normalizeQuery(result.searchText) !== normalizeQuery(query);
  return (
    <li className="flex gap-3 py-3">
      {result.imageUrl ? (
        // next/image only allows res.cloudinary.com (next.config.ts), and these thumbnails come from the price sources' own hosts.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={result.imageUrl}
          alt=""
          width={56}
          height={56}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-14 shrink-0 rounded-inner border border-border bg-ground object-contain"
        />
      ) : (
        <div aria-hidden="true" className="size-14 shrink-0 rounded-inner bg-track" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 basis-48">
            <h3 className="font-semibold break-words">{result.title}</h3>
            {result.subtitle ? <p className="mt-0.5 text-[13px] text-ink-muted">{result.subtitle}</p> : null}
          </div>
          <dl className="flex shrink-0 gap-4">
            {result.prices.map((point) => (
              <div key={point.key} className="text-right">
                <dt className="text-[12px] text-ink-muted">{point.label}</dt>
                <dd className="font-semibold tabular-nums">{formatPrice(point)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={addToInventoryHref(result, query)} icon={<PlusIcon size={16} />}>
            Add to inventory
            <span className="visually-hidden">: {result.title}</span>
          </ButtonLink>
          {showSearchTitle && result.searchText !== null ? (
            <ButtonLink href={lookupHref(result.searchText)} variant="ghost" icon={<SearchIcon size={16} />}>
              Look up this title
              <span className="visually-hidden">: {result.title}</span>
            </ButtonLink>
          ) : null}
          {result.url ? (
            <ExternalLink href={result.url}>
              View on {siteName}
              <span className="visually-hidden">: {result.title}</span>
            </ExternalLink>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function ExternalLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClasses("ghost", cn("no-underline", className))}>
      {children}
      <ExternalLinkIcon size={16} />
      <span className="visually-hidden">(opens in a new tab)</span>
    </a>
  );
}

function formatPrice(point: PricePoint): string {
  if (point.cents === null) return "—";
  if (point.key === "shipping" && point.cents === 0) return "Free";
  return formatCents(point.cents);
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "earlier";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

/** "46 of 50 requests left until Dec 23". A saved result reports the allowance as it was when it was fetched. */
function quotaText(quota: SourceQuota, cached: boolean): string {
  const reset = quota.resetsAt ? new Date(quota.resetsAt) : null;
  const until =
    reset && !Number.isNaN(reset.getTime())
      ? ` until ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(reset)}`
      : "";
  const count =
    quota.remaining !== null && quota.limit !== null
      ? `${formatCount(quota.remaining)} of ${formatCount(quota.limit)} requests left${until}`
      : quota.remaining !== null
        ? `${formatCount(quota.remaining)} requests left${until}`
        : null;
  if (count === null) return "";
  return cached ? `${count}, as of that search. A saved result uses none.` : `${count}.`;
}
