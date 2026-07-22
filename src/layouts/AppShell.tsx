import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import { useLanguage } from "../lib/LanguageContext";

function pageTitleFromPath(pathname: string, t: (key: string) => string) {
  if (pathname === "/") {
    return t("nav.home");
  }

  if (pathname.startsWith("/videos")) {
    return t("nav.videos");
  }

  if (pathname.startsWith("/images")) {
    return t("nav.images");
  }

  if (pathname.startsWith("/performers")) {
    return t("nav.performers");
  }

  if (pathname.startsWith("/settings/category-management")) {
    return "Category";
  }

  if (pathname.startsWith("/glossary")) {
    return "Glossary Library";
  }

  if (pathname.startsWith("/categories")) {
    return "Category";
  }

  if (pathname.startsWith("/settings")) {
    return t("nav.settings");
  }

  return t("nav.home");
}

function AppShell() {
  const location = useLocation();
  const { t } = useLanguage();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  useEffect(() => {
    document.title = `Sakurava - ${pageTitleFromPath(location.pathname, t)}`;
  }, [location.pathname, t]);

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
    </div>
  );
}

export default AppShell;
