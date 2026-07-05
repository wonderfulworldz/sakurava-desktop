import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Credit } from "../backend/types";
import {
  createCredit,
  deleteCredit,
  updateCredit,
} from "../runtime/creditCommands";
import {
  emptyCreditFormValue,
  creditGroupOrderAtIndex,
  insertCreditIntoPerformerGroup,
  moveCreditGroupToOrder,
  moveCreditToOrder,
  normalizeCreditOrders,
  reconcileWorkCredits,
} from "./workCredits";

vi.mock("../runtime/creditCommands", () => ({
  createCredit: vi.fn(),
  deleteCredit: vi.fn(),
  updateCredit: vi.fn(),
}));

describe("work Credit reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates multiple credits for one performer and stores category keys", async () => {
    const first = {
      ...emptyCreditFormValue("performer-1", 0),
      characterName: "Role One",
      creditedAsMode: "custom" as const,
      creditedAs: "Stage Name",
      creditTypeCategoryId: "cat-credit-voice",
      roleImportanceCategoryId: "cat-role-main",
    };
    const second = {
      ...emptyCreditFormValue("performer-1", 1),
      characterMode: "self" as const,
    };

    await reconcileWorkCredits("video", "video-1", [], [first, second]);

    expect(createCredit).toHaveBeenCalledTimes(2);
    expect(createCredit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        workType: "video",
        workId: "video-1",
        performerId: "performer-1",
        creditedAsMode: "custom",
        creditedAs: "Stage Name",
        creditTypeCategoryId: "cat-credit-voice",
        roleImportanceCategoryId: "cat-role-main",
      }),
    );
    expect(createCredit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        performerId: "performer-1",
        characterMode: "self",
        characterName: "",
      }),
    );
  });

  it("updates retained credits, deletes removed credits, and skips unresolved rows", async () => {
    const retained = credit("credit-1");
    const removed = credit("credit-2");
    await reconcileWorkCredits(
      "image",
      "image-1",
      [retained, removed],
      [
        {
          ...emptyCreditFormValue("performer-1"),
          id: retained.id,
          note: "Updated",
        },
        {
          ...emptyCreditFormValue(),
          performerNameSnapshot: "Unresolved Legacy Performer",
        },
      ],
    );

    expect(deleteCredit).toHaveBeenCalledWith("credit-2");
    expect(updateCredit).toHaveBeenCalledWith(
      "credit-1",
      expect.objectContaining({ note: "Updated" }),
    );
    expect(createCredit).not.toHaveBeenCalled();
  });

  it("persists normalized compact list position through billingOrder", async () => {
    await reconcileWorkCredits(
      "video",
      "video-1",
      [],
      [
        { ...emptyCreditFormValue("performer-2"), billingOrder: "0" },
        { ...emptyCreditFormValue("performer-1"), billingOrder: "1" },
      ],
    );

    expect(createCredit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ performerId: "performer-2", billingOrder: 1 }),
    );
    expect(createCredit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ performerId: "performer-1", billingOrder: 2 }),
    );
  });

  it("moves order 11 to 2 and shifts every other row without duplicates", () => {
    const rows = Array.from({ length: 11 }, (_, index) =>
      emptyCreditFormValue(`performer-${index + 1}`, index + 1),
    );

    const moved = moveCreditToOrder(rows, 10, "2");

    expect(moved.map((row) => row.performerId)).toEqual([
      "performer-1",
      "performer-11",
      "performer-2",
      "performer-3",
      "performer-4",
      "performer-5",
      "performer-6",
      "performer-7",
      "performer-8",
      "performer-9",
      "performer-10",
    ]);
    expect(moved.map((row) => row.billingOrder)).toEqual(
      Array.from({ length: 11 }, (_, index) => String(index + 1)),
    );
  });

  it("clamps invalid order and renumbers remaining rows after removal", () => {
    const rows = [
      emptyCreditFormValue("performer-1", 4),
      emptyCreditFormValue("performer-2", 4),
      emptyCreditFormValue("performer-3"),
    ];

    expect(
      moveCreditToOrder(rows, 2, "0").map((row) => row.performerId),
    ).toEqual(["performer-3", "performer-1", "performer-2"]);
    expect(
      normalizeCreditOrders(rows.slice(1)).map((row) => row.billingOrder),
    ).toEqual(["1", "2"]);
  });

  it("displays one order per performer and moves the whole performer group", () => {
    const rows = normalizeCreditOrders([
      emptyCreditFormValue("aether"),
      { ...emptyCreditFormValue("aether"), characterName: "Second role" },
      emptyCreditFormValue("alexandrina"),
      { ...emptyCreditFormValue("alexandrina"), characterName: "Second role" },
      emptyCreditFormValue("alhaitham"),
    ]);

    expect(rows.map((_, index) => creditGroupOrderAtIndex(rows, index)))
      .toEqual([1, 1, 2, 2, 3]);

    const moved = moveCreditGroupToOrder(rows, 2, "1");
    expect(moved.map((row) => row.performerId)).toEqual([
      "alexandrina",
      "alexandrina",
      "aether",
      "aether",
      "alhaitham",
    ]);
    expect(moved.map((row) => row.characterName)).toEqual([
      "",
      "Second role",
      "",
      "Second role",
      "",
    ]);
    expect(moved.map((_, index) => creditGroupOrderAtIndex(moved, index)))
      .toEqual([1, 1, 2, 2, 3]);
    expect(moved.map((row) => row.billingOrder))
      .toEqual(["1", "2", "3", "4", "5"]);
  });

  it("inserts another role directly after its existing performer group", () => {
    const rows = normalizeCreditOrders([
      emptyCreditFormValue("aether"),
      emptyCreditFormValue("alexandrina"),
    ]);
    const added = insertCreditIntoPerformerGroup(
      rows,
      { ...emptyCreditFormValue("aether"), characterName: "Added role" },
    );

    expect(added.map((row) => row.performerId))
      .toEqual(["aether", "aether", "alexandrina"]);
    expect(added[1]?.characterName).toBe("Added role");
  });

  it("saves long lists with empty Role Name and Credit Type", async () => {
    const rows = Array.from({ length: 31 }, (_, index) => ({
      ...emptyCreditFormValue(`performer-${index + 1}`, index + 1),
      characterName: "",
      creditTypeCategoryId: "",
    }));

    await reconcileWorkCredits("image", "image-1", [], rows);

    expect(createCredit).toHaveBeenCalledTimes(31);
    expect(createCredit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        performerId: "performer-31",
        characterName: "",
        creditTypeCategoryId: null,
        billingOrder: 31,
      }),
    );
  });
});

function credit(id: string): Credit {
  return {
    id,
    workType: "image",
    workId: "image-1",
    performerId: "performer-1",
    characterName: "",
    characterOriginalName: null,
    creditedAs: null,
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
