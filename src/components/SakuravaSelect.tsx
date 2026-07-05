import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function SakuravaSelect<T extends string | number>({
  ariaLabel,
  value,
  options,
  onChange,
  className = "w-24",
  placement = "down",
}: {
  ariaLabel: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  className?: string;
  placement?: "up" | "down";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <select
        className="sr-only"
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => {
          const next = options.find(
            (option) => String(option.value) === event.target.value,
          );
          if (next) onChange(next.value);
        }}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        aria-label={`${ariaLabel} control`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-sakura-200 hover:text-sakura-600 focus:outline-none focus:ring-4 focus:ring-sakura-100"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 flex-1 truncate text-left">{selected?.label}</span>
        <ChevronDown size={15} className={`shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          data-placement={placement}
          className={`absolute left-0 z-50 min-w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg ${
            placement === "up" ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          <div role="listbox" aria-label={`${ariaLabel} options`} className="sakurava-scrollbar max-h-56 overflow-y-auto p-1">
            {options.map((option) => (
              <button
                key={String(option.value)}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`flex min-h-9 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold transition ${
                  option.value === value
                    ? "bg-sakura-50 text-sakura-700"
                    : "text-slate-700 hover:bg-sakura-50 hover:text-sakura-700"
                }`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.value === value && <Check size={14} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
