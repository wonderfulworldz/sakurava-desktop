import { describe, expect, it } from "vitest";
import type { Performer } from "../backend/types";
import { emptyCreditFormValue } from "../lib/workCredits";
import { relatedPerformersForSubmit } from "./FormPage";

const performer = {
  id: "performer-smoke",
  name: "Smoke Performer",
  originalName: "",
} as Performer;

describe("relatedPerformersForSubmit", () => {
  it("does not create a legacy projection from persisted Credit rows", () => {
    const credits = ["credit-3", "credit-4"].map((id) => ({
      ...emptyCreditFormValue(performer.id),
      id,
      editorRowId: id,
    }));

    expect(relatedPerformersForSubmit(credits, [performer], [])).toEqual([]);
  });

  it("keeps the legacy projection path for newly entered legacy-compatible rows", () => {
    expect(
      relatedPerformersForSubmit(
        [emptyCreditFormValue(performer.id)],
        [performer],
        [],
      ),
    ).toEqual([{ performerId: performer.id, nameSnapshot: performer.name }]);
  });
});
