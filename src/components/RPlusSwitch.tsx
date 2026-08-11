type RPlusSwitchProps = {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

/** Shared direct R+ control for every catalog form. */
export default function RPlusSwitch({
  checked,
  label,
  onChange,
  disabled = false,
}: RPlusSwitchProps) {
  return (
    <div className="flex h-11 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sakura-200 disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? "bg-sakura-500" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
