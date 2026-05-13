import {
  Home,
  Image,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  UserRound,
  Video,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { sidebarItems } from "../lib/navigation";

const icons = {
  home: Home,
  videos: Video,
  images: Image,
  performers: UserRound,
  settings: Settings,
};

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
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
        <div className="flex size-10 items-center justify-center rounded-2xl bg-sakura-500 text-white shadow-sm shadow-sakura-200">
          <LayoutGrid size={20} strokeWidth={2.3} />
        </div>
        {!collapsed && (
          <div>
            <p className="text-base font-semibold text-slate-950">Sakurava</p>
            <p className="text-xs text-slate-500">Private local catalog</p>
          </div>
        )}
      </div>

      <div className={collapsed ? "px-3 pb-3" : "px-4 pb-3"}>
        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={onToggleCollapsed}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-sakura-100 bg-white/80 text-sm font-semibold text-sakura-600 shadow-sm transition hover:bg-sakura-50"
        >
          <ToggleIcon size={18} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>

      <nav
        className="flex flex-1 flex-col gap-1 px-3"
        aria-label="Primary navigation"
      >
        {sidebarItems.map((item) => {
          const Icon = icons[item.icon];

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              aria-label={collapsed ? item.label : undefined}
              title={collapsed ? item.label : undefined}
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
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="m-4 rounded-lg border border-sakura-100 bg-white/80 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-sakura-600">
            Offline first
          </p>
          <p className="mt-2 text-sm leading-5 text-slate-500">
            Static frontend preview for the MVP shell.
          </p>
        </div>
      )}
    </aside>
  );
}

export default Sidebar;
