import type { Credit } from "../backend/types";

const invalidRoleNames = new Set(["", "n/a", "unknown", "*"]);

export function knownNameKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function deriveAutoRoleNames(
  credits: readonly Credit[],
  manualAliases: readonly string[] = [],
) {
  const manualKeys = new Set(manualAliases.map(knownNameKey));
  const seen = new Set<string>();
  const roleNames: string[] = [];

  for (const credit of credits) {
    const displayValue = credit.characterName.trim().replace(/\s+/g, " ");
    const key = knownNameKey(displayValue);
    if (invalidRoleNames.has(key) || manualKeys.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    roleNames.push(displayValue);
  }

  return roleNames;
}

export function mergeKnownNames(
  manualAliases: readonly string[],
  credits: readonly Credit[],
) {
  return [
    ...manualAliases,
    ...deriveAutoRoleNames(credits, manualAliases),
  ];
}
