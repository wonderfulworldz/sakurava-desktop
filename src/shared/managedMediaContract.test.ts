import rawManagedMediaContract from "./managed-media-contract.v1.json";
import {
  getManagedMediaFamily,
  getManagedMediaRole,
  managedMediaContract,
  ManagedMediaContractError,
  validateManagedMediaContract,
} from "./managedMediaContract";

function cloneContract(): Record<string, unknown> {
  return structuredClone(rawManagedMediaContract) as Record<string, unknown>;
}

function expectInvalid(mutator: (contract: Record<string, any>) => void, message: RegExp): void {
  const candidate = cloneContract();
  mutator(candidate);
  expect(() => validateManagedMediaContract(candidate)).toThrow(ManagedMediaContractError);
  expect(() => validateManagedMediaContract(candidate)).toThrow(message);
}

describe("managed media shared contract", () => {
  it("validates the checked-in contract and exposes exact approved dimensions", () => {
    expect(managedMediaContract.contractVersion).toBe(1);
    expect(managedMediaContract.profileVersion).toBe("managed-media-profile-v1");
    expect(managedMediaContract.families.map(({ id }) => id)).toEqual([
      "LANDSCAPE_16_9",
      "STANDARD_4_3",
      "SQUARE_1_1",
      "PORTRAIT_4_5",
    ]);
    expect(managedMediaContract.tiers.map(({ id }) => id)).toEqual([
      "THUMBNAIL",
      "MEDIUM",
      "LARGE",
    ]);
    expect(getManagedMediaFamily("LANDSCAPE_16_9").targets).toEqual([
      { tier: "THUMBNAIL", width: 320, height: 180 },
      { tier: "MEDIUM", width: 1280, height: 720 },
      { tier: "LARGE", width: 1920, height: 1080 },
    ]);
    expect(getManagedMediaFamily("STANDARD_4_3").targets).toHaveLength(2);
    expect(getManagedMediaFamily("SQUARE_1_1").targets).toHaveLength(2);
    expect(getManagedMediaFamily("PORTRAIT_4_5").targets).toEqual([
      { tier: "THUMBNAIL", width: 256, height: 320 },
      { tier: "MEDIUM", width: 1024, height: 1280 },
      { tier: "LARGE", width: 1536, height: 1920 },
    ]);
    expect(managedMediaContract.roles).toHaveLength(20);
    expect(getManagedMediaRole("performer_table")).toMatchObject({
      family: "PORTRAIT_4_5",
      tiers: ["THUMBNAIL"],
      fitPolicy: "CENTER_COVER",
    });
    expect(Object.isFrozen(managedMediaContract)).toBe(true);
  });

  it("rejects unknown contract fields, versions, families, tiers, and roles", () => {
    expectInvalid((contract) => {
      contract.unapproved = true;
    }, /unknown field/);
    expectInvalid((contract) => {
      contract.profileVersion = "managed-media-profile-v2";
    }, /profileVersion is unknown/);
    expectInvalid((contract) => {
      contract.families[0].id = "WIDE_16_9";
    }, /id is unknown/);
    expectInvalid((contract) => {
      contract.tiers[0].id = "NATIVE_FALLBACK";
    }, /id is unknown/);
    expectInvalid((contract) => {
      contract.roles[0].id = "related_square";
    }, /id is unknown/);
  });

  it("rejects duplicate families, tiers, roles, and role tiers", () => {
    expectInvalid((contract) => {
      contract.families[1].id = contract.families[0].id;
    }, /duplicate|canonical/);
    expectInvalid((contract) => {
      contract.tiers[1].id = contract.tiers[0].id;
    }, /duplicate|approved/);
    expectInvalid((contract) => {
      contract.roles[1].id = contract.roles[0].id;
    }, /duplicate|mapping/);
    expectInvalid((contract) => {
      contract.roles[0].tiers.push("THUMBNAIL");
    }, /duplicate/);
  });

  it("rejects invalid dimensions, ratios, tier ceilings, and role mappings", () => {
    expectInvalid((contract) => {
      contract.families[0].targets[0].height = 181;
    }, /dimensions are not approved/);
    expectInvalid((contract) => {
      contract.families[0].ratio.width = 5;
      contract.families[0].ratio.height = 3;
    }, /ratio is not canonical/);
    expectInvalid((contract) => {
      contract.families[1].targets.push({ tier: "LARGE", width: 1920, height: 1440 });
    }, /cannot contain LARGE/);
    expectInvalid((contract) => {
      contract.roles[0].family = "STANDARD_4_3";
    }, /mapping is not approved/);
    expectInvalid((contract) => {
      contract.roles[0].tiers = ["THUMBNAIL", "MEDIUM", "LARGE"];
    }, /mapping is not approved/);
  });

  it("rejects missing roles and non-centered fit policy behavior", () => {
    expectInvalid((contract) => {
      contract.roles.pop();
    }, /every required role/);
    expectInvalid((contract) => {
      contract.fitPolicies[0].objectPosition = "top";
    }, /centered object-fit cover/);
  });
});
