import CategoryManagementPanel from "../components/CategoryManagementPanel";
import { Link } from "react-router-dom";

function CategoryManagementPage() {
  return (
    <div className="space-y-6">
      <header className="rounded-lg border border-slate-200 bg-white px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <nav className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase text-slate-500">
              <Link to="/settings" className="hover:text-sakura-600">
                Settings
              </Link>
              <span>/</span>
              <span>Catalog Settings</span>
            </nav>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-slate-950">
              Category Management
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Manage local Managed Categories, review Record Category usage,
              and apply confirmed record category maintenance without changing
              category storage rules.
            </p>
          </div>
          <span className="inline-flex w-fit items-center rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
            Safety gated
          </span>
        </div>
      </header>
      <CategoryManagementPanel />
    </div>
  );
}

export default CategoryManagementPage;
