import { parseTextLabelArray } from "../backend/json";
import type { Image, Performer, Video } from "../backend/types";

export type RelatedCatalogRecord = Video | Image;

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
