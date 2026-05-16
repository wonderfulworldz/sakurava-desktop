import { Clapperboard, ImageIcon, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { RelatedCatalogRecordReference } from "../backend/json";
import type { Image, Video } from "../backend/types";

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

      return [record.title, record.originalTitle]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  const copy = pickerCopy(targetKind);
  const Icon = targetKind === "images" ? ImageIcon : Clapperboard;

  function addRecord(record: RelatedCatalogRecord) {
    onChange([
      ...selected,
      {
        recordId: record.id,
        titleSnapshot: recordDisplayTitle(record),
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
    <div className="grid gap-4">
      <div className="grid gap-2">
        <p className="text-sm font-medium text-slate-500">{copy.helper}</p>
        <div className="flex flex-wrap gap-2">
          <Link
            to={copy.collectionPath}
            className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-sakura-200 hover:text-sakura-600"
          >
            {copy.openLabel}
          </Link>
          <Link
            to={copy.createPath}
            className="inline-flex h-8 items-center rounded-md border border-sakura-200 bg-sakura-50 px-3 text-xs font-semibold text-sakura-600 transition hover:bg-sakura-100"
          >
            {copy.addLabel}
          </Link>
        </div>
      </div>

      <div className="grid gap-2">
        <h3 className="text-sm font-semibold text-slate-700">
          {copy.selectedHeading}
        </h3>
        <div className="flex min-h-12 flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2">
          {selected.length === 0 ? (
            <span className="px-1 text-sm font-medium text-slate-400">
              {copy.emptySelected}
            </span>
          ) : (
            selected.map((relation) => {
              const record = relation.recordId
                ? recordById.get(relation.recordId)
                : undefined;
              const title = record
                ? recordDisplayTitle(record)
                : relation.titleSnapshot || copy.unresolvedLabel;
              const unresolved = !record;

              return (
                <span
                  key={relation.recordId || relation.titleSnapshot}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${
                    unresolved
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-sakura-100 bg-sakura-50 text-sakura-600"
                  }`}
                >
                  <Icon size={13} />
                  {title}
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
                    aria-label={`${copy.removeLabel} ${title}`}
                    onClick={() => removeRelation(relation)}
                  >
                    <X size={13} />
                  </button>
                </span>
              );
            })
          )}
        </div>
      </div>

      <label className="grid gap-2 text-sm font-semibold text-slate-700">
        {copy.searchLabel}
        <span className="relative">
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
        </span>
      </label>

      <div className="grid gap-2">
        <h3 className="text-sm font-semibold text-slate-700">
          {copy.availableHeading}
        </h3>
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
          <div className="grid gap-2 sm:grid-cols-2">
            {availableRecords.map((record) => {
              const title = recordDisplayTitle(record);
              const originalTitle =
                record.originalTitle && record.originalTitle !== title
                  ? record.originalTitle
                  : "";
              const alreadySelectedByTitle = selectedTitles.has(
                title.trim().toLowerCase(),
              );

              return (
                <button
                  key={record.id}
                  type="button"
                  disabled={alreadySelectedByTitle}
                  className="grid gap-1 rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-sakura-200 hover:bg-sakura-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  aria-label={`${copy.addRelationLabel} ${title}`}
                  onClick={() => addRecord(record)}
                >
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Icon size={15} />
                    {title}
                  </span>
                  {originalTitle && (
                    <span className="text-xs font-medium text-slate-500">
                      {originalTitle}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function pickerCopy(targetKind: TargetKind) {
  if (targetKind === "images") {
    return {
      helper: "Select existing Image records only. Create Image records first.",
      collectionPath: "/images",
      createPath: "/images/new",
      openLabel: "Open Images",
      addLabel: "Add Image",
      selectedHeading: "Selected Images",
      emptySelected: "No related Images selected.",
      unresolvedLabel: "Unresolved Image",
      removeLabel: "Remove related image",
      searchLabel: "Search Images",
      searchAriaLabel: "Search related images",
      searchPlaceholder: "Search by image title...",
      availableHeading: "Available Images",
      loadingText: "Loading Images...",
      errorText:
        "Image records could not be loaded. Saving without related Images remains allowed.",
      emptyAvailable: "No Image records available. Create Image records first.",
      noMatches: "No matching Images available.",
      addRelationLabel: "Add related image",
    };
  }

  return {
    helper: "Select existing Video records only. Create Video records first.",
    collectionPath: "/videos",
    createPath: "/videos/new",
    openLabel: "Open Videos",
    addLabel: "Add Video",
    selectedHeading: "Selected Videos",
    emptySelected: "No related Videos selected.",
    unresolvedLabel: "Unresolved Video",
    removeLabel: "Remove related video",
    searchLabel: "Search Videos",
    searchAriaLabel: "Search related videos",
    searchPlaceholder: "Search by video title...",
    availableHeading: "Available Videos",
    loadingText: "Loading Videos...",
    errorText:
      "Video records could not be loaded. Saving without related Videos remains allowed.",
    emptyAvailable: "No Video records available. Create Video records first.",
    noMatches: "No matching Videos available.",
    addRelationLabel: "Add related video",
  };
}

function recordDisplayTitle(record: RelatedCatalogRecord) {
  return record.title || record.originalTitle || "Untitled Record";
}

export default RelatedCatalogPicker;
