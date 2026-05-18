import CategoryManagementPanel from "../components/CategoryManagementPanel";

function CategoryManagementPage() {
  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <header className="px-1 py-2">
        <div className="flex flex-col gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
              Category Management
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Create, edit, and clean up categories used by Videos, Images, and
              Performers.
            </p>
          </div>
        </div>
      </header>
      <CategoryManagementPanel />
    </div>
  );
}

export default CategoryManagementPage;
