export const NOTIFICATION_HISTORY_STORAGE_KEY = "sakurava.notificationHistory.v1";
export const NOTIFICATION_HISTORY_VERSION = 1 as const;
export const NOTIFICATION_TERMINAL_LIMIT = 500;
export const NOTIFICATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type NotificationKind = "info" | "success" | "warning" | "error" | "progress";
export type NotificationState = "running" | "terminal" | "interrupted";

export type NotificationProgress = {
  readonly current: number;
  readonly total: number;
};

export type NotificationRecord = {
  readonly id: string;
  readonly producerKey: string;
  readonly dedupeKey?: string;
  readonly kind: NotificationKind;
  readonly state: NotificationState;
  readonly titleKey: string;
  readonly messageKey?: string;
  readonly parameters: Readonly<Record<string, string>>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly terminalAt?: string;
  readonly read: boolean;
  readonly progress?: NotificationProgress;
};

type PersistedHistory = {
  readonly version: typeof NOTIFICATION_HISTORY_VERSION;
  readonly records: readonly NotificationRecord[];
};

export type NotificationStorage = Pick<Storage, "getItem" | "setItem">;

export type RunningNotificationInput = {
  readonly producerKey: string;
  readonly dedupeKey: string;
  readonly titleKey: string;
  readonly messageKey?: string;
  readonly parameters?: Readonly<Record<string, string>>;
  readonly progress?: NotificationProgress;
};

export type TerminalNotificationInput = Omit<RunningNotificationInput, "dedupeKey" | "progress"> & {
  readonly kind: Exclude<NotificationKind, "progress">;
  readonly messageKey?: string;
};

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function safeParameters(value: unknown): value is Readonly<Record<string, string>> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.entries(value).every(
        ([key, parameter]) => key.length > 0 && key.length <= 64 && typeof parameter === "string" && parameter.length <= 240,
      ),
  );
}

function safeProgress(value: unknown): value is NotificationProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const progress = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(progress.current) &&
    Number.isSafeInteger(progress.total) &&
    (progress.current as number) >= 0 &&
    (progress.total as number) > 0 &&
    (progress.current as number) <= (progress.total as number)
  );
}

function isNotificationKind(value: unknown): value is NotificationKind {
  return value === "info" || value === "success" || value === "warning" || value === "error" || value === "progress";
}

function isNotificationState(value: unknown): value is NotificationState {
  return value === "running" || value === "terminal" || value === "interrupted";
}

function validRecord(value: unknown): value is NotificationRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    !record.id ||
    typeof record.producerKey !== "string" ||
    !record.producerKey ||
    (record.dedupeKey !== undefined && typeof record.dedupeKey !== "string") ||
    !isNotificationKind(record.kind) ||
    !isNotificationState(record.state) ||
    typeof record.titleKey !== "string" ||
    !record.titleKey ||
    (record.messageKey !== undefined && typeof record.messageKey !== "string") ||
    !safeParameters(record.parameters) ||
    !validTimestamp(record.createdAt) ||
    !validTimestamp(record.updatedAt) ||
    (record.terminalAt !== undefined && !validTimestamp(record.terminalAt)) ||
    typeof record.read !== "boolean" ||
    (record.progress !== undefined && !safeProgress(record.progress))
  ) {
    return false;
  }
  if (record.state === "running") return record.kind === "progress" && record.terminalAt === undefined;
  return record.kind !== "progress" && validTimestamp(record.terminalAt);
}

function timestamp(now: number) {
  return new Date(now).toISOString();
}

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `notification-${crypto.randomUUID()}`;
  }
  return `notification-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function terminalTime(record: NotificationRecord) {
  return Date.parse(record.terminalAt ?? record.updatedAt);
}

export function pruneNotificationHistory(
  records: readonly NotificationRecord[],
  now = Date.now(),
): NotificationRecord[] {
  const cutoff = now - NOTIFICATION_RETENTION_MS;
  const running = records.filter((record) => record.state === "running");
  const terminal = records
    .filter((record) => record.state !== "running" && terminalTime(record) >= cutoff)
    .sort((left, right) => terminalTime(right) - terminalTime(left) || right.id.localeCompare(left.id))
    .slice(0, NOTIFICATION_TERMINAL_LIMIT);
  return [...running, ...terminal];
}

export function hydrateNotificationHistory(
  storage: Pick<Storage, "getItem"> | null,
  now = Date.now(),
): NotificationRecord[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(NOTIFICATION_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    const history = parsed as Partial<PersistedHistory>;
    if (history.version !== NOTIFICATION_HISTORY_VERSION || !Array.isArray(history.records)) return [];
    const records = history.records.filter(validRecord).map((record) => {
      if (record.state !== "running") return record;
      const at = timestamp(now);
      return {
        ...record,
        kind: "warning" as const,
        state: "interrupted" as const,
        messageKey: "notifications.interrupted.message",
        updatedAt: at,
        terminalAt: at,
        read: false,
        progress: undefined,
      };
    });
    return pruneNotificationHistory(records, now);
  } catch {
    return [];
  }
}

export function persistNotificationHistory(
  storage: NotificationStorage | null,
  records: readonly NotificationRecord[],
  now = Date.now(),
) {
  if (!storage) return false;
  try {
    const payload: PersistedHistory = {
      version: NOTIFICATION_HISTORY_VERSION,
      records: pruneNotificationHistory(records, now),
    };
    storage.setItem(NOTIFICATION_HISTORY_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function upsertRunningNotification(
  records: readonly NotificationRecord[],
  input: RunningNotificationInput,
  now = Date.now(),
): NotificationRecord[] {
  const at = timestamp(now);
  const existing = records.find((record) => record.state === "running" && record.dedupeKey === input.dedupeKey);
  if (existing) {
    return records.map((record) =>
      record.id === existing.id
        ? {
            ...record,
            titleKey: input.titleKey,
            messageKey: input.messageKey,
            parameters: { ...(input.parameters ?? {}) },
            progress: input.progress,
            updatedAt: at,
          }
        : record,
    );
  }
  return [
    ...records,
    {
      id: generateId(),
      producerKey: input.producerKey,
      dedupeKey: input.dedupeKey,
      kind: "progress",
      state: "running",
      titleKey: input.titleKey,
      messageKey: input.messageKey,
      parameters: { ...(input.parameters ?? {}) },
      createdAt: at,
      updatedAt: at,
      read: true,
      progress: input.progress,
    },
  ];
}

export function completeRunningNotification(
  records: readonly NotificationRecord[],
  dedupeKey: string,
  input: TerminalNotificationInput,
  now = Date.now(),
): { records: NotificationRecord[]; transitioned: NotificationRecord | null } {
  const active = records.find((record) => record.state === "running" && record.dedupeKey === dedupeKey);
  if (!active) return { records: [...records], transitioned: null };
  const at = timestamp(now);
  const transitioned: NotificationRecord = {
    ...active,
    kind: input.kind,
    state: "terminal",
    titleKey: input.titleKey,
    messageKey: input.messageKey,
    parameters: { ...(input.parameters ?? {}) },
    updatedAt: at,
    terminalAt: at,
    read: false,
    progress: undefined,
  };
  return {
    records: records.map((record) => (record.id === active.id ? transitioned : record)),
    transitioned,
  };
}

export function markAllNotificationsRead(records: readonly NotificationRecord[]) {
  return records.map((record) => (record.state === "running" ? record : { ...record, read: true }));
}

export function markNotificationRead(records: readonly NotificationRecord[], id: string) {
  return records.map((record) => (record.id === id && record.state !== "running" ? { ...record, read: true } : record));
}

export function clearNotification(records: readonly NotificationRecord[], id: string) {
  return records.filter((record) => record.id !== id || record.state === "running");
}

export function clearNotificationHistory(records: readonly NotificationRecord[]) {
  return records.filter((record) => record.state === "running");
}

export function unreadTerminalNotificationCount(records: readonly NotificationRecord[]) {
  return records.filter((record) => record.state !== "running" && !record.read).length;
}

export function issueNotifications(records: readonly NotificationRecord[]) {
  return records.filter((record) => record.state === "interrupted" || record.kind === "warning" || record.kind === "error");
}
