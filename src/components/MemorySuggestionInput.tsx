import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  value: string;
  suggestions: string[];
  ariaLabel: string;
  suggestionAriaLabel?: string;
  className: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onRemoveSuggestion?: (suggestion: string) => void;
  isSuggestionRemovable?: (suggestion: string) => boolean;
};

export default function MemorySuggestionInput({
  value,
  suggestions,
  ariaLabel,
  suggestionAriaLabel,
  className,
  placeholder,
  disabled,
  onChange,
  onRemoveSuggestion,
  isSuggestionRemovable,
}: Props) {
  const [open, setOpen] = useState(false);
  const [popupRect, setPopupRect] = useState<DOMRect | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<number | null>(null);
  const popupId = useId();

  useEffect(() => () => {
    if (blurTimerRef.current !== null) {
      window.clearTimeout(blurTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const close = () => setOpen(false);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const popup = document.querySelector(
        `[data-memory-popup="${popupId}"]`,
      );
      if (
        target &&
        !inputRef.current?.contains(target) &&
        !popup?.contains(target)
      ) {
        close();
      }
    };

    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open, popupId]);

  return (
    <span className="relative block min-w-0 flex-1">
      <input
        ref={inputRef}
        className={className}
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        onFocus={(event) => {
          setPopupRect(event.currentTarget.getBoundingClientRect());
          setOpen(true);
        }}
        onBlur={() => {
          if (blurTimerRef.current !== null) {
            window.clearTimeout(blurTimerRef.current);
          }
          blurTimerRef.current = window.setTimeout(() => {
            blurTimerRef.current = null;
            setOpen(false);
          }, 100);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
      />
      {!disabled && open && popupRect && suggestions.length > 0 &&
        createPortal(
        <span
          data-memory-popup={popupId}
          role="listbox"
          aria-label={suggestionAriaLabel ?? `${ariaLabel} suggestions`}
          className="fixed z-[100] max-h-72 overflow-y-auto overflow-x-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          style={{
            left: popupRect.left,
            top: popupRect.bottom + 4,
            width: popupRect.width,
          }}
        >
          {suggestions.map((suggestion) => (
            <span key={suggestion} className="flex items-center gap-2 px-2 py-1">
              <button
                type="button"
                className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-xs font-semibold text-slate-600 hover:bg-sakura-50 hover:text-sakura-600"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(suggestion);
                  setOpen(false);
                }}
              >
                {suggestion}
              </button>
              {onRemoveSuggestion &&
                (isSuggestionRemovable?.(suggestion) ?? true) && (
                <button
                  type="button"
                  className="inline-flex size-5 items-center justify-center rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label={`Remove ${ariaLabel} suggestion ${suggestion}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onRemoveSuggestion(suggestion)}
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </span>,
        document.body,
      )}
    </span>
  );
}
