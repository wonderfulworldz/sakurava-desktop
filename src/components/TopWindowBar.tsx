function TopWindowBar() {
  return (
    <header className="flex h-10 shrink-0 items-center justify-between border-b border-slate-200 bg-white/90 px-4">
      <div className="text-sm font-medium text-slate-700">Sakurava</div>
      <div className="flex items-center gap-2" aria-label="Window controls placeholder">
        <span className="size-3 rounded-full bg-slate-200" />
        <span className="size-3 rounded-full bg-slate-200" />
        <span className="size-3 rounded-full bg-sakura-200" />
      </div>
    </header>
  );
}

export default TopWindowBar;
