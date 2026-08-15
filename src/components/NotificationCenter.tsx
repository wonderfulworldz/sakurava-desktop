import { Bell, CheckCircle2, CircleAlert, CircleX, Clock3, LoaderCircle, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import ConfirmDialog from "./ConfirmDialog";
import { useLanguage, useTranslation } from "../lib/LanguageContext";
import { useNotifications } from "../notifications/NotificationProvider";
import { issueNotifications, type NotificationRecord } from "../notifications/notificationStore";

type Filter = "all" | "unread" | "issues";
const TERMINAL_BATCH_SIZE = 100;

function relativeTime(value: string, languageCode: string) {
  const delta = Date.parse(value) - Date.now();
  const minutes = Math.round(delta / 60_000);
  const unit = Math.abs(minutes) < 60 ? "minute" : Math.abs(minutes) < 24 * 60 ? "hour" : "day";
  const divisor = unit === "minute" ? 1 : unit === "hour" ? 60 : 24 * 60;
  try {
    return new Intl.RelativeTimeFormat(languageCode, { numeric: "auto" }).format(Math.round(minutes / divisor), unit);
  } catch {
    return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(Math.round(minutes / divisor), unit);
  }
}

function NotificationIcon({ record }: { record: NotificationRecord }) {
  if (record.state === "running") return <LoaderCircle size={16} aria-hidden="true" className="text-sakura-600 motion-reduce:animate-none" />;
  if (record.state === "interrupted") return <CircleAlert size={16} aria-hidden="true" className="text-amber-700" />;
  if (record.kind === "success") return <CheckCircle2 size={16} aria-hidden="true" className="text-emerald-700" />;
  if (record.kind === "error") return <CircleX size={16} aria-hidden="true" className="text-rose-700" />;
  return <CircleAlert size={16} aria-hidden="true" className="text-amber-700" />;
}

function NotificationToast() {
  const t = useTranslation();
  const { dismissToast, toast } = useNotifications();

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(dismissToast, toast.kind === "error" ? 9_000 : 4_500);
    return () => window.clearTimeout(timeout);
  }, [dismissToast, toast]);

  if (!toast) return null;
  const isError = toast.kind === "error";
  return (
    <div className="pointer-events-none fixed right-5 top-[4.25rem] z-[80] w-[min(24rem,calc(100vw-2.5rem))]">
      <div role={isError ? "alert" : "status"} aria-live={isError ? "assertive" : "polite"} className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-lg ${isError ? "border-rose-200 text-rose-700" : "border-emerald-200 text-emerald-700"}`}>
        <NotificationIcon record={toast} />
        <p className="min-w-0 flex-1 text-sm font-semibold">{t(toast.titleKey, toast.parameters)}</p>
        <button type="button" aria-label={t("notifications.toast.close")} onClick={dismissToast} className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export default function NotificationCenter() {
  const { languageCode } = useLanguage();
  const t = useTranslation();
  const { clearHistory, clearOne, dismissToast, markAllRead, markRead, records, toast, unreadCount } = useNotifications();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [visibleCount, setVisibleCount] = useState(TERMINAL_BATCH_SIZE);
  const [clearConfirmationOpen, setClearConfirmationOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const panelId = useId();

  const active = records.filter((record) => record.state === "running");
  const terminal = records
    .filter((record) => record.state !== "running")
    .sort((left, right) => Date.parse(right.terminalAt ?? right.updatedAt) - Date.parse(left.terminalAt ?? left.updatedAt));
  const filtered = filter === "unread"
    ? terminal.filter((record) => !record.read)
    : filter === "issues"
      ? issueNotifications(terminal)
      : terminal;
  const visible = filtered.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount(TERMINAL_BATCH_SIZE);
  }, [filter]);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => panelRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus());
    const closeOnOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target) && !bellRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
      bellRef.current?.focus();
    };
  }, [open]);

  const renderProgress = (record: NotificationRecord) => {
    if (!record.progress) return <p className="mt-1 text-xs text-slate-500">{t("notifications.progress.indeterminate")}</p>;
    const percent = Math.round((record.progress.current / record.progress.total) * 100);
    return <div className="mt-2"><div role="progressbar" aria-label={t("notifications.progress.label")} aria-valuemin={0} aria-valuemax={record.progress.total} aria-valuenow={record.progress.current} className="h-1.5 overflow-hidden rounded-full bg-sakura-50"><div className="h-full bg-sakura-500 motion-reduce:transition-none" style={{ width: `${percent}%` }} /></div><p className="mt-1 text-xs text-slate-500">{t("notifications.progress.count", { current: String(record.progress.current), total: String(record.progress.total) })}</p></div>;
  };

  return (
    <>
      <button ref={bellRef} type="button" aria-label={t("notifications.bell.label", { count: String(unreadCount) })} aria-expanded={open} aria-controls={panelId} onClick={() => { dismissToast(); setOpen((current) => !current); }} className="fixed right-5 top-5 z-[90] inline-flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-sakura-200 hover:bg-sakura-50 hover:text-sakura-600 focus:outline-none focus:ring-4 focus:ring-sakura-100">
        <Bell size={19} aria-hidden="true" />
        {active.length > 0 ? <span data-testid="notification-active-indicator" className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-sakura-500" /> : null}
        {unreadCount > 0 ? <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold leading-5 text-white">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
      </button>
      {open ? <section id={panelId} ref={panelRef} role="dialog" aria-label={t("notifications.title")} className="fixed right-5 top-[3.75rem] z-[90] flex max-h-[min(70dvh,34rem)] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3"><h2 className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{t("notifications.title")}</h2><button type="button" disabled={terminal.length === 0 || unreadCount === 0} onClick={markAllRead} className="text-xs font-semibold text-sakura-600 disabled:text-slate-400">{t("notifications.markAllRead")}</button><button type="button" disabled={terminal.length === 0} onClick={() => setClearConfirmationOpen(true)} className="text-xs font-semibold text-slate-500 disabled:text-slate-400">{t("notifications.clearHistory")}</button></header>
        <div className="sakurava-scrollbar min-h-0 overflow-y-auto p-3">
          {active.length > 0 ? <section aria-label={t("notifications.activeTitle")} className="mb-3 rounded-lg border border-sakura-100 bg-sakura-50/50 p-3"><h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sakura-700"><Clock3 size={14} aria-hidden="true" />{t("notifications.activeTitle")}</h3>{active.map((record) => <div key={record.id} className="mt-2 rounded-md bg-white px-3 py-2"><div className="flex items-start gap-2"><NotificationIcon record={record} /><div className="min-w-0"><p className="text-sm font-semibold text-slate-800">{t(record.titleKey, record.parameters)}</p>{record.messageKey ? <p className="mt-0.5 text-xs text-slate-500">{t(record.messageKey, record.parameters)}</p> : null}{renderProgress(record)}</div></div></div>)}</section> : null}
          <div className="mb-3 flex gap-1 rounded-lg bg-slate-50 p-1" role="group" aria-label={t("notifications.filters.label")}>{(["all", "unread", "issues"] as const).map((mode) => <button key={mode} type="button" onClick={() => setFilter(mode)} className={`min-h-8 flex-1 rounded-md px-2 text-xs font-semibold ${filter === mode ? "bg-white text-sakura-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{t(`notifications.filters.${mode}`)}</button>)}</div>
          {visible.length === 0 ? <p className="px-2 py-8 text-center text-sm text-slate-500">{t(filter === "all" ? "notifications.empty.all" : filter === "unread" ? "notifications.empty.unread" : "notifications.empty.issues")}</p> : <div className="grid gap-1">{visible.map((record) => <div key={record.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${record.read ? "border-transparent" : "border-sakura-100 bg-sakura-50/40"}`}><button type="button" onClick={() => markRead(record.id)} className="flex min-w-0 flex-1 items-start gap-2 text-left"><NotificationIcon record={record} /><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-slate-800">{t(record.titleKey, record.parameters)}</span>{!record.read ? <span className="size-1.5 shrink-0 rounded-full bg-sakura-500" aria-label={t("notifications.unread")} /> : null}</span>{record.messageKey ? <span className="mt-0.5 block text-xs text-slate-500">{t(record.messageKey, record.parameters)}</span> : null}<time dateTime={record.terminalAt ?? record.updatedAt} title={new Date(record.terminalAt ?? record.updatedAt).toLocaleString(languageCode)} className="mt-1 block text-[11px] text-slate-400">{relativeTime(record.terminalAt ?? record.updatedAt, languageCode)}</time></span></button><button type="button" aria-label={t("notifications.clearOne")} onClick={() => clearOne(record.id)} className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Trash2 size={14} aria-hidden="true" /></button></div>)}</div>}
          {visible.length < filtered.length ? <button type="button" onClick={() => setVisibleCount((count) => count + TERMINAL_BATCH_SIZE)} className="mt-3 h-9 w-full rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">{t("notifications.loadOlder")}</button> : null}
        </div>
      </section> : null}
      {!open ? <NotificationToast /> : null}
      <ConfirmDialog open={clearConfirmationOpen} title={t("notifications.clearConfirm.title")} description={t("notifications.clearConfirm.body")} confirmLabel={t("notifications.clearHistory")} variant="destructive" onCancel={() => setClearConfirmationOpen(false)} onConfirm={() => { clearHistory(); setClearConfirmationOpen(false); }} />
    </>
  );
}
