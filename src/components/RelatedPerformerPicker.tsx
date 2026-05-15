import { Search, UserRound, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { RelatedPerformerReference } from "../backend/json";
import type { Performer } from "../backend/types";

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
    .filter((performer) => {
      if (!normalizedQuery) {
        return true;
      }

      return [performer.name, performer.originalName]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    });

  function addPerformer(performer: Performer) {
    const nameSnapshot = performerDisplayName(performer);
    onChange([
      ...selected,
      {
        performerId: performer.id,
        nameSnapshot,
      },
    ]);
    setQuery("");
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
    <div className="grid gap-4">
      <div className="grid gap-2">
        <p className="text-sm font-medium text-slate-500">
          Select existing Performer records only. Create Performer records first.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/performers"
            className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-sakura-200 hover:text-sakura-600"
          >
            Open Performers
          </Link>
          <Link
            to="/performers/new"
            className="inline-flex h-8 items-center rounded-md border border-sakura-200 bg-sakura-50 px-3 text-xs font-semibold text-sakura-600 transition hover:bg-sakura-100"
          >
            Add Performer
          </Link>
        </div>
      </div>

      <div className="grid gap-2">
        <h3 className="text-sm font-semibold text-slate-700">
          Selected Performers
        </h3>
        <div className="flex min-h-12 flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2">
          {selected.length === 0 ? (
            <span className="px-1 text-sm font-medium text-slate-400">
              No related Performers selected.
            </span>
          ) : (
            selected.map((relation) => {
              const performer = relation.performerId
                ? performerById.get(relation.performerId)
                : undefined;
              const name = performer
                ? performerDisplayName(performer)
                : relation.nameSnapshot || "Unresolved Performer";
              const unresolved = !performer;

              return (
                <span
                  key={relation.performerId || relation.nameSnapshot}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${
                    unresolved
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-sakura-100 bg-sakura-50 text-sakura-600"
                  }`}
                >
                  <UserRound size={13} />
                  {name}
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
                  </button>
                </span>
              );
            })
          )}
        </div>
      </div>

      <label className="grid gap-2 text-sm font-semibold text-slate-700">
        Search Performers
        <span className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={16}
          />
          <input
            className="h-9 w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-normal text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
            aria-label="Search related performers"
            placeholder="Search by performer name..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </span>
      </label>

      <div className="grid gap-2">
        <h3 className="text-sm font-semibold text-slate-700">
          Available Performers
        </h3>
        {loadState === "loading" && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-500">
            Loading Performers...
          </p>
        )}
        {loadState === "error" && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
            Performer records could not be loaded. Saving without related Performers remains allowed.
          </p>
        )}
        {loadState !== "loading" && performers.length === 0 && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-500">
            No Performer records available. Create Performer records first.
          </p>
        )}
        {loadState !== "loading" &&
          performers.length > 0 &&
          availablePerformers.length === 0 && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-500">
              No matching Performers available.
            </p>
          )}
        {availablePerformers.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {availablePerformers.map((performer) => {
              const name = performerDisplayName(performer);
              const originalName =
                performer.originalName && performer.originalName !== name
                  ? performer.originalName
                  : "";
              const alreadySelectedByName = selectedNames.has(
                name.trim().toLowerCase(),
              );

              return (
                <button
                  key={performer.id}
                  type="button"
                  disabled={alreadySelectedByName}
                  className="grid gap-1 rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-sakura-200 hover:bg-sakura-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  aria-label={`Add related performer ${name}`}
                  onClick={() => addPerformer(performer)}
                >
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <UserRound size={15} />
                    {name}
                  </span>
                  {originalName && (
                    <span className="text-xs font-medium text-slate-500">
                      {originalName}
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

function performerDisplayName(performer: Performer) {
  return performer.name || performer.originalName || "Unnamed Performer";
}

export default RelatedPerformerPicker;
