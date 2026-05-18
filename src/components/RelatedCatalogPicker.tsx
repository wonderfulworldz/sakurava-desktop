import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { RelatedCatalogRecordReference } from "../backend/json";
import type { Image, Video } from "../backend/types";
import {
  catalogRecordChipLabel,
  catalogRecordLabel,
  catalogRecordSearchText,
} from "../lib/relatedPicker";

type LoadState = "idle" | "loading" | "loaded" | "error";
type TargetKind = "videos" | "images";
type RelatedCatalogRecord = Video | Image;

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
  const normalizedQuery = query.trim().toLowerCase();
  const availableRecords = records
    .filter((record) => !selectedIds.has(record.id))
    .filter((record) => {
      if (!normalizedQuery) {
        return true;
      }

      return catalogRecordSearchText(record).includes(normalizedQuery);
    });
  const copy = pickerCopy(targetKind);

  function addRecord(record: RelatedCatalogRecord) {
    onChange([
      ...selected,
      {
        recordId: record.id,
        titleSnapshot: record.title || record.originalTitle || "Untitled Record",
      },
    ]);
    setQuery("");
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

  return (
    <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
          {selected.length === 0 ? (
            <span className="px-1 text-sm font-medium text-slate-400">
              {copy.emptySelected}
            </span>
          ) : (
            selected.map((relation) => {
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
                  className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${
                    unresolved
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-sakura-100 bg-sakura-50 text-sakura-600"
                  }`}
                >
                  <span className="truncate">{label}</span>
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
            })
          )}
      </div>

      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          size={16}
        />
        <input
          className="h-9 w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-normal text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
          aria-label={copy.searchAriaLabel}
          placeholder={copy.searchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="grid gap-2">
        {loadState === "loading" && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-500">
            {copy.loadingText}
          </p>
        )}
        {loadState === "error" && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
            {copy.errorText}
          </p>
        )}
        {loadState !== "loading" && records.length === 0 && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-500">
            {copy.emptyAvailable}
          </p>
        )}
        {loadState !== "loading" &&
          records.length > 0 &&
          availableRecords.length === 0 && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-500">
              {copy.noMatches}
            </p>
          )}
        {availableRecords.length > 0 && (
          <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-2">
            {availableRecords.map((record) => {
              const title = catalogRecordLabel(record);
              const baseTitle =
                record.title || record.originalTitle || "Untitled Record";
              const alreadySelectedByTitle = selectedTitles.has(
                baseTitle.trim().toLowerCase(),
              );

              return (
                <button
                  key={record.id}
                  type="button"
                  disabled={alreadySelectedByTitle}
                  className="flex min-h-9 w-full items-center border-b border-slate-200 px-2 py-1.5 text-left text-sm font-medium text-slate-800 last:border-b-0 hover:text-sakura-600 disabled:cursor-not-allowed disabled:text-slate-400"
                  aria-label={`${copy.addRelationLabel} ${baseTitle}`}
                  onClick={() => addRecord(record)}
                >
                  <span className="min-w-0 truncate">
                    {title}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-xs font-medium text-slate-500">
        Manage related records in {copy.managementName}.{" "}
        <Link
          to={copy.collectionPath}
          className="font-semibold text-sakura-600 hover:text-sakura-700"
        >
          {copy.openLabel}
        </Link>
      </p>
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
      emptySelected: "No related Images selected.",
      unresolvedLabel: "Unresolved Image",
      removeLabel: "Remove related image",
      searchAriaLabel: "Search related images",
      searchPlaceholder: "Search images...",
      loadingText: "Loading Images...",
      errorText:
        "Image records could not be loaded. Saving without related Images remains allowed.",
      emptyAvailable: "No Image records available. Create Image records first.",
      noMatches: "No matching Images available. Use Images to add it first.",
      addRelationLabel: "Add related image",
    };
  }

  return {
    helper: "Select existing Video records only. Create Video records first.",
    collectionPath: "/videos",
    managementName: "Videos",
    openLabel: "Open Videos",
    emptySelected: "No related Videos selected.",
    unresolvedLabel: "Unresolved Video",
    removeLabel: "Remove related video",
    searchAriaLabel: "Search related videos",
    searchPlaceholder: "Search videos...",
    loadingText: "Loading Videos...",
    errorText:
      "Video records could not be loaded. Saving without related Videos remains allowed.",
    emptyAvailable: "No Video records available. Create Video records first.",
    noMatches: "No matching Videos available. Use Videos to add it first.",
    addRelationLabel: "Add related video",
  };
}

export default RelatedCatalogPicker;
