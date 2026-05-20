import { RotateCcw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useLanguage } from "../lib/LanguageContext";
import {
  getAllTranslationKeys,
  getBuiltInText,
  getKeyDescription,
  supportedLanguages,
  type LanguageCode,
} from "../lib/language";
import {
  getOverridesForLanguage,
  resetAllOverridesForLanguage,
  resetOverrideForLanguage,
  setOverrideForLanguage,
} from "../lib/languageOverrides";

type RowStatus = "Built-in" | "Custom" | "Missing" | "Fallback";

type EditorRow = {
  key: string;
  builtInText: string | undefined;
  customText: string;
  description: string;
  status: RowStatus;
};

function buildEditorRows(
  languageCode: LanguageCode,
  overrides: Record<string, string>,
): EditorRow[] {
  const keys = getAllTranslationKeys();

  return keys.map((key) => {
    const builtInText = getBuiltInText(languageCode, key);
    const customText = overrides[key] ?? "";
    const status = resolveStatus(languageCode, key, builtInText, customText);
    const description = getKeyDescription(key);

    return { key, builtInText, customText, description, status };
  });
}

function resolveStatus(
  languageCode: LanguageCode,
  key: string,
  builtInText: string | undefined,
  customText: string,
): RowStatus {
  if (customText) {
    return "Custom";
  }

  if (builtInText !== undefined) {
    return "Built-in";
  }

  const englishText = getBuiltInText("en", key);
  if (englishText !== undefined) {
    return languageCode === "en" ? "Built-in" : "Fallback";
  }

  return "Missing";
}

type LanguageEditorProps = {
  onClose: () => void;
};

export function LanguageEditor({ onClose }: LanguageEditorProps) {
  const { languageCode, refreshOverrides } = useLanguage();
  const [overrides, setOverridesState] = useState<Record<string, string>>(() =>
    getOverridesForLanguage(languageCode),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const rows = useMemo(
    () => buildEditorRows(languageCode, overrides),
    [languageCode, overrides],
  );

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return rows;
    }
    return rows.filter(
      (row) =>
        row.key.toLowerCase().includes(query) ||
        (row.builtInText ?? "").toLowerCase().includes(query) ||
        row.customText.toLowerCase().includes(query) ||
        row.description.toLowerCase().includes(query),
    );
  }, [rows, searchQuery]);

  const overrideCount = Object.keys(overrides).length;
  const fallbackCount = rows.filter((row) => row.status === "Fallback" || row.status === "Missing").length;
  const languageLabel = supportedLanguages.find((l) => l.code === languageCode)?.label ?? languageCode;

  function handleStartEdit(row: EditorRow) {
    setEditingKey(row.key);
    setEditingValue(row.customText || row.builtInText || "");
  }

  function handleSaveEdit(key: string) {
    const builtInText = getBuiltInText(languageCode, key) ?? "";
    const trimmedValue = editingValue.trim();

    if (trimmedValue === builtInText) {
      resetOverrideForLanguage(languageCode, key);
    } else if (trimmedValue === "") {
      resetOverrideForLanguage(languageCode, key);
    } else {
      setOverrideForLanguage(languageCode, key, trimmedValue);
    }

    setOverridesState(getOverridesForLanguage(languageCode));
    refreshOverrides();
    setEditingKey(null);
    setEditingValue("");
  }

  function handleCancelEdit() {
    setEditingKey(null);
    setEditingValue("");
  }

  function handleResetRow(key: string) {
    resetOverrideForLanguage(languageCode, key);
    setOverridesState(getOverridesForLanguage(languageCode));
    refreshOverrides();
  }

  function handleResetAll() {
    resetAllOverridesForLanguage(languageCode);
    setOverridesState({});
    refreshOverrides();
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Language Editor
          </h3>
          <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            Editing: {languageLabel}
          </p>
          <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            Edits are saved as local overrides. Built-in translations are not modified.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Language Editor"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
        >
          <X size={18} />
        </button>
      </div>

      {/* Search + Reset All */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={16}
          />
          <input
            className="h-9 w-full min-w-[180px] rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500"
            placeholder="Search keys or text..."
            aria-label="Search translation keys"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
        {overrideCount > 0 && (
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-400"
            onClick={handleResetAll}
            aria-label="Reset all overrides"
          >
            <RotateCcw size={14} />
            Reset All ({overrideCount})
          </button>
        )}
      </div>

      {/* Summary */}
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
        {filteredRows.length} key{filteredRows.length === 1 ? "" : "s"}
        {searchQuery.trim() ? " matching" : ""}
        {" · "}{overrideCount} custom override{overrideCount === 1 ? "" : "s"}
        {fallbackCount > 0 && ` · ${fallbackCount} fallback/missing`}
      </p>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-600">
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full table-fixed divide-y divide-slate-200 text-left text-sm dark:divide-slate-600">
            <thead className="sticky top-0 z-10 bg-slate-100 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              <tr>
                <th className="w-[28%] truncate px-3 py-2">Key</th>
                <th className="w-[36%] truncate px-3 py-2">Text</th>
                <th className="w-[16%] truncate px-3 py-2">Description</th>
                <th className="w-[10%] truncate px-3 py-2">Status</th>
                <th className="w-[10%] truncate px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
              {filteredRows.map((row) => (
                <EditorTableRow
                  key={row.key}
                  row={row}
                  isEditing={editingKey === row.key}
                  editingValue={editingValue}
                  onStartEdit={() => handleStartEdit(row)}
                  onEditingValueChange={setEditingValue}
                  onSave={() => handleSaveEdit(row.key)}
                  onCancel={handleCancelEdit}
                  onReset={() => handleResetRow(row.key)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EditorTableRow({
  row,
  isEditing,
  editingValue,
  onStartEdit,
  onEditingValueChange,
  onSave,
  onCancel,
  onReset,
}: {
  row: EditorRow;
  isEditing: boolean;
  editingValue: string;
  onStartEdit: () => void;
  onEditingValueChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  return (
    <tr className="transition hover:bg-sakura-50/40 dark:hover:bg-slate-700/40">
      <td className="truncate px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-300" title={row.key}>
        {row.key}
      </td>
      <td className="px-3 py-2">
        {isEditing ? (
          <div className="flex items-center gap-1.5">
            <input
              className="h-7 w-full min-w-0 rounded border border-sakura-300 bg-white px-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-sakura-100 dark:border-sakura-600 dark:bg-slate-700 dark:text-slate-200"
              value={editingValue}
              onChange={(event) => onEditingValueChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onSave();
                } else if (event.key === "Escape") {
                  onCancel();
                }
              }}
              autoFocus
              aria-label={`Edit text for ${row.key}`}
            />
            <button
              type="button"
              className="shrink-0 rounded bg-sakura-500 px-2 py-1 text-xs font-semibold text-white hover:bg-sakura-600"
              onClick={onSave}
            >
              Save
            </button>
            <button
              type="button"
              className="shrink-0 rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:border-slate-600"
              onClick={onCancel}
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="block w-full truncate text-left text-xs text-slate-700 hover:text-sakura-600 dark:text-slate-300"
            onClick={onStartEdit}
            title={row.customText || row.builtInText || row.key}
            aria-label={`Edit text for ${row.key}`}
          >
            {row.customText || row.builtInText || row.key}
          </button>
        )}
      </td>
      <td className="truncate px-3 py-2 text-xs text-slate-500 dark:text-slate-400" title={row.description}>
        {row.description}
      </td>
      <td className="px-3 py-2">
        <StatusBadge status={row.status} />
      </td>
      <td className="px-3 py-2">
        {row.status === "Custom" && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700"
            onClick={onReset}
            aria-label={`Reset override for ${row.key}`}
          >
            <RotateCcw size={11} />
            Reset
          </button>
        )}
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: RowStatus }) {
  const styles: Record<RowStatus, string> = {
    "Built-in": "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
    Custom: "bg-sakura-50 text-sakura-700 dark:bg-sakura-950 dark:text-sakura-400",
    Missing: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    Fallback: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  };

  return (
    <span
      className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${styles[status]}`}
    >
      {status}
    </span>
  );
}
