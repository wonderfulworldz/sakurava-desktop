import { Plus, Trash2 } from "lucide-react";
import type { ManagedCategory, Performer } from "../backend/types";
import type { RelatedPerformerFormValue } from "../lib/formData";
import {
  emptyCreditFormValue,
  type CreditFormValue,
} from "../lib/workCredits";
import RelatedPerformerPicker from "./RelatedPerformerPicker";

type CreditEditorProps = {
  credits: CreditFormValue[];
  performers: Performer[];
  categories: ManagedCategory[];
  loadState: "idle" | "loading" | "loaded" | "error";
  onChange: (credits: CreditFormValue[]) => void;
};

function CreditEditor({
  credits,
  performers,
  categories,
  loadState,
  onChange,
}: CreditEditorProps) {
  const creditCategories = categories.filter((category) => category.showInCredits);
  const pickerSelection = credits.reduce<RelatedPerformerFormValue[]>(
    (selected, credit) => {
      if (
        credit.performerId &&
        selected.some((relation) => relation.performerId === credit.performerId)
      ) {
        return selected;
      }
      if (!credit.performerId && !credit.performerNameSnapshot) {
        return selected;
      }
      selected.push({
        performerId: credit.performerId,
        nameSnapshot: credit.performerNameSnapshot ?? "",
      });
      return selected;
    },
    [],
  );

  function applyPickerSelection(selected: RelatedPerformerFormValue[]) {
    const selectedIds = new Set(
      selected.map((relation) => relation.performerId).filter(Boolean),
    );
    const currentIds = new Set(
      credits.map((credit) => credit.performerId).filter(Boolean),
    );
    const retained = credits.filter(
      (credit) =>
        !credit.performerId || selectedIds.has(credit.performerId),
    );
    const additions = selected
      .filter(
        (relation) =>
          relation.performerId && !currentIds.has(relation.performerId),
      )
      .map((relation) => ({
        ...emptyCreditFormValue(relation.performerId, retained.length),
        performerNameSnapshot: relation.nameSnapshot,
      }));
    onChange([...retained, ...additions]);
  }

  function update(index: number, patch: Partial<CreditFormValue>) {
    onChange(
      credits.map((credit, creditIndex) =>
        creditIndex === index ? { ...credit, ...patch } : credit,
      ),
    );
  }

  return (
    <div className="space-y-3">
      <RelatedPerformerPicker
        performers={performers}
        selected={pickerSelection}
        loadState={loadState}
        onChange={applyPickerSelection}
      />
      <button
        type="button"
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-sakura-200 bg-sakura-50 px-3 text-xs font-bold text-sakura-600"
        onClick={() =>
          onChange([...credits, emptyCreditFormValue("", credits.length)])
        }
      >
        <Plus size={15} />
        Add Credit
      </button>

      {credits.length === 0 ? (
        <p className="text-sm text-slate-500">No credits added.</p>
      ) : (
        credits.map((credit, index) => (
          <div
            key={credit.id ?? `new-credit-${index}`}
            className="rounded-lg border border-slate-200 bg-slate-50 p-3"
            data-testid="credit-editor-row"
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <CreditField label="Performer">
                <select
                  aria-label={`Credit ${index + 1} performer`}
                  value={credit.performerId}
                  onChange={(event) =>
                    update(index, { performerId: event.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="">Select performer</option>
                  {!credit.performerId && credit.performerNameSnapshot && (
                    <option value="">
                      Unresolved: {credit.performerNameSnapshot}
                    </option>
                  )}
                  {performers.map((performer) => (
                    <option key={performer.id} value={performer.id}>
                      {performer.name || performer.originalName || "Unnamed Performer"}
                    </option>
                  ))}
                </select>
              </CreditField>

              <CreditField label="Character Mode">
                <select
                  aria-label={`Credit ${index + 1} character mode`}
                  value={credit.characterMode}
                  onChange={(event) =>
                    update(index, {
                      characterMode: event.target.value as "text" | "self",
                    })
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="text">Text</option>
                  <option value="self">Self</option>
                </select>
              </CreditField>

              <CreditField label="Character / Role">
                <input
                  aria-label={`Credit ${index + 1} character or role`}
                  value={credit.characterName}
                  disabled={credit.characterMode === "self"}
                  onChange={(event) =>
                    update(index, { characterName: event.target.value })
                  }
                  placeholder={credit.characterMode === "self" ? "Self" : "Character or role"}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100"
                />
              </CreditField>

              <CreditField label="Character Original Name">
                <input
                  aria-label={`Credit ${index + 1} character original name`}
                  value={credit.characterOriginalName}
                  disabled={credit.characterMode === "self"}
                  onChange={(event) =>
                    update(index, { characterOriginalName: event.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100"
                />
              </CreditField>

              <CreditField label="Credited As Mode">
                <select
                  aria-label={`Credit ${index + 1} credited as mode`}
                  value={credit.creditedAsMode}
                  onChange={(event) =>
                    update(index, {
                      creditedAsMode: event.target.value as "auto" | "custom",
                    })
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="auto">Auto</option>
                  <option value="custom">Custom</option>
                </select>
              </CreditField>

              <CreditField label="Credited As">
                <input
                  aria-label={`Credit ${index + 1} credited as`}
                  value={credit.creditedAs}
                  disabled={credit.creditedAsMode === "auto"}
                  onChange={(event) =>
                    update(index, { creditedAs: event.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100"
                />
              </CreditField>

              <CategorySelect
                label="Credit Type"
                ariaLabel={`Credit ${index + 1} credit type`}
                value={credit.creditTypeCategoryId}
                categories={creditCategories}
                onChange={(creditTypeCategoryId) =>
                  update(index, { creditTypeCategoryId })
                }
              />
              <CategorySelect
                label="Role Importance"
                ariaLabel={`Credit ${index + 1} role importance`}
                value={credit.roleImportanceCategoryId}
                categories={creditCategories}
                onChange={(roleImportanceCategoryId) =>
                  update(index, { roleImportanceCategoryId })
                }
              />

              <CreditField label="Billing Order">
                <input
                  type="number"
                  step="1"
                  aria-label={`Credit ${index + 1} billing order`}
                  value={credit.billingOrder}
                  onChange={(event) =>
                    update(index, { billingOrder: event.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                />
              </CreditField>

              <CreditField label="Note">
                <input
                  aria-label={`Credit ${index + 1} note`}
                  value={credit.note}
                  onChange={(event) => update(index, { note: event.target.value })}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                />
              </CreditField>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                aria-label={`Remove credit ${index + 1}`}
                onClick={() =>
                  onChange(credits.filter((_, creditIndex) => creditIndex !== index))
                }
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-600"
              >
                <Trash2 size={15} />
                Remove
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function CreditField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1 text-xs font-semibold text-slate-600">
      <span>{label}</span>
      {children}
    </label>
  );
}

function CategorySelect({
  label,
  ariaLabel,
  value,
  categories,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  categories: ManagedCategory[];
  onChange: (value: string) => void;
}) {
  return (
    <CreditField label={label}>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
      >
        <option value="">Not set</option>
        {categories.map((category) => (
          <option key={category.key} value={category.key}>
            {category.name}
          </option>
        ))}
      </select>
    </CreditField>
  );
}

export default CreditEditor;
