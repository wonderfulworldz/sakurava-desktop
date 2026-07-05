import { parseTextLabelArray } from "../backend/json";
import type { Image, Performer, Video } from "../backend/types";

export type RelatedCatalogRecord = Video | Image;
export type PickerSearchFields = {
  id?: string;
  primary: string;
  secondary?: string[];
};
export type PickerHighlightPart = {
  text: string;
  highlighted: boolean;
};

const pickerTokenPattern = /[\p{L}\p{N}]+/gu;

export function compactPerformerLabel(performer: Performer): string {
  const name = performer.name || performer.originalName || "Unnamed Performer";
  const aliases = parseTextLabelArray(performer.aliasesJson)
    .map((alias) => alias.trim())
    .filter(Boolean);

  if (aliases.length === 0) {
    return name;
  }

  if (aliases.length === 1) {
    return `${name} - ${aliases[0]}`;
  }

  return `${name} - ${aliases[0]}, +${aliases.length - 1} more`;
}

export function performerSearchText(performer: Performer): string {
  return [
    performer.name,
    performer.originalName,
    ...parseTextLabelArray(performer.aliasesJson),
  ]
    .join(" ")
    .toLowerCase();
}

export function normalizePickerSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

export function rankPickerSearchResults<TItem>(
  items: TItem[],
  query: string,
  getFields: (item: TItem) => PickerSearchFields,
  limit = Number.POSITIVE_INFINITY,
) {
  const normalizedQuery = normalizePickerSearchText(query);
  if (!normalizedQuery) {
    return items
      .map((item, index) => {
        const fields = getFields(item);
        return {
          item,
          index,
          primarySort: normalizePickerSearchText(fields.primary),
          fallbackSort: normalizePickerSearchText(
            [fields.id, fields.primary, ...(fields.secondary ?? [])]
              .filter(Boolean)
              .join(" "),
          ),
        };
      })
      .sort((a, b) => {
        const primaryComparison = a.primarySort.localeCompare(b.primarySort);
        if (primaryComparison !== 0) {
          return primaryComparison;
        }

        const fallbackComparison = a.fallbackSort.localeCompare(b.fallbackSort);
        if (fallbackComparison !== 0) {
          return fallbackComparison;
        }

        return a.index - b.index;
      })
      .slice(0, limit)
      .map((entry) => entry.item);
  }

  const rankedItems = items
    .map((item, index) => {
      const fields = getFields(item);
      const primary = normalizePickerSearchText(fields.primary);
      const secondary = (fields.secondary ?? []).map(normalizePickerSearchText);
      const tier = pickerSearchTier(normalizedQuery, primary, secondary);

      return {
        item,
        index,
        tier,
        primarySort: primary,
        fallbackSort: normalizePickerSearchText(
          [fields.id, fields.primary, ...(fields.secondary ?? [])]
            .filter(Boolean)
            .join(" "),
        ),
      };
    })
    .filter((entry) => entry.tier !== null)
    .sort((a, b) => {
      if (a.tier !== b.tier) {
        return (a.tier ?? 99) - (b.tier ?? 99);
      }

      const primaryComparison = a.primarySort.localeCompare(b.primarySort);
      if (primaryComparison !== 0) {
        return primaryComparison;
      }

      const fallbackComparison = a.fallbackSort.localeCompare(b.fallbackSort);
      if (fallbackComparison !== 0) {
        return fallbackComparison;
      }

      return a.index - b.index;
    });

  return rankedItems.slice(0, limit).map((entry) => entry.item);
}

export function splitPickerHighlight(
  value: string,
  query: string,
): PickerHighlightPart[] {
  const normalizedQuery = normalizePickerSearchText(query);
  if (!normalizedQuery) {
    return [{ text: value, highlighted: false }];
  }

  const normalizedValue = normalizePickerSearchText(value);
  const startIndex = normalizedValue.indexOf(normalizedQuery);
  if (startIndex < 0) {
    return [{ text: value, highlighted: false }];
  }

  return [
    { text: value.slice(0, startIndex), highlighted: false },
    {
      text: value.slice(startIndex, startIndex + normalizedQuery.length),
      highlighted: true,
    },
    { text: value.slice(startIndex + normalizedQuery.length), highlighted: false },
  ].filter((part) => part.text.length > 0);
}

function pickerSearchTier(
  normalizedQuery: string,
  primary: string,
  secondary: string[],
) {
  if (!normalizedQuery) {
    return null;
  }

  if (normalizedQuery.length === 1) {
    const primaryTokens = pickerTokens(primary);
    if (primaryTokens[0]?.startsWith(normalizedQuery)) {
      return 1;
    }
    if (primaryTokens.slice(1).some((token) => token.startsWith(normalizedQuery))) {
      return 2;
    }
    if (
      secondary.some((field) =>
        pickerTokens(field).some((token) => token.startsWith(normalizedQuery)),
      )
    ) {
      return 3;
    }

    return null;
  }

  if (primary === normalizedQuery) {
    return 1;
  }
  if (primary.startsWith(normalizedQuery)) {
    return 2;
  }
  if (pickerTokens(primary).some((token) => token.startsWith(normalizedQuery))) {
    return 3;
  }
  if (
    secondary.some(
      (field) => field === normalizedQuery || field.startsWith(normalizedQuery),
    )
  ) {
    return 4;
  }
  if (primary.includes(normalizedQuery)) {
    return 5;
  }
  if (secondary.some((field) => field.includes(normalizedQuery))) {
    return 6;
  }

  return null;
}

function pickerTokens(value: string) {
  return value.match(pickerTokenPattern) ?? [];
}

export function catalogRecordLabel(record: RelatedCatalogRecord): string {
  const title = record.title || record.originalTitle || "Untitled Record";
  const code = record.code.trim();

  return code ? `${code} - ${title}` : title;
}

export function catalogRecordChipLabel(record: RelatedCatalogRecord): string {
  const title = record.title || record.originalTitle || "Untitled Record";
  const code = record.code.trim();

  if (!code) {
    return title;
  }

  return code.length <= title.length ? code : title;
}

export function catalogRecordSearchText(record: RelatedCatalogRecord): string {
  return [record.code, record.title, record.originalTitle].join(" ").toLowerCase();
}
