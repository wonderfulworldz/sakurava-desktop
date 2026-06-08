function GlossaryPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-lg border border-sakura-100 bg-white px-6 py-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-sakura-600">
            Reference Library
          </p>
          <div>
            <h1 className="text-3xl font-semibold text-slate-950">
              Glossary Library
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Store and manage definitions, references, and terms for your
              personal use.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled
          className="inline-flex h-10 items-center justify-center rounded-lg border border-sakura-200 bg-sakura-50 px-4 text-sm font-semibold text-sakura-500 shadow-sm opacity-75"
        >
          Add Entry
        </button>
      </header>

      <section
        className="rounded-lg border border-dashed border-sakura-200 bg-sakura-50/60 px-6 py-5"
        aria-labelledby="glossary-form-shell-title"
      >
        <div className="flex flex-col gap-2">
          <h2
            id="glossary-form-shell-title"
            className="text-lg font-semibold text-slate-950"
          >
            Add/Edit Glossary Entry
          </h2>
          <p className="max-w-3xl text-sm text-slate-600">
            The entry form will live here in the next UI batch. This shell does
            not save entries, update records, or write to storage.
          </p>
        </div>
      </section>

      <section
        className="rounded-lg border border-slate-200 bg-white shadow-sm"
        aria-labelledby="glossary-table-shell-title"
      >
        <div className="border-b border-slate-200 px-6 py-4">
          <h2
            id="glossary-table-shell-title"
            className="text-lg font-semibold text-slate-950"
          >
            Glossary Entries
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Search, filters, sorting, rows per page, and table rows are planned
            for the next Glossary UI batches.
          </p>
        </div>
        <div className="flex min-h-56 items-center justify-center px-6 py-12">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-lg bg-sakura-50 text-sakura-600">
              GL
            </div>
            <h3 className="text-base font-semibold text-slate-950">
              No glossary entries yet
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Glossary data has not been implemented yet. Entries will appear
              here after storage and CRUD are approved.
            </p>
          </div>
        </div>
      </section>

      <footer className="rounded-lg border border-sakura-100 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">
        Glossary entries are independent from Video, Image, Performer, and
        Category catalog metadata.
      </footer>
    </div>
  );
}

export default GlossaryPage;
