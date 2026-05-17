import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import BottomStatusBar from "../components/BottomStatusBar";
import Sidebar from "../components/Sidebar";

function pageTitleFromPath(pathname: string) {
  if (pathname === "/") {
    return "Home";
  }

  if (pathname.startsWith("/videos")) {
    return "Videos";
  }

  if (pathname.startsWith("/images")) {
    return "Images";
  }

  if (pathname.startsWith("/performers")) {
    return "Performers";
  }

  if (pathname.startsWith("/categories")) {
    return "Categories";
  }

  if (pathname.startsWith("/settings/category-management")) {
    return "Category Management";
  }

  if (pathname.startsWith("/settings")) {
    return "Settings";
  }

  return "Home";
}

function AppShell() {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  useEffect(() => {
    document.title = `Sakurava - ${pageTitleFromPath(location.pathname)}`;
  }, [location.pathname]);

  return (
    <div className="flex h-screen min-h-0 flex-col bg-slate-50 text-slate-950">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((collapsed) => !collapsed)}
        />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-6 py-6">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomStatusBar />
    </div>
  );
}

export default AppShell;
