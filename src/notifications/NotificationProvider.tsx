import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import {
  clearNotification,
  clearNotificationHistory,
  completeRunningNotification,
  hydrateNotificationHistory,
  markAllNotificationsRead,
  markNotificationRead,
  persistNotificationHistory,
  type NotificationRecord,
  type RunningNotificationInput,
  type TerminalNotificationInput,
  unreadTerminalNotificationCount,
  upsertRunningNotification,
} from "./notificationStore";

type NotificationContextValue = {
  records: readonly NotificationRecord[];
  unreadCount: number;
  toast: NotificationRecord | null;
  upsertRunning: (input: RunningNotificationInput) => void;
  completeRunning: (dedupeKey: string, input: TerminalNotificationInput) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearOne: (id: string) => void;
  clearHistory: () => void;
  dismissToast: () => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

function storage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<NotificationRecord[]>(() => {
    const target = storage();
    const hydrated = hydrateNotificationHistory(target);
    persistNotificationHistory(target, hydrated);
    return hydrated;
  });
  const [toast, setToast] = useState<NotificationRecord | null>(null);

  const commit = useCallback((next: NotificationRecord[]) => {
    persistNotificationHistory(storage(), next);
    setRecords(next);
  }, []);

  const upsertRunning = useCallback((input: RunningNotificationInput) => {
    setRecords((current) => {
      const next = upsertRunningNotification(current, input);
      persistNotificationHistory(storage(), next);
      return next;
    });
  }, []);

  const completeRunning = useCallback((dedupeKey: string, input: TerminalNotificationInput) => {
    setRecords((current) => {
      const completed = completeRunningNotification(current, dedupeKey, input);
      if (completed.transitioned) setToast(completed.transitioned);
      persistNotificationHistory(storage(), completed.records);
      return completed.records;
    });
  }, []);

  const value = useMemo<NotificationContextValue>(() => ({
    records,
    unreadCount: unreadTerminalNotificationCount(records),
    toast,
    upsertRunning,
    completeRunning,
    markRead: (id) => commit(markNotificationRead(records, id)),
    markAllRead: () => commit(markAllNotificationsRead(records)),
    clearOne: (id) => commit(clearNotification(records, id)),
    clearHistory: () => commit(clearNotificationHistory(records)),
    dismissToast: () => setToast(null),
  }), [commit, completeRunning, records, toast, upsertRunning]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("NotificationProvider is required.");
  return context;
}
