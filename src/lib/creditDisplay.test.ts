import { describe, expect, it } from "vitest";
import type { Credit } from "../backend/types";
import { buildCreditDetailItems } from "./creditDisplay";

describe("Credit detail ordering", () => {
  it("sorts numeric Order first and keeps duplicate Order stable", () => {
    const items = buildCreditDetailItems(
      [
        credit("unordered", null),
        credit("second-same-order", 2),
        credit("first", 1),
        credit("first-same-order", 2),
      ],
      [],
      [],
      "[]",
    );

    expect(items.map((item) => item.id)).toEqual([
      "first",
      "second-same-order",
      "first-same-order",
      "unordered",
    ]);
  });

  it("prefers persisted free-text Credit Type over independent Category relationships", () => {
    const items = buildCreditDetailItems(
      [{ ...credit("free-text", 1), creditTypeText: "Credit A", creditTypeCategoryId: "cat-voice" }],
      [],
      [],
      "[]",
    );

    expect(items[0]?.creditType).toBe("Credit A");
  });
});

function credit(id: string, billingOrder: number | null): Credit {
  return {
    id,
    workType: "video",
    workId: "video-1",
    performerId: `performer-${id}`,
    characterName: "",
    characterOriginalName: null,
    creditedAs: null,
    creditTypeText: null,
    creditedAsMode: "auto",
    creditTypeCategoryId: null,
    roleImportanceCategoryId: null,
    characterMode: "text",
    characterId: null,
    billingOrder,
    note: null,
    legacySourceKey: null,
    createdAt: "1",
    updatedAt: "1",
  };
}
