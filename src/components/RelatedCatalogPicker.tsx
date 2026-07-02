import { Search, X } from "lucide-react";
import { type UIEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { RelatedCatalogRecordReference } from "../backend/json";
import type { Image, Video } from "../backend/types";
import {
  catalogRecordChipLabel,
  rankPickerSearchResults,
  splitPickerHighlight,
} from "../lib/relatedPicker";

type LoadState = "idle" | "loading" | "loaded" | "error";
type TargetKind = "videos" | "images";
type RelatedCatalogRecord = Video | Image;

const RELATED_CHIP_STYLES =
  "inline-flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold";
const RELATED_CHIP_TEXT_STYLES = "min-w-0 truncate whitespace-nowrap";
const RELATED_ROW_GRID_STYLES =
  "group grid h-12 w-full grid-cols-[minmax(0,1fr)_max-content_2.25rem] items-center gap-4";
const PICKER_RENDER_BATCH_SIZE = 30;

type RelatedCatalogPickerProps = {
  records: RelatedCatalogRecord[];
  selected: RelatedCatalogRecordReference[];
  loadState: LoadState;
  targetKind: TargetKind;
  onChange: (nextSelected: RelatedCatalogRecordReference[]) => void;
};

function RelatedCatalogPicker({
  records,
  selected,
  loadState,
  targetKind,
  onChange,
}: RelatedCatalogPickerProps) {
  const [query, setQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showAllSelected, setShowAllSelected] = useState(false);
  const [visibleResultCount, setVisibleResultCount] = useState(
    PICKER_RENDER_BATCH_SIZE,
  );
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedIds = new Set(
    selected.map((relation) => relation.recordId).filter(Boolean),
  );
  const selectedTitles = new Set(
    selected
      .filter((relation) => !relation.recordId)
      .map((relation) => relation.titleSnapshot.trim().toLowerCase())
      .filter(Boolean),
  );
  const recordById = useMemo(
    () => new Map(records.map((record) => [record.id, record])),
    [records],
  );
  const availableRecords = rankPickerSearchResults(
    records
    .filter((record) => !selectedIds.has(record.id))
    .filter(
      (record) =>
        !selectedTitles.has(
          (record.title || record.originalTitle || "Untitled Record")
            .trim()
            .toLowerCase(),
        ),
    ),
    query,
    (record) => ({
      id: [record.id, record.code].filter(Boolean).join(" "),
      primary: catalogRecordPlainTitle(record),
      secondary: [record.originalTitle, record.code],
    }),
  );
  const copy = pickerCopy(targetKind);
  const visibleSelected = showAllSelected ? selected : selected.slice(0, 3);
  const hiddenSelectedCount = Math.max(selected.length - visibleSelected.length, 0);
  const shouldShowResults = isSearchOpen;
  const visibleRecords = availableRecords.slice(0, visibleResultCount);

  useEffect(() => {
    if (selected.length <= 3) {
      setShowAllSelected(false);
    }
  }, [selected.length]);

  useEffect(() => {
    setVisibleResultCount(PICKER_RENDER_BATCH_SIZE);
  }, [query, isSearchOpen, records.length]);

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

  function addRecord(record: RelatedCatalogRecord) {
    onChange([
      ...selected,
      {
        recordId: record.id,
        titleSnapshot: record.title || record.originalTitle || "Untitled Record",
      },
    ]);
    setIsSearchOpen(false);
  }

  function removeRelation(relation: RelatedCatalogRecordReference) {
    onChange(
      selected.filter((item) =>
        relation.recordId
          ? item.recordId !== relation.recordId
          : item.titleSnapshot.trim().toLowerCase() !==
            relation.titleSnapshot.trim().toLowerCase(),
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
      Math.min(current + PICKER_RENDER_BATCH_SIZE, availableRecords.length),
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
          aria-label={copy.searchAriaLabel}
          placeholder={copy.searchPlaceholder}
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
            aria-label={copy.clearSearchLabel}
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
                {copy.loadingText}
              </p>
            )}
            {loadState === "error" && (
              <p className="px-4 py-3 text-sm font-medium text-amber-700">
                {copy.errorText}
              </p>
            )}
            {loadState !== "loading" && records.length === 0 && (
              <p className="px-4 py-3 text-sm font-medium text-slate-500">
                {copy.emptyAvailable}
              </p>
            )}
            {loadState !== "loading" &&
              records.length > 0 &&
              availableRecords.length === 0 && (
                <p className="px-4 py-3 text-sm font-medium text-slate-500">
                  {copy.noMatches}
                </p>
              )}
            {visibleRecords.map((record) => {
              const title = catalogRecordPlainTitle(record);
              const meta = catalogRecordMeta(record);

              return (
                <button
                  key={record.id}
                  type="button"
                  className={`${RELATED_ROW_GRID_STYLES} overflow-hidden border-b border-slate-100 px-4 text-left text-sm transition-colors last:border-b-0 hover:bg-sakura-50 focus:bg-sakura-50 focus:outline-none`}
                  data-testid={`related-${targetKind === "videos" ? "video" : "image"}-result-row`}
                  aria-label={`${copy.addRelationLabel} ${title}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => addRecord(record)}
                >
                  <span className="min-w-0 truncate whitespace-nowrap font-bold text-slate-900">
                    <HighlightedPickerText text={title} query={query} />
                  </span>
                  <CatalogRecordMeta parts={meta} />
                  <span className="flex h-8 items-center justify-center justify-self-end rounded-md px-2 text-[11px] font-bold text-sakura-500 transition-colors group-hover:bg-sakura-100">
                    Add
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected.length === 0 ? (
        <p className="text-sm font-medium text-slate-500">
          {copy.emptySelected}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {visibleSelected.map((relation) => {
              const record = relation.recordId
                ? recordById.get(relation.recordId)
                : undefined;
              const label = record
                ? catalogRecordChipLabel(record)
                : relation.titleSnapshot || copy.unresolvedLabel;
              const unresolved = !record;

              return (
                <span
                  key={relation.recordId || relation.titleSnapshot}
                  className={`${RELATED_CHIP_STYLES} ${
                    unresolved
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-sakura-100 bg-sakura-50 text-sakura-600"
                  }`}
                >
                  <span className={RELATED_CHIP_TEXT_STYLES}>{label}</span>
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
                    aria-label={`${copy.removeLabel} ${label}`}
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
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-500">
          {selected.length > 0
            ? `${selected.length} ${selected.length === 1 ? copy.countSingular : copy.countPlural} selected`
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
            to={copy.collectionPath}
            className="font-semibold text-sakura-600 transition-colors hover:text-sakura-700"
          >
            {copy.openLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}

function pickerCopy(targetKind: TargetKind) {
  if (targetKind === "images") {
    return {
      helper: "Select existing Image records only. Create Image records first.",
      collectionPath: "/images",
      managementName: "Images",
      openLabel: "Open Images",
      emptySelected: "No related images selected.",
      unresolvedLabel: "Unresolved Image",
      removeLabel: "Remove related image",
      searchAriaLabel: "Search related images",
      searchPlaceholder: "Search image title, album, tag...",
      clearSearchLabel: "Clear related image search",
      loadingText: "Loading images...",
      errorText:
        "Image records could not be loaded. Saving without related images remains allowed.",
      emptyAvailable: "No image records available. Create image records first.",
      noMatches: "No matching images available. Use Images to add it first.",
      addRelationLabel: "Add related image",
      countSingular: "image",
      countPlural: "images",
    };
  }

  return {
    helper: "Select existing Video records only. Create Video records first.",
    collectionPath: "/videos",
    managementName: "Videos",
    openLabel: "Open Videos",
    emptySelected: "No related videos selected.",
    unresolvedLabel: "Unresolved Video",
    removeLabel: "Remove related video",
    searchAriaLabel: "Search related videos",
    searchPlaceholder: "Search video title, code, performer...",
    clearSearchLabel: "Clear related video search",
    loadingText: "Loading videos...",
    errorText:
      "Video records could not be loaded. Saving without related videos remains allowed.",
    emptyAvailable: "No video records available. Create video records first.",
    noMatches: "No matching videos available. Use Videos to add it first.",
    addRelationLabel: "Add related video",
    countSingular: "video",
    countPlural: "videos",
  };
}

function catalogRecordPlainTitle(record: RelatedCatalogRecord) {
  return record.title || record.originalTitle || "Untitled Record";
}

function catalogRecordMeta(record: RelatedCatalogRecord) {
  const year = record.releaseDate.trim() ? record.releaseDate.trim().slice(0, 4) : "";
  const rating = ratingLabel(record.ratingJson);

  return {
    context: [record.code.trim(), year].filter(Boolean),
    rating,
  };
}

function CatalogRecordMeta({ parts }: { parts: { context: string[]; rating: string } }) {
  if (parts.context.length === 0 && !parts.rating) {
    return <span aria-hidden="true" />;
  }

  return (
    <span className="flex shrink-0 items-center justify-end gap-1.5 whitespace-nowrap text-right text-sm font-medium text-slate-500">
      {parts.context.length > 0 && (
        <span className="shrink-0 whitespace-nowrap">{parts.context.join(" · ")}</span>
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

export default RelatedCatalogPicker;
