import PageHeader from "../components/PageHeader";

type RouteStubPageProps = {
  title: string;
  subtitle: string;
  label: string;
};

function RouteStubPage({ title, subtitle, label }: RouteStubPageProps) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={subtitle} />
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sakura-600">
          Route stub
        </p>
        <h2 className="mt-3 text-xl font-semibold tracking-normal text-slate-950">
          {label}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          This route is intentionally a placeholder in Frontend Static Batch A.
        </p>
      </section>
    </div>
  );
}

export default RouteStubPage;
