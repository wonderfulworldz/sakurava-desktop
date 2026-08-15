import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../lib/LanguageContext";
import { NotificationProvider, useNotifications } from "../notifications/NotificationProvider";
import {
  NOTIFICATION_HISTORY_STORAGE_KEY,
  type NotificationRecord,
} from "../notifications/notificationStore";
import NotificationCenter from "./NotificationCenter";

const NOW = Date.parse("2026-08-14T12:00:00.000Z");

function terminal(id: string, overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  const at = new Date(NOW).toISOString();
  return {
    id,
    producerKey: "test",
    kind: "success",
    state: "terminal",
    titleKey: "notifications.automaticBackup.completed",
    parameters: {},
    createdAt: at,
    updatedAt: at,
    terminalAt: at,
    read: false,
    ...overrides,
  };
}

function seed(records: NotificationRecord[]) {
  window.localStorage.setItem(NOTIFICATION_HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, records }));
}

function ActiveSeed({ progress }: { progress?: { current: number; total: number } }) {
  const { upsertRunning } = useNotifications();
  useEffect(() => {
    upsertRunning({ producerKey: "backup", dedupeKey: "backup", titleKey: "notifications.automaticBackup.running", progress });
  }, [progress, upsertRunning]);
  return null;
}

function renderCenter(active = false, progress?: { current: number; total: number }) {
  return render(<LanguageProvider><NotificationProvider>{active ? <ActiveSeed progress={progress} /> : null}<NotificationCenter /></NotificationProvider></LanguageProvider>);
}

describe("Notification Center", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a zero-unread bell and opens/closes with Escape while returning focus", () => {
    renderCenter();
    const bell = screen.getByRole("button", { name: "Notifications, 0 unread" });
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    fireEvent.click(bell);
    expect(screen.getByRole("dialog", { name: "Notifications" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(bell);
  });

  it("shows unread and active indicators, separates active progress, and filters issues", () => {
    seed([terminal("issue", { kind: "warning", state: "interrupted", titleKey: "notifications.automaticBackup.failed", messageKey: "notifications.interrupted.message" }), terminal("unread"), terminal("read", { read: true })]);
    renderCenter(true);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByTestId("notification-active-indicator")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 2 unread" }));
    expect(screen.getByText("Active progress")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Issues" }));
    expect(screen.getByText("The application's restart prevented the prior operation status from being confirmed.")).toBeInTheDocument();
    expect(screen.queryAllByText("Automatic backup completed")).toHaveLength(0);
  });

  it("marks terminal history read, clears one terminal item, and preserves active work on history clear", () => {
    seed([terminal("one"), terminal("two")]);
    renderCenter(true);
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 2 unread" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    expect(screen.getByRole("button", { name: "Notifications, 0 unread" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear notification" })[0]);
    expect(screen.getAllByText("Automatic backup completed")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
    const clearHistoryButtons = screen.getAllByRole("button", { name: "Clear history" });
    fireEvent.click(clearHistoryButtons[clearHistoryButtons.length - 1]);
    expect(screen.getByText("Active progress")).toBeInTheDocument();
    expect(screen.getByText("No notifications yet.")).toBeInTheDocument();
  });

  it("uses bounded Load older rendering and truthful determinate progress semantics", () => {
    const records = Array.from({ length: 101 }, (_, index) => terminal(`record-${index}`, { createdAt: new Date(NOW - index).toISOString(), updatedAt: new Date(NOW - index).toISOString(), terminalAt: new Date(NOW - index).toISOString() }));
    seed(records);
    renderCenter(true, { current: 1, total: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 101 unread" }));
    expect(screen.getByRole("progressbar", { name: "Notification progress" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getAllByText("Automatic backup completed")).toHaveLength(100);
    fireEvent.click(screen.getByRole("button", { name: "Load older" }));
    expect(screen.getAllByText("Automatic backup completed")).toHaveLength(101);
  });
});
