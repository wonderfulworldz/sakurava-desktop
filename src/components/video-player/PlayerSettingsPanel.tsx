import { useEffect, type ReactNode } from "react";

export const PLAYER_AUXILIARY_GLASS_STRUCTURE_CLASS =
  "flex h-screen min-h-0 w-full flex-col overflow-hidden font-sans text-sm text-slate-950 shadow-2xl backdrop-blur-xl dark:text-white";

export const PLAYER_AUXILIARY_GLASS_CLASS =
  `${PLAYER_AUXILIARY_GLASS_STRUCTURE_CLASS} bg-white/80 dark:bg-slate-950/80`;

export function useTransparentPlayerAuxiliaryDocument() {
  useEffect(() => {
    const root = document.getElementById("root");
    const previous = {
      html: document.documentElement.style.background,
      body: document.body.style.background,
      root: root?.style.background ?? "",
    };
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    if (root) root.style.background = "transparent";
    return () => {
      document.documentElement.style.background = previous.html;
      document.body.style.background = previous.body;
      if (root) root.style.background = previous.root;
    };
  }, []);
}

export default function PlayerSettingsPanel({
  title,
  description,
  onClose,
  children,
  footer,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useTransparentPlayerAuxiliaryDocument();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <main
      role="dialog"
      aria-modal="false"
      aria-label={title}
      className={PLAYER_AUXILIARY_GLASS_CLASS}
      data-auxiliary-window="video-player-utility"
      data-material="sakurava-true-glass"
      data-surface-opacity="80"
      data-theme-source="sakurava-appearance"
      data-testid="player-settings-panel"
      data-player-overlay="utility-window"
    >
      <header className="shrink-0 border-b border-slate-300/90 px-6 py-4 dark:border-slate-600/90">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">{title}</h2>
          {description ? <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">{description}</p> : null}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      {footer ? <footer className="shrink-0 border-t border-slate-300/90 px-6 py-4 dark:border-slate-600/90">{footer}</footer> : null}
    </main>
  );
}
