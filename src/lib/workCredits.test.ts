import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Credit } from "../backend/types";
import {
  createCredit,
  deleteCredit,
  updateCredit,
} from "../runtime/creditCommands";
import {
  emptyCreditFormValue,
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
