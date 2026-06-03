import { Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { RelatedPerformerReference } from "../backend/json";
import type { Performer } from "../backend/types";
import { performerSearchText } from "../lib/relatedPicker";

const RELATED_CHIP_STYLES =
  "inline-flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold";
const RELATED_CHIP_TEXT_STYLES = "min-w-0 truncate whitespace-nowrap";
const RELATED_ROW_GRID_STYLES =
  "group grid h-12 w-full grid-cols-[minmax(0,1fr)_minmax(10rem,0.75fr)_2.25rem] items-center gap-4";

type LoadState = "idle" | "loading" | "loaded" | "error";

type RelatedPerformerPickerProps = {
  performers: Performer[];
  selected: RelatedPerformerReference[];
  loadState: LoadState;
  onChange: (nextSelected: RelatedPerformerReference[]) => void;
};

function RelatedPerformerPicker({
  performers,
  selected,
  loadState,
  onChange,
}: RelatedPerformerPickerProps) {
  const [query, setQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showAllSelected, setShowAllSelected] = useState(false);
  const selectedIds = new Set(
    selected.map((relation) => relation.performerId).filter(Boolean),
  );
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
  const normalizedQuery = query.trim().toLowerCase();
  const availablePerformers = performers
    .filter((performer) => !selectedIds.has(performer.id))
    .filter(
      (performer) =>
        !selectedNames.has(performerBaseName(performer).trim().toLowerCase()),
    )
    .filter((performer) => {
      if (!normalizedQuery) {
        return true;
      }

      return performerSearchText(performer).includes(normalizedQuery);
    });
  const visibleSelected = showAllSelected ? selected : selected.slice(0, 3);
  const hiddenSelectedCount = Math.max(selected.length - visibleSelected.length, 0);
  const shouldShowResults = isSearchOpen && query.trim().length > 0;

  useEffect(() => {
    if (selected.length <= 3) {
      setShowAllSelected(false);
    }
  }, [selected.length]);

  function addPerformer(performer: Performer) {
    const nameSnapshot = performerBaseName(performer);
    onChange([
      ...selected,
      {
        performerId: performer.id,
        nameSnapshot,
      },
    ]);
    setIsSearchOpen(query.trim().length > 0);
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

  return (
    <div
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
          onFocus={() => {
            if (query.trim()) {
              setIsSearchOpen(true);
            }
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsSearchOpen(event.target.value.trim().length > 0);
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
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
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
            {availablePerformers.map((performer) => {
              const name = performerBaseName(performer);
              const meta = performerMeta(performer);

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
                    {name}
                  </span>
                  <span className="min-w-0 truncate whitespace-nowrap text-right text-sm font-medium text-slate-500">
                    {meta}
                  </span>
                  <span className="flex size-8 items-center justify-center justify-self-end rounded-full text-sakura-500 transition-colors group-hover:bg-sakura-100">
                    <Plus size={14} />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected.length === 0 ? (
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
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-sakura-200 hover:bg-sakura-50 hover:text-sakura-600"
              onClick={() => setShowAllSelected(true)}
            >
              +{hiddenSelectedCount} more
            </button>
          )}
          {showAllSelected && selected.length > 3 && (
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500 transition-colors hover:border-sakura-200 hover:bg-sakura-50 hover:text-sakura-600"
              onClick={() => setShowAllSelected(false)}
            >
              Show less
            </button>
          )}
        </div>
      )}

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

function performerBaseName(performer: Performer) {
  return performer.name || performer.originalName || "Unnamed Performer";
}

function performerMeta(performer: Performer) {
  return [
    performer.nationality.trim(),
    performerActiveRange(performer),
    ratingLabel(performer.ratingJson),
  ]
    .filter(Boolean)
    .join(" · ");
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
    return `${debut}-Present`;
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
    return `Rating ${average.toFixed(1)}`;
  } catch {
    return "";
  }
}

export default RelatedPerformerPicker;
