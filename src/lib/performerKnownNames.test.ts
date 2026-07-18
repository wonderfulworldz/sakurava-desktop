import { describe, expect, it } from "vitest";
import type { Credit } from "../backend/types";
import { deriveAutoRoleNames, mergeKnownNames } from "./performerKnownNames";

describe("performer known names", () => {
  it("ignores invalid roles and deduplicates normalized values", () => {
    const credits = [
      credit("  Traveler  "),
      credit("traveler"),
      credit("Role   With   Spaces"),
      credit("N/A"),
      credit("unknown"),
      credit("*"),
      credit(""),
    ];

    expect(deriveAutoRoleNames(credits)).toEqual([
      "Traveler",
      "Role With Spaces",
    ]);
  });

  it("keeps manual aliases first and suppresses matching automatic roles", () => {
    expect(mergeKnownNames(["Traveler"], [
      credit(" traveler "),
      credit("Narrator"),
    ])).toEqual(["Traveler", "Narrator"]);
  });
});

function credit(characterName: string): Credit {
  return {
    id: `credit-${characterName}`,
    workType: "video",
    workId: "video-1",
    performerId: "performer-1",
    characterName,
    characterOriginalName: null,
    creditedAs: null,
    creditTypeText: null,
    creditedAsMode: "auto",
    creditTypeCategoryId: null,
    roleImportanceCategoryId: null,
    characterMode: "text",
    characterId: null,
    billingOrder: null,
    note: null,
    legacySourceKey: null,
    createdAt: "1",
    updatedAt: "1",
  };
}
