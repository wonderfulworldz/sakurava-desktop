import { beforeEach, describe, expect, it } from "vitest";

import {
  NOTIFICATION_HISTORY_STORAGE_KEY,
  completeRunningNotification,
  clearNotification,
  clearNotificationHistory,
  hydrateNotificationHistory,
  issueNotifications,
  markNotificationRead,
  persistNotificationHistory,
  pruneNotificationHistory,
  unreadTerminalNotificationCount,
  upsertRunningNotification,
  type NotificationRecord,
} from "./notificationStore";

const NOW = Date.parse("2026-08-14T12:00:00.000Z");

function terminal(id: string, at = NOW, overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  const timestamp = new Date(at).toISOString();
  return {
    id,
    producerKey: "test",
    kind: "success",
    state: "terminal",
    titleKey: "notifications.test.completed",
    parameters: {},
    createdAt: timestamp,
    updatedAt: timestamp,
    terminalAt: timestamp,
    read: false,
    ...overrides,
  };
}

describe("notification history store", () => {
  beforeEach(() => window.localStorage.clear());

  it("fails safely for malformed or invalid persisted history while hydrating valid terminal history", () => {
    window.localStorage.setItem(NOTIFICATION_HISTORY_STORAGE_KEY, "{");
    expect(hydrateNotificationHistory(window.localStorage, NOW)).toEqual([]);

    window.localStorage.setItem(NOTIFICATION_HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, records: [
      terminal("valid"),
      { ...terminal("invalid"), kind: "progress" },
    ] }));
    expect(hydrateNotificationHistory(window.localStorage, NOW).map((record) => record.id)).toEqual(["valid"]);
  });

  it("reconciles persisted running work as unread interrupted history without claiming failure", () => {
    const running = upsertRunningNotification([], { producerKey: "backup", dedupeKey: "backup", titleKey: "notifications.automaticBackup.running" }, NOW);
    persistNotificationHistory(window.localStorage, running, NOW);
    const hydrated = hydrateNotificationHistory(window.localStorage, NOW + 1_000);
    expect(hydrated[0]).toMatchObject({ state: "interrupted", kind: "warning", read: false });
    expect(hydrated[0].messageKey).toBe("notifications.interrupted.message");
    expect(issueNotifications(hydrated).map((record) => record.id)).toEqual([hydrated[0].id]);
  });

  it("keeps running notifications out of unread count and mutates one active dedupe record", () => {
    const first = upsertRunningNotification([], { producerKey: "backup", dedupeKey: "automatic-backup", titleKey: "notifications.automaticBackup.running" }, NOW);
    const second = upsertRunningNotification(first, { producerKey: "backup", dedupeKey: "automatic-backup", titleKey: "notifications.automaticBackup.running", progress: { current: 2, total: 4 } }, NOW + 1_000);
    expect(second).toHaveLength(1);
    expect(second[0].progress).toEqual({ current: 2, total: 4 });
    expect(unreadTerminalNotificationCount(second)).toBe(0);
  });

  it("transitions a running item to unread terminal history exactly once", () => {
    const running = upsertRunningNotification([], { producerKey: "backup", dedupeKey: "automatic-backup", titleKey: "notifications.automaticBackup.running" }, NOW);
    const first = completeRunningNotification(running, "automatic-backup", { producerKey: "backup", kind: "success", titleKey: "notifications.automaticBackup.completed" }, NOW + 1_000);
    expect(first.transitioned).toMatchObject({ kind: "success", state: "terminal", read: false });
    const read = markNotificationRead(first.records, first.records[0].id);
    const repeated = completeRunningNotification(read, "automatic-backup", { producerKey: "backup", kind: "success", titleKey: "notifications.automaticBackup.completed" }, NOW + 2_000);
    expect(repeated.transitioned).toBeNull();
    expect(repeated.records[0].read).toBe(true);
  });

  it("clears only terminal items and keeps running items during history clear", () => {
    const running = upsertRunningNotification([], { producerKey: "backup", dedupeKey: "running", titleKey: "notifications.automaticBackup.running" }, NOW);
    const records = [...running, terminal("done")];
    expect(clearNotification(records, running[0].id)).toHaveLength(2);
    expect(clearNotification(records, "done").map((record) => record.id)).toEqual([running[0].id]);
    expect(clearNotificationHistory(records).map((record) => record.id)).toEqual([running[0].id]);
  });

  it("prunes terminal history by age then deterministically caps the newest 500 records", () => {
    const expired = terminal("expired", NOW - 31 * 24 * 60 * 60 * 1000);
    const records = [expired, ...Array.from({ length: 501 }, (_, index) => terminal(`record-${index}`, NOW - index * 1_000))];
    const pruned = pruneNotificationHistory(records, NOW);
    expect(pruned).toHaveLength(500);
    expect(pruned.some((record) => record.id === "expired")).toBe(false);
    expect(pruned.some((record) => record.id === "record-0")).toBe(true);
    expect(pruned.some((record) => record.id === "record-500")).toBe(false);
  });

  it("retains separate completed runs with the same producer and stores semantic translation data", () => {
    const firstRunning = upsertRunningNotification([], { producerKey: "automatic-backup", dedupeKey: "automatic-backup", titleKey: "notifications.automaticBackup.running", parameters: { count: "1" } }, NOW);
    const first = completeRunningNotification(firstRunning, "automatic-backup", { producerKey: "automatic-backup", kind: "success", titleKey: "notifications.automaticBackup.completed" }, NOW + 1_000);
    const secondRunning = upsertRunningNotification(first.records, { producerKey: "automatic-backup", dedupeKey: "automatic-backup", titleKey: "notifications.automaticBackup.running", parameters: { count: "2" } }, NOW + 2_000);
    const second = completeRunningNotification(secondRunning, "automatic-backup", { producerKey: "automatic-backup", kind: "error", titleKey: "notifications.automaticBackup.failed" }, NOW + 3_000);
    expect(second.records.filter((record) => record.state !== "running")).toHaveLength(2);
    expect(firstRunning[0]).toMatchObject({ titleKey: "notifications.automaticBackup.running", parameters: { count: "1" } });
    expect(JSON.stringify(firstRunning[0])).not.toContain("Automatic backup in progress");
  });
});
