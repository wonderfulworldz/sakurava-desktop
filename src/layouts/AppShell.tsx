import { Outlet } from "react-router-dom";
import { useState } from "react";
import BottomStatusBar from "../components/BottomStatusBar";
import Sidebar from "../components/Sidebar";

function AppShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
