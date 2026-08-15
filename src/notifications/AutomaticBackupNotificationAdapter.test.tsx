import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { AUTOMATIC_BACKUP_RESULT_EVENT } from "../lib/automaticBackup";
import AutomaticBackupNotificationAdapter from "./AutomaticBackupNotificationAdapter";
import { NotificationProvider, useNotifications } from "./NotificationProvider";

function Harness() {
  const { records } = useNotifications();
  return <output data-testid="records">{JSON.stringify(records)}</output>;
}

function renderAdapter() {
  return render(<NotificationProvider><AutomaticBackupNotificationAdapter /><Harness /></NotificationProvider>);
}

function emit(detail: unknown) {
  act(() => window.dispatchEvent(new CustomEvent(AUTOMATIC_BACKUP_RESULT_EVENT, { detail })));
}

describe("Automatic Backup notification adapter", () => {
  beforeEach(() => window.localStorage.clear());

  it("deduplicates pending work, transitions terminal runs, and retains later runs", () => {
    renderAdapter();
    emit({ state: "pending" });
    emit({ state: "pending" });
    expect(JSON.parse(screen.getByTestId("records").textContent ?? "[]")).toHaveLength(1);
    emit({ state: "success", packageInfo: {}, completedAt: "2026-08-14T12:00:00.000Z" });
    let records = JSON.parse(screen.getByTestId("records").textContent ?? "[]");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ state: "terminal", kind: "success", read: false });
    emit({ state: "pending" });
    emit({ state: "error", message: "C:\\private\\backup.skv stack trace" });
    records = JSON.parse(screen.getByTestId("records").textContent ?? "[]");
    expect(records).toHaveLength(2);
    expect(records[1]).toMatchObject({ state: "terminal", kind: "error", titleKey: "notifications.automaticBackup.failed" });
    expect(JSON.stringify(records)).not.toContain("private");
    expect(JSON.stringify(records)).not.toContain("stack trace");
  });

  it("keeps Automatic Backup indeterminate without fabricated progress", () => {
    renderAdapter();
    emit({ state: "pending" });
    const [record] = JSON.parse(screen.getByTestId("records").textContent ?? "[]");
    expect(record).toMatchObject({ state: "running", kind: "progress" });
    expect(record.progress).toBeUndefined();
  });
});
