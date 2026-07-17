import { describe, expect, it } from "vitest";
import {
  canonicalSakuravaRef,
  currentSakuravaRefYymm,
  formatSakuravaRef,
  legacySakuravaRef,
  resolveSakuravaIdentity,
} from "./sakuravaRef";

describe("Sakurava Ref product identity", () => {
  it("uses the local issuance month and preserves leading zeroes", () => {
    expect(currentSakuravaRefYymm(new Date(2026, 6, 17, 12))).toBe("2607");
  });

  it("normalizes formatted and canonical references identically", () => {
    expect(canonicalSakuravaRef("V2607-0042")).toBe("V26070042");
    expect(canonicalSakuravaRef("v26070042")).toBe("V26070042");
    expect(formatSakuravaRef("V26070042")).toBe("V2607-0042");
  });

  it("rejects malformed public references", () => {
    expect(canonicalSakuravaRef("VID-0042")).toBeNull();
    expect(canonicalSakuravaRef("V2607-10000")).toBeNull();
  });

  it("resolves formatted, canonical, lowercase, and legacy identities to one record", () => {
    const record = { id: "video_legacy_1", sakuravaRef: "V26070051" };
    for (const identity of [
      "V2607-0051",
      "V26070051",
      "v2607-0051",
      "v26070051",
      record.id,
      legacySakuravaRef("VID", record.id),
    ]) {
      expect(resolveSakuravaIdentity("V", identity, [record])).toMatchObject({
        status: "resolved",
        record,
      });
    }
  });

  it("distinguishes malformed, unknown, and wrong-section references", () => {
    const records = [{ id: "video_1", sakuravaRef: "V26070051" }];
    expect(resolveSakuravaIdentity("V", "V2607-051", records).status).toBe("malformed");
    expect(resolveSakuravaIdentity("V", "V2607-9999", records).status).toBe("unknown");
    expect(resolveSakuravaIdentity("V", "I2607-0051", records).status).toBe("malformed");
  });

  it("never resolves a display name as identity", () => {
    expect(resolveSakuravaIdentity("V", "Spook Shack", [
      { id: "video_1", sakuravaRef: "V26070051" },
    ]).status).toBe("unknown");
  });
});
