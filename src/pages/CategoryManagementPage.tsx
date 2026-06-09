import CategoryManagementPanel from "../components/CategoryManagementPanel";

function CategoryManagementPage() {
  return (
    <div className="space-y-6" data-testid="category-management-route-page">
      <CategoryManagementPanel />
    </div>
  );
}

export default CategoryManagementPage;
