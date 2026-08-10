const sensitiveFieldNames = new Set(["censorship", "measurements", "cupSize"]);
const sensitiveLabels = new Set(["Censorship", "Measurement", "Measurements", "Cup Size"]);
const censorshipValues = new Set([
  "Censored",
  "Uncensored",
  "Reduced",
  "Reduced / Reduced Mosaic",
  "Leaked",
  "Unknown",
]);

export function isSafeFilterSensitiveField(fieldName: string) {
  return sensitiveFieldNames.has(fieldName);
}

export function isSafeFilterSensitiveLabel(label: string) {
  return sensitiveLabels.has(label);
}

export function isSafeFilterFieldVisible(fieldName: string, safeFilterEnabled: boolean) {
  return !safeFilterEnabled || !isSafeFilterSensitiveField(fieldName);
}

export function isSafeFilterLabelVisible(label: string, safeFilterEnabled: boolean) {
  return !safeFilterEnabled || !isSafeFilterSensitiveLabel(label);
}

export function filterSafeFilterFields<T extends { name: string }>(
  fields: readonly T[],
  safeFilterEnabled: boolean,
) {
  return fields.filter((field) => isSafeFilterFieldVisible(field.name, safeFilterEnabled));
}

export function filterSafeFilterLabels<T extends { label: string }>(
  items: readonly T[],
  safeFilterEnabled: boolean,
) {
  return items.filter((item) => isSafeFilterLabelVisible(item.label, safeFilterEnabled));
}

export function filterSafeFilterSortOptions(
  options: readonly string[],
  safeFilterEnabled: boolean,
) {
  return options.filter((option) => isSafeFilterLabelVisible(option, safeFilterEnabled));
}

export function filterSafeFilterCensorshipValues(
  values: readonly string[],
  safeFilterEnabled: boolean,
) {
  return safeFilterEnabled
    ? values.filter((value) => !censorshipValues.has(value))
    : [...values];
}
