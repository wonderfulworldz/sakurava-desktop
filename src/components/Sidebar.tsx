import {
  Home,
  Image,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Tags,
  UserRound,
  Video,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useLanguage } from "../lib/LanguageContext";
import { sidebarItems } from "../lib/navigation";

const icons = {
  home: Home,
  videos: Video,
  images: Image,
  performers: UserRound,
  categories: Tags,
  settings: Settings,
};

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
  const { t } = useLanguage();
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      className={[
        "flex shrink-0 flex-col border-r border-sakura-100 bg-gradient-to-b from-sakura-50 via-white to-white transition-[width]",
        collapsed ? "w-20" : "w-64",
      ].join(" ")}
    >
      <div
        className={[
          "flex h-20 items-center gap-3",
          collapsed ? "justify-center px-3" : "px-5",
        ].join(" ")}
      >
        <div className="flex size-11 items-center justify-center">
          <img
            src="/assets/sakurava-icon.svg"
            alt="Sakurava logo"
            className="size-10 object-contain"
            draggable={false}
          />
        </div>
        {!collapsed && (
          <div>
            <p className="text-base font-semibold text-slate-950">Sakurava</p>
            <p className="text-xs text-slate-500">{t("app.sidebar.subtitle")}</p>
          </div>
        )}
      </div>

      <div className={collapsed ? "px-3 pb-3" : "px-4 pb-3"}>
        <button
          type="button"
          aria-label={
            collapsed ? t("app.sidebar.expand") : t("app.sidebar.collapse")
          }
          onClick={onToggleCollapsed}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-sakura-100 bg-white/80 text-sm font-semibold text-sakura-600 shadow-sm transition hover:bg-sakura-50"
        >
          <ToggleIcon size={18} />
          {!collapsed && <span>{t("app.sidebar.collapse")}</span>}
        </button>
      </div>

      <nav
        className="flex flex-1 flex-col gap-1 px-3"
        aria-label="Primary navigation"
      >
        {sidebarItems.map((item) => {
          const Icon = icons[item.icon];
          const label = t(item.labelKey);
          const navigationLabel = t("app.sidebar.navigateTo", { label });

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              aria-label={collapsed ? navigationLabel : undefined}
              title={collapsed ? navigationLabel : undefined}
              className={({ isActive }) =>
                [
                  "flex h-11 items-center rounded-lg text-sm font-medium transition",
                  collapsed ? "justify-center px-0" : "gap-3 px-3",
                  isActive
                    ? "bg-sakura-100 text-sakura-600"
                    : "text-slate-600 hover:bg-white hover:text-slate-950",
                ].join(" ")
              }
            >
              <Icon size={18} strokeWidth={2.1} />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}

export default Sidebar;
