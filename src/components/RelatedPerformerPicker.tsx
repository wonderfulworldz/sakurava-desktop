import { Search, X } from "lucide-react";
import { type UIEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  parseTextLabelArray,
  type RelatedPerformerReference,
} from "../backend/json";
import type { Performer } from "../backend/types";
import {
  rankPickerSearchResults,
  splitPickerHighlight,
} from "../lib/relatedPicker";

const RELATED_CHIP_STYLES =
  "inline-flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold";
const RELATED_CHIP_TEXT_STYLES = "min-w-0 truncate whitespace-nowrap";
const RELATED_ROW_GRID_STYLES =
  "group grid h-12 w-full grid-cols-[minmax(0,1fr)_minmax(9rem,0.8fr)_2.25rem] items-center gap-4";
const PICKER_RENDER_BATCH_SIZE = 30;

type LoadState = "idle" | "loading" | "loaded" | "error";

type RelatedPerformerPickerProps = {
  performers: Performer[];
  selected: RelatedPerformerReference[];
  loadState: LoadState;
  onChange: (nextSelected: RelatedPerformerReference[]) => void;
  showSelectedSummary?: boolean;
  maxOccurrencesPerPerformer?: number;
};

function RelatedPerformerPicker({
  performers,
  selected,
  loadState,
  onChange,
  showSelectedSummary = true,
  maxOccurrencesPerPerformer = 1,
}: RelatedPerformerPickerProps) {
  const [query, setQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [visibleResultCount, setVisibleResultCount] = useState(
    PICKER_RENDER_BATCH_SIZE,
  );
  const [showAllSelected, setShowAllSelected] = useState(false);
  const [limitMessage, setLimitMessage] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedCountById = selected.reduce((counts, relation) => {
    if (relation.performerId) {
      counts.set(
        relation.performerId,
        (counts.get(relation.performerId) ?? 0) + 1,
      );
    }
    return counts;
  }, new Map<string, number>());
  const selectedNames = new Set(
    selected
      .filter((relation) => !relation.performerId)
      .map((relation) => relation.nameSnapshot.trim().toLowerCase())
      .filter(Boolean),
  );
  const performerById = useMemo(
    () => new Map(performers.map((performer) => [performer.id, performer])),
    [performers],
  );
  const availablePerformers = rankPickerSearchResults(
    performers
    .filter(
      (performer) =>
        (selectedCountById.get(performer.id) ?? 0) <
        maxOccurrencesPerPerformer,
    )
    .filter(
      (performer) =>
        !selectedNames.has(performerBaseName(performer).trim().toLowerCase()),
    ),
    query,
    (performer) => ({
      id: performer.id,
      primary: performerBaseName(performer),
      secondary: [
        performer.originalName,
        ...parseTextLabelArray(performer.aliasesJson),
      ],
    }),
  );
  const visibleSelected = showAllSelected ? selected : selected.slice(0, 3);
  const hiddenSelectedCount = Math.max(selected.length - visibleSelected.length, 0);
  const shouldShowResults = isSearchOpen;
  const visiblePerformers = availablePerformers.slice(0, visibleResultCount);

  useEffect(() => {
    if (selected.length <= 3) {
      setShowAllSelected(false);
    }
  }, [selected.length]);

  useEffect(() => {
    setVisibleResultCount(PICKER_RENDER_BATCH_SIZE);
  }, [query, isSearchOpen, performers.length]);

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }

    const close = () => setIsSearchOpen(false);
    const handleScroll = (event: Event) => {
      if (event.target instanceof Node && pickerRef.current?.contains(event.target)) {
        return;
      }
      close();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !pickerRef.current?.contains(event.target)
      ) {
        close();
      }
    };

    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isSearchOpen]);

  function addPerformer(performer: Performer) {
    if (
      (selectedCountById.get(performer.id) ?? 0) >=
      maxOccurrencesPerPerformer
    ) {
      setLimitMessage(
        `${performerBaseName(performer)} can be added up to ${maxOccurrencesPerPerformer} times.`,
      );
      setIsSearchOpen(true);
      return;
    }

    const nameSnapshot = performerBaseName(performer);
    setLimitMessage("");
    onChange([
      ...selected,
      {
        performerId: performer.id,
        nameSnapshot,
      },
    ]);
    setQuery("");
    setIsSearchOpen(false);
  }

  function removeRelation(relation: RelatedPerformerReference) {
    onChange(
      selected.filter((item) =>
        relation.performerId
          ? item.performerId !== relation.performerId
          : item.nameSnapshot.trim().toLowerCase() !==
            relation.nameSnapshot.trim().toLowerCase(),
      ),
    );
  }

  function handleResultsScroll(event: UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const remaining =
      target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remaining > 48) {
      return;
    }

    setVisibleResultCount((current) =>
      Math.min(current + PICKER_RENDER_BATCH_SIZE, availablePerformers.length),
    );
  }

  return (
    <div
      ref={pickerRef}
      className="grid gap-4 text-sm font-semibold text-slate-700"
      onBlur={() => {
        window.setTimeout(() => setIsSearchOpen(false), 120);
      }}
    >
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
          size={18}
        />
        <input
          className={[
            "h-12 w-full select-text rounded-lg border bg-white pl-12 pr-11 text-sm font-medium text-slate-700 outline-none transition selection:bg-sakura-100 selection:text-slate-900 placeholder:text-slate-400",
            shouldShowResults
              ? "border-sakura-400 ring-4 ring-sakura-100"
              : "border-slate-200 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100",
          ].join(" ")}
          aria-label="Search related performers"
          placeholder="Search performer name, alias, tag..."
          value={query}
          onFocus={() => setIsSearchOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsSearchOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsSearchOpen(false);
            }
          }}
        />
        {query.length > 0 && (
          <button
            type="button"
            className="absolute right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-sakura-300"
            aria-label="Clear related performer search"
            onClick={() => {
              setQuery("");
              setIsSearchOpen(false);
            }}
          >
            <X size={16} />
          </button>
        )}

        {shouldShowResults && (
          <div
            className="sakurava-scrollbar absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
            onScroll={handleResultsScroll}
          >
            {loadState === "loading" && (
              <p className="px-4 py-3 text-sm font-medium text-slate-500">
                Loading performers...
              </p>
            )}
            {loadState === "error" && (
              <p className="px-4 py-3 text-sm font-medium text-amber-700">
                Performer records could not be loaded. Saving without related performers remains allowed.
              </p>
            )}
            {loadState !== "loading" && performers.length === 0 && (
              <p className="px-4 py-3 text-sm font-medium text-slate-500">
                No performer records available. Create performer records first.
              </p>
            )}
            {loadState !== "loading" &&
              performers.length > 0 &&
              availablePerformers.length === 0 && (
                <p className="px-4 py-3 text-sm font-medium text-slate-500">
                  No matching performers available. Use Performers to add it first.
                </p>
              )}
            {visiblePerformers.map((performer) => {
              const name = performerBaseName(performer);
              const meta = performerMetaParts(performer);

              return (
                <button
                  key={performer.id}
                  type="button"
                  className={`${RELATED_ROW_GRID_STYLES} overflow-hidden border-b border-slate-100 px-4 text-left text-sm transition-colors last:border-b-0 hover:bg-sakura-50 focus:bg-sakura-50 focus:outline-none`}
                  data-testid="related-performer-result-row"
                  aria-label={`Add related performer ${name}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => addPerformer(performer)}
                >
                  <span className="min-w-0 truncate whitespace-nowrap font-bold text-slate-900">
                    <HighlightedPickerText text={name} query={query} />
                  </span>
                  <PerformerMeta parts={meta} />
                  <span className="flex h-8 items-center justify-center justify-self-end rounded-md px-2 text-[11px] font-bold text-sakura-500 transition-colors group-hover:bg-sakura-100">
                    Add
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {limitMessage && (
        <p className="text-sm font-medium text-amber-700" role="status">
          {limitMessage}
        </p>
      )}

      {showSelectedSummary && (selected.length === 0 ? (
        <p className="text-sm font-medium text-slate-500">
          No related performers selected.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {visibleSelected.map((relation) => {
              const performer = relation.performerId
                ? performerById.get(relation.performerId)
                : undefined;
              const name = performer
                ? performerBaseName(performer)
                : relation.nameSnapshot || "Unresolved Performer";
              const unresolved = !performer;

              return (
                <span
                  key={relation.performerId || relation.nameSnapshot}
                  className={`${RELATED_CHIP_STYLES} ${
                    unresolved
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-sakura-100 bg-sakura-50 text-sakura-600"
                  }`}
                >
                  <span className={RELATED_CHIP_TEXT_STYLES}>{name}</span>
                  {unresolved && (
                    <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] uppercase tracking-normal">
                      Unresolved
                    </span>
                  )}
                  <button
                    type="button"
                    className={
                      unresolved
                        ? "text-amber-700 hover:text-amber-900"
                        : "text-sakura-500 hover:text-sakura-700"
                    }
                    aria-label={`Remove related performer ${name}`}
                    onClick={() => removeRelation(relation)}
                  >
                    <X size={13} />
                    <span className="sr-only">Remove</span>
                  </button>
                </span>
              );
            })}
          {hiddenSelectedCount > 0 && (
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-sakura-200 hover:bg-sakura-50 hover:text-sakura-600"
              onClick={() => setShowAllSelected(true)}
            >
              +{hiddenSelectedCount} more
            </button>
          )}
          {showAllSelected && selected.length > 3 && (
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500 transition-colors hover:border-sakura-200 hover:bg-sakura-50 hover:text-sakura-600"
              onClick={() => setShowAllSelected(false)}
            >
              Show less
            </button>
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-500">
          {selected.length > 0
            ? `${selected.length} ${
                selected.length === 1 ? "performer" : "performers"
              } selected`
            : ""}
        </span>
        <div className="flex items-center gap-4">
          {selected.length > 0 && (
            <button
              type="button"
              className="font-semibold text-slate-500 transition-colors hover:text-slate-700"
              onClick={() => onChange([])}
            >
              Clear all
            </button>
          )}
          {selected.length > 0 && (
            <span className="h-5 w-px bg-slate-200" aria-hidden="true" />
          )}
          <Link
            to="/performers"
            className="font-semibold text-sakura-600 transition-colors hover:text-sakura-700"
          >
            Open Performers
          </Link>
        </div>
      </div>
    </div>
  );
}

function HighlightedPickerText({ text, query }: { text: string; query: string }) {
  return (
    <>
      {splitPickerHighlight(text, query).map((part, index) =>
        part.highlighted ? (
          <mark
            key={`${part.text}-${index}`}
            className="rounded bg-sakura-100 px-0 text-inherit"
          >
            {part.text}
          </mark>
        ) : (
          <span key={`${part.text}-${index}`}>{part.text}</span>
        ),
      )}
    </>
  );
}

function performerBaseName(performer: Performer) {
  return performer.name || performer.originalName || "Unnamed Performer";
}

function PerformerMeta({ parts }: { parts: { context: string[]; rating: string } }) {
  if (parts.context.length === 0 && !parts.rating) {
    return <span aria-hidden="true" />;
  }

  return (
    <span className="flex min-w-0 items-center justify-end gap-1.5 text-right text-sm font-medium text-slate-500">
      {parts.context.length > 0 && (
        <span className="min-w-0 truncate whitespace-nowrap">
          {parts.context.join(" · ")}
        </span>
      )}
      {parts.context.length > 0 && parts.rating && (
        <span className="shrink-0" aria-hidden="true">
          {" · "}
        </span>
      )}
      {parts.rating && (
        <span className="shrink-0 whitespace-nowrap">{parts.rating}</span>
      )}
    </span>
  );
}

function performerMetaParts(performer: Performer) {
  const context = [
    performer.nationality.trim(),
    performerActiveRange(performer),
  ].filter(Boolean);

  return {
    context,
    rating: ratingLabel(performer.ratingJson),
  };
}

function performerActiveRange(performer: Performer) {
  const debut = performer.debutDate.trim() ? performer.debutDate.trim().slice(0, 4) : "";
  const retired = performer.retiredDate.trim()
    ? performer.retiredDate.trim().slice(0, 4)
    : "";

  if (debut && retired) {
    return `${debut}-${retired}`;
  }

  if (debut && performer.status === "Active") {
    return `${debut}-Now`;
  }

  return debut || retired;
}

function ratingLabel(ratingJson: string) {
  try {
    const value = JSON.parse(ratingJson) as Record<string, unknown>;
    const ratings = Object.values(value).filter(
      (rating): rating is number =>
        typeof rating === "number" && rating >= 1 && rating <= 5,
    );
    if (ratings.length === 0) {
      return "";
    }

    const average =
      ratings.reduce((total, rating) => total + rating, 0) / ratings.length;
    return `★ ${average.toFixed(1)}`;
  } catch {
    return "";
  }
}

export default RelatedPerformerPicker;
