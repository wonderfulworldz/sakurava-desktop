import { ArrowLeft, CheckCircle2, Plus, Save, X } from "lucide-react";
import {
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
  useState,
} from "react";
import { Link } from "react-router-dom";
import type {
  FormConfig,
  FormMode,
  ReadOnlyField,
  TextField,
} from "../lib/formData";

type FormPageProps = {
  config: FormConfig;
  mode: FormMode;
};

type FormValues = Record<string, string | boolean>;

function FormPage({ config, mode }: FormPageProps) {
  const [values, setValues] = useState<FormValues>(config.initialValues[mode]);
  const [categories, setCategories] = useState<string[]>(
    config.initialCategories[mode],
  );
  const [aliases, setAliases] = useState<string[]>(
    config.initialAliases?.[mode] ?? [],
  );
  const [categoryDraft, setCategoryDraft] = useState("");
  const [aliasDraft, setAliasDraft] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "error" | "saved">("idle");

  const title = mode === "create" ? config.createTitle : config.editTitle;
  const subtitle =
    mode === "create" ? config.createSubtitle : config.editSubtitle;
  const formLabel = mode === "create" ? config.createLabel : config.editLabel;
  const cancelTo =
    mode === "create" ? config.createCancelTo : config.editCancelTo;

  function updateValue(name: string, value: string | boolean) {
    setValues((current) => ({ ...current, [name]: value }));
    setSaveState("idle");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requiredValue = values[config.requiredField];

    if (typeof requiredValue !== "string" || requiredValue.trim() === "") {
      setSaveState("error");
      return;
    }

    setSaveState("saved");
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <FormHeader
        backLabel={
          mode === "create"
            ? `Back to ${collectionLabel(config.kind)}`
            : config.editBackLabel
        }
        backTo={cancelTo}
        title={title}
        subtitle={subtitle}
        formLabel={formLabel}
      />

      <FormSection index={1} title="Basic Identity">
        <FieldGrid>
          {config.basicFields.map((field) => (
            <TextInput
              key={field.name}
              field={field}
              value={String(values[field.name] ?? "")}
              onChange={(value) => updateValue(field.name, value)}
            />
          ))}
          <CheckboxInput
            checked={Boolean(values.favorite)}
            label="Favorite"
            onChange={(checked) => updateValue("favorite", checked)}
          />
          {config.kind === "performers" && (
            <>
              {config.selectFields.map((field) => (
                <SelectInput
                  key={field.name}
                  label={field.label}
                  value={String(values[field.name] ?? field.options[0])}
                  options={field.options}
                  onChange={(value) => updateValue(field.name, value)}
                />
              ))}
              {config.showAliases && (
                <ChipInput
                  label="Aliases"
                  draft={aliasDraft}
                  chips={aliases}
                  placeholder="Add alias..."
                  onDraftChange={setAliasDraft}
                  onAdd={() =>
                    addChip(aliasDraft, aliases, setAliases, setAliasDraft)
                  }
                  onRemove={(chip) =>
                    setAliases((current) =>
                      current.filter((item) => item !== chip),
                    )
                  }
                />
              )}
              <ChipInput
                label="Categories"
                draft={categoryDraft}
                chips={categories}
                placeholder="Add category..."
                onDraftChange={setCategoryDraft}
                onAdd={() =>
                  addChip(
                    categoryDraft,
                    categories,
                    setCategories,
                    setCategoryDraft,
                  )
                }
                onRemove={(chip) =>
                  setCategories((current) =>
                    current.filter((item) => item !== chip),
                  )
                }
              />
            </>
          )}
        </FieldGrid>
      </FormSection>

      {config.kind === "performers" ? (
        <PerformerExtraSections
          config={config}
          values={values}
          updateValue={updateValue}
        />
      ) : (
        <CatalogExtraSections
          config={config}
          values={values}
          categories={categories}
          categoryDraft={categoryDraft}
          setCategories={setCategories}
          setCategoryDraft={setCategoryDraft}
          updateValue={updateValue}
        />
      )}

      <FormSection index={config.kind === "performers" ? 6 : 6} title="Rating">
        <div className="grid gap-3">
          {config.ratingFields.map((field) => (
            <RatingInput
              key={field.name}
              label={field.label}
              value={String(values[field.name] ?? "")}
              onChange={(value) => updateValue(field.name, value)}
            />
          ))}
        </div>
      </FormSection>

      <FormSection index={config.kind === "performers" ? 7 : 7} title="Notes">
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Notes
          <textarea
            className="min-h-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
            value={String(values.notes ?? "")}
            onChange={(event) => updateValue("notes", event.target.value)}
            placeholder="Write local notes..."
          />
        </label>
      </FormSection>

      <RelatedFormSections sections={config.relatedSections} />

      <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-slate-50/95 py-4 backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div aria-live="polite">
            {saveState === "saved" && (
              <p className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                <CheckCircle2 size={16} />
                Local visual save state only
              </p>
            )}
            {saveState === "error" && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600">
                Required field is empty.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Link
              to={cancelTo}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-sakura-200 hover:text-sakura-600"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sakura-500 px-6 text-sm font-semibold text-white shadow-sm shadow-sakura-200 transition hover:bg-sakura-600"
            >
              <Save size={16} />
              Save
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function FormHeader({
  backLabel,
  backTo,
  title,
  subtitle,
  formLabel,
}: {
  backLabel: string;
  backTo: string;
  title: string;
  subtitle: string;
  formLabel: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          to={backTo}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-sakura-200 hover:text-sakura-600"
        >
          <ArrowLeft size={16} />
          {backLabel}
        </Link>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-normal text-sakura-500">
          {formLabel}
        </p>
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function CatalogExtraSections({
  config,
  values,
  categories,
  categoryDraft,
  setCategories,
  setCategoryDraft,
  updateValue,
}: {
  config: FormConfig;
  values: FormValues;
  categories: string[];
  categoryDraft: string;
  setCategories: Dispatch<SetStateAction<string[]>>;
  setCategoryDraft: Dispatch<SetStateAction<string>>;
  updateValue: (name: string, value: string | boolean) => void;
}) {
  const pathTitle =
    config.kind === "images" ? "Cover & Folder Path" : "Cover & File Path";

  return (
    <>
      <FormSection index={2} title="Quick Classification">
        <FieldGrid>
          {config.selectFields.map((field) => (
            <SelectInput
              key={field.name}
              label={field.label}
              value={String(values[field.name] ?? field.options[0])}
              options={field.options}
              onChange={(value) => updateValue(field.name, value)}
            />
          ))}
          <ChipInput
            label="Categories"
            draft={categoryDraft}
            chips={categories}
            placeholder="Add category..."
            onDraftChange={setCategoryDraft}
            onAdd={() =>
              addChip(categoryDraft, categories, setCategories, setCategoryDraft)
            }
            onRemove={(chip) =>
              setCategories((current) => current.filter((item) => item !== chip))
            }
          />
        </FieldGrid>
      </FormSection>
      <FormSection index={3} title={pathTitle}>
        <FieldGrid>
          {config.pathFields.map((field) => (
            <PathInput
              key={field.name}
              field={field}
              value={String(values[field.name] ?? "")}
              browseLabel={field.name === "mediaPath" ? "Browse Media" : field.name === "folderPath" ? "Browse Folder" : "Browse Cover"}
              onChange={(value) => updateValue(field.name, value)}
            />
          ))}
        </FieldGrid>
      </FormSection>
      <FormSection index={4} title="Release Metadata">
        <FieldGrid>
          {config.metadataFields.map((field) => (
            <TextInput
              key={field.name}
              field={field}
              value={String(values[field.name] ?? "")}
              onChange={(value) => updateValue(field.name, value)}
            />
          ))}
        </FieldGrid>
      </FormSection>
      <FormSection index={5} title={config.techTitle ?? "Tech Info"}>
        {config.techMessage && (
          <p className="mb-3 text-xs font-medium text-slate-500">
            {config.techMessage}
          </p>
        )}
        <ReadOnlyRows fields={config.techFields} />
      </FormSection>
    </>
  );
}

function PerformerExtraSections({
  config,
  values,
  updateValue,
}: {
  config: FormConfig;
  values: FormValues;
  updateValue: (name: string, value: string | boolean) => void;
}) {
  const sections = config.performerSections;

  if (!sections) {
    return null;
  }

  return (
    <>
      <FormSection index={2} title="Media">
        <FieldGrid>
          {config.pathFields.map((field) => (
            <PathInput
              key={field.name}
              field={field}
              value={String(values[field.name] ?? "")}
              browseLabel="Browse Cover"
              onChange={(value) => updateValue(field.name, value)}
            />
          ))}
          {sections.media.map((field) => (
            <TextInput
              key={field.name}
              field={field}
              value={String(values[field.name] ?? "")}
              onChange={(value) => updateValue(field.name, value)}
              inactive
            />
          ))}
        </FieldGrid>
      </FormSection>
      <InactiveFieldSection index={3} title="Summary" fields={sections.summary} values={values} />
      <FormSection index={4} title="Personal">
        <FieldGrid>
          {sections.personal.map((field) => (
            <TextInput
              key={field.name}
              field={field}
              value={String(values[field.name] ?? "")}
              onChange={(value) => updateValue(field.name, value)}
              inactive={field.name !== "birthDate"}
            />
          ))}
        </FieldGrid>
      </FormSection>
      <InactiveFieldSection index={5} title="Physical" fields={sections.physical} values={values} />
    </>
  );
}

function InactiveFieldSection({
  index,
  title,
  fields,
  values,
}: {
  index: number;
  title: string;
  fields: TextField[];
  values: FormValues;
}) {
  return (
    <FormSection index={index} title={title}>
      <FieldGrid>
        {fields.map((field) => (
          <TextInput
            key={field.name}
            field={field}
            value={String(values[field.name] ?? "")}
            onChange={() => undefined}
            inactive
          />
        ))}
      </FieldGrid>
    </FormSection>
  );
}

function FormSection({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold tracking-normal text-slate-950">
        {index}. {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3">{children}</div>;
}

function TextInput({
  field,
  value,
  onChange,
  inactive = false,
}: {
  field: TextField;
  value: string;
  onChange: (value: string) => void;
  inactive?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center">
      <span>
        {field.label}
        {field.required && <span className="text-sakura-500"> *</span>}
      </span>
      <span className="flex items-center gap-2">
        <input
          className={inputClass(inactive)}
          type={field.type ?? "text"}
          value={value}
          disabled={inactive}
          onChange={(event) => onChange(event.target.value)}
        />
        {field.suffix && (
          <span className="shrink-0 text-xs font-semibold text-slate-500">
            {field.suffix}
          </span>
        )}
      </span>
    </label>
  );
}

function PathInput({
  field,
  value,
  browseLabel,
  onChange,
}: {
  field: TextField;
  value: string;
  browseLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2 text-sm font-semibold text-slate-700 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center">
      <span>{field.label}</span>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
        <input
          className={inputClass(false)}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          disabled
          className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm font-semibold text-slate-400"
        >
          {browseLabel}
        </button>
      </div>
    </div>
  );
}

function SelectInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center">
      {label}
      <select
        className={inputClass(false)}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function CheckboxInput({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center">
      {label}
      <input
        className="size-4 accent-sakura-500"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function ChipInput({
  label,
  draft,
  chips,
  placeholder,
  onDraftChange,
  onAdd,
  onRemove,
}: {
  label: string;
  draft: string;
  chips: string[];
  placeholder: string;
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (chip: string) => void;
}) {
  return (
    <div className="grid gap-2 text-sm font-semibold text-slate-700 lg:grid-cols-[240px_minmax(0,1fr)]">
      <span className="pt-2">{label}</span>
      <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
        {chips.map((chip) => (
          <span
            key={chip}
            className="inline-flex items-center gap-1.5 rounded-md border border-sakura-100 bg-sakura-50 px-2.5 py-1 text-xs font-semibold text-sakura-600"
          >
            {chip}
            <button
              type="button"
              className="text-sakura-500 hover:text-sakura-700"
              aria-label={`Remove ${chip}`}
              onClick={() => onRemove(chip)}
            >
              <X size={13} />
            </button>
          </span>
        ))}
        <input
          className="min-w-40 flex-1 border-0 bg-transparent px-1 py-1 text-sm font-normal text-slate-700 outline-none placeholder:text-slate-400"
          value={draft}
          placeholder={placeholder}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAdd();
            }
          }}
        />
        <button
          type="button"
          className="inline-flex size-7 items-center justify-center rounded-md bg-sakura-50 text-sakura-500 hover:bg-sakura-100"
          aria-label={`Add ${label}`}
          onClick={onAdd}
        >
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

function RatingInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center">
      {label}
      <input
        className={inputClass(false)}
        type="number"
        min="1"
        max="5"
        step="0.5"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ReadOnlyRows({ fields }: { fields: ReadOnlyField[] }) {
  return (
    <div className="grid gap-3">
      {fields.map((field) => (
        <label
          key={field.label}
          className="grid gap-2 text-sm font-semibold text-slate-700 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center"
        >
          {field.label}
          <input
            className={inputClass(true)}
            readOnly
            value={field.value}
            aria-label={`${field.label} read-only placeholder`}
          />
        </label>
      ))}
    </div>
  );
}

function RelatedFormSections({ sections }: { sections: ReadOnlyField[] }) {
  return (
    <>
      {sections.map((section, index) => (
        <FormSection key={section.label} index={index + 8} title={section.label}>
          <ReadOnlyRows fields={[section]} />
        </FormSection>
      ))}
    </>
  );
}

function addChip(
  draft: string,
  chips: string[],
  setChips: Dispatch<SetStateAction<string[]>>,
  setDraft: Dispatch<SetStateAction<string>>,
) {
  const nextChip = draft.trim();

  if (!nextChip || chips.includes(nextChip)) {
    return;
  }

  setChips((current) => [...current, nextChip]);
  setDraft("");
}

function inputClass(inactive: boolean) {
  return [
    "h-9 w-full rounded-lg border px-3 text-sm font-normal outline-none transition",
    inactive
      ? "border-slate-200 bg-slate-100 text-slate-500"
      : "border-slate-200 bg-white text-slate-700 placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100",
  ].join(" ");
}

function collectionLabel(kind: FormConfig["kind"]) {
  if (kind === "videos") {
    return "Videos";
  }

  if (kind === "images") {
    return "Images";
  }

  return "Performers";
}

export default FormPage;
