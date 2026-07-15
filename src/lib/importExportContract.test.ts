import { describe, expect, it } from "vitest";
import {
  operationFingerprint,
  sourceFileFingerprint,
  stableContractJson,
} from "./importExportContract";

describe("import/export contract fingerprint", () => {
  it("uses deterministic sorted UTF-8 JSON shared with Rust", () => {
    const value = { b: [1, true, null], a: "é" };
    expect(stableContractJson(value)).toBe('{"a":"é","b":[1,true,null]}');
    expect(operationFingerprint(value)).toBe("skv1-d6f5215a");
    expect(sourceFileFingerprint(new TextEncoder().encode("é")))
      .toBe("skvf1-1e9de8c1");
  });
});
