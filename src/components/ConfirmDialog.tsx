import { type ReactNode, useEffect, useId, useRef } from "react";

type ConfirmDialogVariant = "default" | "destructive";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
  pending?: boolean;
  pendingLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  variant = "default",
  pending = false,
  pendingLabel,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const pendingRef = useRef(pending);
  const onCancelRef = useRef(onCancel);
  pendingRef.current = pending;
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) {
      return;
    }

    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    cancelButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pendingRef.current) {
        onCancelRef.current();
        return;
      }
      if (event.key === "Tab") {
        const focusable = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        );
        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const confirmClass =
    variant === "destructive"
      ? "bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-200"
      : "bg-sakura-500 text-white hover:bg-sakura-600 focus:ring-sakura-100";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6"
      data-testid="confirm-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          onCancel();
        }
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-2xl"
      >
        <h2 id={titleId} className="text-lg font-semibold text-slate-950">
          {title}
        </h2>
        <div id={descriptionId} className="mt-2 text-sm leading-6 text-slate-600">
          {description}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-sakura-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold shadow-sm transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${confirmClass}`}
          >
            {pending ? pendingLabel ?? confirmLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export default ConfirmDialog;
