import { describe, expect, it } from "vitest";
import { defaultDatabaseBackupFileName } from "./dialogCommands";

describe("dialog command filenames", () => {
  it("uses the skv local timestamp pattern for database backup defaults", () => {
    expect(defaultDatabaseBackupFileName(new Date(2026, 4, 20, 14, 30, 12)))
      .toBe("skv-backup-20262005-143012.sqlite");
  });
});
