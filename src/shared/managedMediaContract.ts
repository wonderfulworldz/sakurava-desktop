import rawManagedMediaContract from "./managed-media-contract.v1.json";

export const MANAGED_MEDIA_CONTRACT_VERSION = 1 as const;
export const MANAGED_MEDIA_PROFILE_VERSION = "managed-media-profile-v1" as const;

export type ManagedMediaFamilyId =
  | "LANDSCAPE_16_9"
  | "STANDARD_4_3"
  | "SQUARE_1_1"
  | "PORTRAIT_4_5";

export type ManagedMediaTierId = "THUMBNAIL" | "MEDIUM" | "LARGE";

export type ManagedMediaRoleId =
  | "video_collection_full_card"
  | "image_collection_full_card"
  | "video_detail_primary"
  | "image_detail_primary"
  | "video_table"
  | "image_table"
  | "video_lite_card"
  | "image_lite_card"
  | "performer_lite_card"
  | "related_video_active"
  | "related_image_active"
  | "related_performer_active"
  | "performer_collection_full_card"
  | "image_gallery_tile"
  | "category_active_card"
  | "category_table"
  | "glossary_table"
  | "performer_detail_primary"
  | "performer_mini_row"
  | "performer_table";

export type ManagedMediaFitPolicyId = "CENTER_COVER";

export interface ManagedMediaDimensions {
  readonly width: number;
  readonly height: number;
}

export interface ManagedMediaTier {
  readonly id: ManagedMediaTierId;
  readonly maxWidth: number;
  readonly maxHeight: number;
}

export interface ManagedMediaFamily {
  readonly id: ManagedMediaFamilyId;
  readonly ratio: ManagedMediaDimensions;
  readonly targets: readonly (ManagedMediaDimensions & {
    readonly tier: ManagedMediaTierId;
  })[];
}

export interface ManagedMediaFitPolicy {
  readonly id: ManagedMediaFitPolicyId;
  readonly objectFit: "cover";
  readonly objectPosition: "center";
}

export interface ManagedMediaRole {
  readonly id: ManagedMediaRoleId;
  readonly family: ManagedMediaFamilyId;
  readonly tiers: readonly ManagedMediaTierId[];
  readonly fitPolicy: ManagedMediaFitPolicyId;
}

export interface ManagedMediaContract {
  readonly contractVersion: typeof MANAGED_MEDIA_CONTRACT_VERSION;
  readonly profileVersion: typeof MANAGED_MEDIA_PROFILE_VERSION;
  readonly tiers: readonly ManagedMediaTier[];
  readonly families: readonly ManagedMediaFamily[];
  readonly fitPolicies: readonly ManagedMediaFitPolicy[];
  readonly roles: readonly ManagedMediaRole[];
}

type FamilySpec = {
  readonly ratio: readonly [number, number];
  readonly targets: Readonly<Record<ManagedMediaTierId, readonly [number, number] | undefined>>;
};

type RoleSpec = {
  readonly family: ManagedMediaFamilyId;
  readonly tiers: readonly ManagedMediaTierId[];
};

const tierSpecs = {
  THUMBNAIL: [320, 320],
  MEDIUM: [1280, 1280],
  LARGE: [1920, 1920],
} as const satisfies Record<ManagedMediaTierId, readonly [number, number]>;

const familySpecs = {
  LANDSCAPE_16_9: {
    ratio: [16, 9],
    targets: {
      THUMBNAIL: [320, 180],
      MEDIUM: [1280, 720],
      LARGE: [1920, 1080],
    },
  },
  STANDARD_4_3: {
    ratio: [4, 3],
    targets: {
      THUMBNAIL: [320, 240],
      MEDIUM: [1280, 960],
      LARGE: undefined,
    },
  },
  SQUARE_1_1: {
    ratio: [1, 1],
    targets: {
      THUMBNAIL: [320, 320],
      MEDIUM: [1280, 1280],
      LARGE: undefined,
    },
  },
  PORTRAIT_4_5: {
    ratio: [4, 5],
    targets: {
      THUMBNAIL: [256, 320],
      MEDIUM: [1024, 1280],
      LARGE: [1536, 1920],
    },
  },
} as const satisfies Record<ManagedMediaFamilyId, FamilySpec>;

const roleSpecs = {
  video_collection_full_card: {
    family: "LANDSCAPE_16_9",
    tiers: ["THUMBNAIL", "MEDIUM"],
  },
  image_collection_full_card: {
    family: "LANDSCAPE_16_9",
    tiers: ["THUMBNAIL", "MEDIUM"],
  },
  video_detail_primary: {
    family: "LANDSCAPE_16_9",
    tiers: ["THUMBNAIL", "MEDIUM", "LARGE"],
  },
  image_detail_primary: {
    family: "LANDSCAPE_16_9",
    tiers: ["THUMBNAIL", "MEDIUM", "LARGE"],
  },
  video_table: { family: "LANDSCAPE_16_9", tiers: ["THUMBNAIL"] },
  image_table: { family: "LANDSCAPE_16_9", tiers: ["THUMBNAIL"] },
  video_lite_card: { family: "STANDARD_4_3", tiers: ["THUMBNAIL", "MEDIUM"] },
  image_lite_card: { family: "STANDARD_4_3", tiers: ["THUMBNAIL", "MEDIUM"] },
  performer_lite_card: {
    family: "STANDARD_4_3",
    tiers: ["THUMBNAIL", "MEDIUM"],
  },
  related_video_active: {
    family: "STANDARD_4_3",
    tiers: ["THUMBNAIL", "MEDIUM"],
  },
  related_image_active: {
    family: "STANDARD_4_3",
    tiers: ["THUMBNAIL", "MEDIUM"],
  },
  related_performer_active: {
    family: "STANDARD_4_3",
    tiers: ["THUMBNAIL", "MEDIUM"],
  },
  performer_collection_full_card: {
    family: "SQUARE_1_1",
    tiers: ["THUMBNAIL", "MEDIUM"],
  },
  image_gallery_tile: { family: "SQUARE_1_1", tiers: ["THUMBNAIL", "MEDIUM"] },
  category_active_card: { family: "SQUARE_1_1", tiers: ["THUMBNAIL", "MEDIUM"] },
  category_table: { family: "SQUARE_1_1", tiers: ["THUMBNAIL"] },
  glossary_table: { family: "SQUARE_1_1", tiers: ["THUMBNAIL"] },
  performer_detail_primary: {
    family: "PORTRAIT_4_5",
    tiers: ["THUMBNAIL", "MEDIUM", "LARGE"],
  },
  performer_mini_row: { family: "PORTRAIT_4_5", tiers: ["THUMBNAIL"] },
  performer_table: { family: "PORTRAIT_4_5", tiers: ["THUMBNAIL"] },
} as const satisfies Record<ManagedMediaRoleId, RoleSpec>;

const familyIds = Object.freeze(Object.keys(familySpecs) as ManagedMediaFamilyId[]);
const tierIds = Object.freeze(Object.keys(tierSpecs) as ManagedMediaTierId[]);
const roleIds = Object.freeze(Object.keys(roleSpecs) as ManagedMediaRoleId[]);

export class ManagedMediaContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManagedMediaContractError";
  }
}

function fail(message: string): never {
  throw new ManagedMediaContractError(message);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  return value;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) fail(`${label} contains unknown field ${unknown[0]}.`);
  const missing = allowed.filter((key) => !(key in value));
  if (missing.length > 0) fail(`${label} is missing field ${missing[0]}.`);
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    fail(`${label} must be a positive integer.`);
  }
  return Number(value);
}

function exactString<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail(`${label} is unknown.`);
  }
  return value as T;
}

function unique<T extends string>(values: readonly T[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label} contains a duplicate.`);
}

function sameOrderedValues(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

export function validateManagedMediaContract(input: unknown): ManagedMediaContract {
  const root = record(input, "contract");
  exactKeys(root, ["contractVersion", "profileVersion", "tiers", "families", "fitPolicies", "roles"], "contract");
  if (root.contractVersion !== MANAGED_MEDIA_CONTRACT_VERSION) fail("contractVersion is unknown.");
  if (root.profileVersion !== MANAGED_MEDIA_PROFILE_VERSION) fail("profileVersion is unknown.");

  const tiers = array(root.tiers, "tiers").map((value, index) => {
    const tier = record(value, `tiers[${index}]`);
    exactKeys(tier, ["id", "maxWidth", "maxHeight"], `tiers[${index}]`);
    const id = exactString(tier.id, tierIds, `tiers[${index}].id`);
    const maxWidth = positiveInteger(tier.maxWidth, `tiers[${index}].maxWidth`);
    const maxHeight = positiveInteger(tier.maxHeight, `tiers[${index}].maxHeight`);
    const expected = tierSpecs[id];
    if (maxWidth !== expected[0] || maxHeight !== expected[1]) {
      fail(`${id} bounding box is not approved.`);
    }
    return { id, maxWidth, maxHeight };
  });
  unique(tiers.map(({ id }) => id), "tiers");
  if (!sameOrderedValues(tiers.map(({ id }) => id), tierIds)) {
    fail("tiers must contain exactly THUMBNAIL, MEDIUM, and LARGE.");
  }

  const tierById = new Map(tiers.map((tier) => [tier.id, tier]));
  const families = array(root.families, "families").map((value, index) => {
    const family = record(value, `families[${index}]`);
    exactKeys(family, ["id", "ratio", "targets"], `families[${index}]`);
    const id = exactString(family.id, familyIds, `families[${index}].id`);
    const ratio = record(family.ratio, `families[${index}].ratio`);
    exactKeys(ratio, ["width", "height"], `families[${index}].ratio`);
    const ratioWidth = positiveInteger(ratio.width, `${id}.ratio.width`);
    const ratioHeight = positiveInteger(ratio.height, `${id}.ratio.height`);
    const expected = familySpecs[id];
    if (ratioWidth !== expected.ratio[0] || ratioHeight !== expected.ratio[1]) {
      fail(`${id} ratio is not canonical.`);
    }

    const targets = array(family.targets, `${id}.targets`).map((targetValue, targetIndex) => {
      const target = record(targetValue, `${id}.targets[${targetIndex}]`);
      exactKeys(target, ["tier", "width", "height"], `${id}.targets[${targetIndex}]`);
      const tier = exactString(target.tier, tierIds, `${id}.targets[${targetIndex}].tier`);
      const width = positiveInteger(target.width, `${id}.${tier}.width`);
      const height = positiveInteger(target.height, `${id}.${tier}.height`);
      const expectedDimensions = expected.targets[tier];
      if (!expectedDimensions) fail(`${id} cannot contain ${tier}.`);
      if (width !== expectedDimensions[0] || height !== expectedDimensions[1]) {
        fail(`${id} ${tier} dimensions are not approved.`);
      }
      if (width * ratioHeight !== height * ratioWidth) {
        fail(`${id} ${tier} does not match its canonical ratio.`);
      }
      const bounds = tierById.get(tier);
      if (!bounds || width > bounds.maxWidth || height > bounds.maxHeight) {
        fail(`${id} ${tier} exceeds its bounding box.`);
      }
      return { tier, width, height };
    });
    unique(targets.map(({ tier }) => tier), `${id}.targets`);
    const expectedTiers = tierIds.filter((tier) => expected.targets[tier] !== undefined);
    if (!sameOrderedValues(targets.map(({ tier }) => tier), expectedTiers)) {
      fail(`${id} tier ceiling is not approved.`);
    }
    return { id, ratio: { width: ratioWidth, height: ratioHeight }, targets };
  });
  unique(families.map(({ id }) => id), "families");
  if (!sameOrderedValues(families.map(({ id }) => id), familyIds)) {
    fail("families must contain exactly the four canonical families.");
  }

  const fitPolicies = array(root.fitPolicies, "fitPolicies").map((value, index) => {
    const policy = record(value, `fitPolicies[${index}]`);
    exactKeys(policy, ["id", "objectFit", "objectPosition"], `fitPolicies[${index}]`);
    const id = exactString(policy.id, ["CENTER_COVER"] as const, `fitPolicies[${index}].id`);
    if (policy.objectFit !== "cover" || policy.objectPosition !== "center") {
      fail("CENTER_COVER must use centered object-fit cover.");
    }
    return { id, objectFit: "cover" as const, objectPosition: "center" as const };
  });
  unique(fitPolicies.map(({ id }) => id), "fitPolicies");
  if (fitPolicies.length !== 1) fail("exactly one fit policy is required.");

  const roles = array(root.roles, "roles").map((value, index) => {
    const role = record(value, `roles[${index}]`);
    exactKeys(role, ["id", "family", "tiers", "fitPolicy"], `roles[${index}]`);
    const id = exactString(role.id, roleIds, `roles[${index}].id`);
    const family = exactString(role.family, familyIds, `${id}.family`);
    const roleTiers = array(role.tiers, `${id}.tiers`).map((tier, tierIndex) =>
      exactString(tier, tierIds, `${id}.tiers[${tierIndex}]`),
    );
    unique(roleTiers, `${id}.tiers`);
    const fitPolicy = exactString(role.fitPolicy, ["CENTER_COVER"] as const, `${id}.fitPolicy`);
    const expected = roleSpecs[id];
    if (family !== expected.family || !sameOrderedValues(roleTiers, expected.tiers)) {
      fail(`${id} mapping is not approved.`);
    }
    const familyTargets = familySpecs[family].targets;
    if (roleTiers.some((tier) => familyTargets[tier] === undefined)) {
      fail(`${id} uses a tier unavailable to ${family}.`);
    }
    return { id, family, tiers: roleTiers, fitPolicy };
  });
  unique(roles.map(({ id }) => id), "roles");
  if (!sameOrderedValues(roles.map(({ id }) => id), roleIds)) {
    fail("roles must contain every required role exactly once.");
  }

  return deepFreeze({
    contractVersion: MANAGED_MEDIA_CONTRACT_VERSION,
    profileVersion: MANAGED_MEDIA_PROFILE_VERSION,
    tiers,
    families,
    fitPolicies,
    roles,
  });
}

export const managedMediaContract = validateManagedMediaContract(rawManagedMediaContract);

const familyLookup = new Map(managedMediaContract.families.map((family) => [family.id, family]));
const tierLookup = new Map(managedMediaContract.tiers.map((tier) => [tier.id, tier]));
const roleLookup = new Map(managedMediaContract.roles.map((role) => [role.id, role]));

export function getManagedMediaFamily(id: ManagedMediaFamilyId): ManagedMediaFamily {
  return familyLookup.get(id)!;
}

export function getManagedMediaTier(id: ManagedMediaTierId): ManagedMediaTier {
  return tierLookup.get(id)!;
}

export function getManagedMediaRole(id: ManagedMediaRoleId): ManagedMediaRole {
  return roleLookup.get(id)!;
}
