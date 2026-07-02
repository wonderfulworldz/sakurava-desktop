import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Performer } from "../backend/types";
import type { RelatedPerformerFormValue } from "../lib/formData";
import {
  emptyCreditFormValue,
  creditGroupOrderAtIndex,
  insertCreditIntoPerformerGroup,
  moveCreditGroupToOrder,
  normalizeCreditOrders,
  type CreditFormValue,
} from "../lib/workCredits";
import RelatedPerformerPicker from "./RelatedPerformerPicker";
import MemorySuggestionInput from "./MemorySuggestionInput";

type Props = {
  credits: CreditFormValue[];
  performers: Performer[];
  loadState: "idle" | "loading" | "loaded" | "error";
  onChange: (credits: CreditFormValue[]) => void;
  creditTypeHistory: string[];
  onRemoveCreditTypeHistory: (suggestion: string) => void;
};

function CompactRelatedPerformersEditor({
  credits,
  performers,
  loadState,
  onChange,
  creditTypeHistory,
  onRemoveCreditTypeHistory,
}: Props) {
  const [orderDrafts, setOrderDrafts] = useState<Record<string, string>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const pendingScrollPerformerId = useRef<string | null>(null);
  const performerById = new Map(
    performers.map((performer) => [performer.id, performer]),
  );
  const pickerSelection = credits.reduce<RelatedPerformerFormValue[]>(
    (selected, credit) => {
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
    const selectedCounts = countRelations(selected);
    const currentCounts = countCredits(credits);
    const additions = selected.flatMap((relation) => {
      if (!relation.performerId) {
        return [];
      }
      const remaining =
        (selectedCounts.get(relation.performerId) ?? 0) -
        (currentCounts.get(relation.performerId) ?? 0);
      if (remaining <= 0) {
        return [];
      }
      currentCounts.set(
        relation.performerId,
        (currentCounts.get(relation.performerId) ?? 0) + 1,
      );
      return [{
        ...emptyCreditFormValue(relation.performerId),
        performerNameSnapshot: relation.nameSnapshot,
      }];
    });
    if (additions.length === 0) {
      return;
    }
    pendingScrollPerformerId.current =
      additions[additions.length - 1]?.performerId ?? null;
    onChange(
      additions.reduce(
        (nextCredits, addition) =>
          insertCreditIntoPerformerGroup(nextCredits, addition),
        [...credits],
      ),
    );
  }

  useEffect(() => {
    const performerId = pendingScrollPerformerId.current;
    const list = listRef.current;
    if (!performerId || !list) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const rows = Array.from(
        list.querySelectorAll<HTMLElement>("[data-performer-id]"),
      ).filter((row) => row.dataset.performerId === performerId);
      const row = rows[rows.length - 1];
      if (row) {
        list.scrollTo?.({
          top: Math.max(0, row.offsetTop + row.offsetHeight - list.clientHeight),
          behavior: "smooth",
        });
        row.querySelector<HTMLInputElement>('[data-role-name-input]')?.focus();
      }
      pendingScrollPerformerId.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [credits.length]);

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
        showSelectedSummary={false}
        maxOccurrencesPerPerformer={5}
      />

      {credits.length === 0 ? (
        <p className="text-sm text-slate-500">No related performers selected.</p>
      ) : (
        <div
          className="max-h-80 space-y-2 overflow-y-auto pr-1"
          data-testid="related-performer-credit-list"
          ref={listRef}
        >
          {credits.map((credit, index) => {
            const rowKey = credit.id ?? `new-credit-${index}`;
            const performer = performerById.get(credit.performerId);
            const performerName =
              performer?.name ||
              performer?.originalName ||
              credit.performerNameSnapshot ||
              "Unresolved Performer";
            const role =
              credit.characterMode === "self" ? "Self" : credit.characterName;
            const visibleCreditType =
              credit.creditTypeCategoryId || credit.roleImportanceCategoryId;
            const isAdditionalRole = Boolean(
              credit.performerId &&
                credits
                  .slice(0, index)
                  .some((item) => item.performerId === credit.performerId),
            );
            const groupOrder = creditGroupOrderAtIndex(credits, index);

            return (
              <div
                key={rowKey}
                className="grid items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-[minmax(140px,1fr)_5rem_minmax(160px,1fr)_minmax(160px,1fr)_auto]"
                data-testid="credit-editor-row"
                data-performer-id={credit.performerId}
              >
                <div className="min-w-0 self-center">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {performerName}
                  </p>
                  {isAdditionalRole && (
                    <p className="text-[11px] font-medium text-slate-400">
                      Additional role
                    </p>
                  )}
                </div>

                <CompactField label="Order">
                  <input
                    type="number"
                    step="1"
                    aria-label={`Related performer ${index + 1} order`}
                    min="1"
                    max={new Set(credits.map((item) => item.performerId)).size}
                    value={orderDrafts[rowKey] ?? String(groupOrder)}
                    onChange={(event) =>
                      setOrderDrafts((current) => ({
                        ...current,
                        [rowKey]: event.target.value,
                      }))
                    }
                    onBlur={() => {
                      onChange(
                        moveCreditGroupToOrder(
                          credits,
                          index,
                          orderDrafts[rowKey] ?? String(groupOrder),
                        ),
                      );
                      setOrderDrafts((current) => {
                        const next = { ...current };
                        delete next[rowKey];
                        return next;
                      });
                    }}
                    className={inputClassName}
                  />
                </CompactField>

                <CompactField label="Role Name">
                  <input
                    aria-label={`Related performer ${index + 1} role name`}
                    data-role-name-input
                    value={role}
                    onChange={(event) => {
                      const nextRole = event.target.value;
                      const isSelf = nextRole.trim().toLowerCase() === "self";
                      update(index, {
                        characterMode: isSelf ? "self" : "text",
                        characterName: isSelf ? "" : nextRole,
                      });
                    }}
                    placeholder="Character or role name"
                    className={inputClassName}
                  />
                </CompactField>

                <CompactField label="Credit Type">
                  <CreditTypeSuggestionInput
                    aria-label={`Related performer ${index + 1} credit type`}
                    value={visibleCreditType}
                    onChange={(value) =>
                      update(index, { creditTypeCategoryId: value })
                    }
                    history={creditTypeHistory}
                    onRemoveHistory={onRemoveCreditTypeHistory}
                  />
                </CompactField>

                <button
                  type="button"
                  aria-label={`Remove ${performerName}`}
                  onClick={() =>
                    onChange(
                      normalizeCreditOrders(
                        credits.filter((_, creditIndex) => creditIndex !== index),
                      ),
                    )
                  }
                  className="inline-flex size-9 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CompactField({
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

const inputClassName =
  "h-9 w-full select-text rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-700 outline-none transition focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100";

function CreditTypeSuggestionInput({
  value,
  onChange,
  history,
  onRemoveHistory,
  ...inputProps
}: {
  value: string;
  onChange: (value: string) => void;
  history: string[];
  onRemoveHistory: (suggestion: string) => void;
  "aria-label": string;
}) {
  const normalizedValue = value.trim().toLowerCase();
  const suggestions = uniqueSuggestions(history).filter(
    (suggestion) => suggestion.toLowerCase() !== normalizedValue,
  );

  return (
      <MemorySuggestionInput
        ariaLabel={inputProps["aria-label"]}
        suggestionAriaLabel="Credit Type suggestions"
        value={value}
        suggestions={suggestions}
        onChange={onChange}
        onRemoveSuggestion={onRemoveHistory}
        className={inputClassName}
      />
  );
}

function uniqueSuggestions(values: string[]) {
  return values.filter(
    (value, index) =>
      values.findIndex(
        (candidate) => candidate.toLowerCase() === value.toLowerCase(),
      ) === index,
  );
}

function countRelations(relations: RelatedPerformerFormValue[]) {
  return relations.reduce((counts, relation) => {
    if (relation.performerId) {
      counts.set(
        relation.performerId,
        (counts.get(relation.performerId) ?? 0) + 1,
      );
    }
    return counts;
  }, new Map<string, number>());
}

function countCredits(credits: CreditFormValue[]) {
  return credits.reduce((counts, credit) => {
    if (credit.performerId) {
      counts.set(
        credit.performerId,
        (counts.get(credit.performerId) ?? 0) + 1,
      );
    }
    return counts;
  }, new Map<string, number>());
}

export default CompactRelatedPerformersEditor;
