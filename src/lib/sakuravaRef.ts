export type SakuravaRefSectionCode = "V" | "I" | "P" | "C" | "G" | "R";
export type LegacySakuravaRefPrefix = "VID" | "IMG" | "PER" | "CAT" | "GLO";

export type SakuravaIdentityRecord = {
  id?: string;
  key?: string;
  sakuravaRef?: string;
};

export type SakuravaIdentityResolution<TRecord> =
  | { status: "resolved"; canonicalIdentity: string; record: TRecord }
  | { status: "malformed" | "unknown" | "ambiguous"; canonicalIdentity: string; record?: never };

const legacyPrefixBySection: Record<Exclude<SakuravaRefSectionCode, "R">, LegacySakuravaRefPrefix> = {
  V: "VID",
  I: "IMG",
  P: "PER",
  C: "CAT",
  G: "GLO",
};

export function currentSakuravaRefYymm(date = new Date()) {
  return `${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function canonicalSakuravaRef(value: string) {
  const normalized = value.trim().toUpperCase().replace(/-/g, "");
  return /^[VIPCGR]\d{8}$/.test(normalized) ? normalized : null;
}

export function formatSakuravaRef(value: string) {
  const canonical = canonicalSakuravaRef(value);
  return canonical ? `${canonical.slice(0, 5)}-${canonical.slice(5)}` : value;
}

export function sectionCodeForLegacyPrefix(prefix: LegacySakuravaRefPrefix) {
  return ({ VID: "V", IMG: "I", PER: "P", CAT: "C", GLO: "G" } as const)[prefix];
}

export function legacyPrefixForSection(section: Exclude<SakuravaRefSectionCode, "R">) {
  return legacyPrefixBySection[section];
}

export function legacySakuravaRef(prefix: LegacySakuravaRefPrefix, technicalId: string) {
  const value = technicalId.trim();
  return value ? `${prefix}-${stableLegacyRefToken(value)}` : "";
}

export function canonicalImportIdentity(value: string) {
  return canonicalSakuravaRef(value) ?? value.trim().toUpperCase();
}

export function resolveSakuravaIdentity<TRecord extends SakuravaIdentityRecord>(
  section: SakuravaRefSectionCode,
  identity: string,
  records: readonly TRecord[],
): SakuravaIdentityResolution<TRecord> {
  const trimmed = identity.trim();
  const canonicalCurrent = canonicalSakuravaRef(trimmed);
  const canonicalIdentity = canonicalCurrent ?? trimmed.toUpperCase();
  if (!trimmed) return { status: "unknown", canonicalIdentity };

  if (looksLikeCurrentSakuravaRef(trimmed)) {
    if (!canonicalCurrent || canonicalCurrent[0] !== section) {
      return { status: "malformed", canonicalIdentity };
    }
  }

  // Credits are intentionally public-Ref-only. Their technical id is never a
  // spreadsheet or user-facing identity, unlike the five legacy sections.
  const legacyPrefix = section === "R" ? null : legacyPrefixBySection[section];
  const explicitLegacy = trimmed.match(/^(VID|IMG|PER|CAT|GLO)-[0-9A-Z]+$/i);
  if (explicitLegacy && explicitLegacy[1].toUpperCase() !== legacyPrefix) {
    return { status: "malformed", canonicalIdentity };
  }

  const matches = records.filter((record) => recordMatchesSakuravaIdentity(
    section,
    trimmed,
    record,
  ));
  if (matches.length === 1) {
    return { status: "resolved", canonicalIdentity, record: matches[0] };
  }
  return {
    status: matches.length > 1 ? "ambiguous" : "unknown",
    canonicalIdentity,
  };
}

export function recordMatchesSakuravaIdentity(
  section: SakuravaRefSectionCode,
  identity: string,
  record: SakuravaIdentityRecord,
) {
  const technical = String(record.key ?? record.id ?? "").trim();
  const candidate = identity.trim();
  const candidateCurrent = canonicalSakuravaRef(candidate);
  const recordCurrent = canonicalSakuravaRef(record.sakuravaRef ?? "");
  if (candidateCurrent) {
    return candidateCurrent[0] === section && candidateCurrent === recordCurrent;
  }
  if (section === "R") {
    return false;
  }
  const normalized = candidate.toUpperCase();
  return normalized === technical.toUpperCase()
    || normalized === legacySakuravaRef(legacyPrefixBySection[section], technical).toUpperCase();
}

export function sakuravaIdentityLookupKeys(
  section: SakuravaRefSectionCode,
  record: SakuravaIdentityRecord,
) {
  const technical = String(record.key ?? record.id ?? "").trim();
  const current = canonicalSakuravaRef(record.sakuravaRef ?? "");
  const publicKeys = [
    current ?? "",
    current ? formatSakuravaRef(current) : "",
  ];
  if (section === "R") {
    return Array.from(new Set(publicKeys.filter(Boolean).map(canonicalImportIdentity)));
  }
  return Array.from(new Set([
    ...publicKeys,
    technical,
    legacySakuravaRef(legacyPrefixBySection[section], technical),
  ].filter(Boolean).map(canonicalImportIdentity)));
}

export function looksLikeCurrentSakuravaRef(value: string) {
  return /^[VIPCGR](?:\d|-)/i.test(value.trim());
}

function stableLegacyRefToken(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(-7);
}
