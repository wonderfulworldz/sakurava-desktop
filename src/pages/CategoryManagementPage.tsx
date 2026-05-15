import CategoryManagementPanel from "../components/CategoryManagementPanel";
import PageHeader from "../components/PageHeader";

function CategoryManagementPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Category Management"
        subtitle="Manage local category vocabulary, audit Record Categories, and apply confirmed record category maintenance."
      />
      <CategoryManagementPanel />
    </div>
  );
}

export default CategoryManagementPage;
