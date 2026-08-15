import { useEffect } from "react";

import {
  AUTOMATIC_BACKUP_RESULT_EVENT,
  type AutomaticBackupResultDetail,
} from "../lib/automaticBackup";
import { useNotifications } from "./NotificationProvider";

const DEDUPE_KEY = "automatic-backup";

export default function AutomaticBackupNotificationAdapter() {
  const { completeRunning, upsertRunning } = useNotifications();

  useEffect(() => {
    const handleResult = (event: Event) => {
      const detail = (event as CustomEvent<AutomaticBackupResultDetail>).detail;
      if (!detail) return;
      if (detail.state === "pending") {
        upsertRunning({
          producerKey: "automatic-backup",
          dedupeKey: DEDUPE_KEY,
          titleKey: "notifications.automaticBackup.running",
        });
        return;
      }
      completeRunning(DEDUPE_KEY, {
        producerKey: "automatic-backup",
        kind: detail.state === "success" ? "success" : "error",
        titleKey: detail.state === "success"
          ? "notifications.automaticBackup.completed"
          : "notifications.automaticBackup.failed",
      });
    };
    window.addEventListener(AUTOMATIC_BACKUP_RESULT_EVENT, handleResult);
    return () => window.removeEventListener(AUTOMATIC_BACKUP_RESULT_EVENT, handleResult);
  }, [completeRunning, upsertRunning]);

  return null;
}
