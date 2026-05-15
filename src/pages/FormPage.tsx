import { ArrowLeft, CheckCircle2, Plus, Save, X } from "lucide-react";
import {
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useState,
} from "react";
import { Link } from "react-router-dom";
import type {
  FormConfig,
  FormMode,
  ReadOnlyField,
  TextField,
} from "../lib/formData";
import { getStoredManagedCategories } from "../lib/managedCategories";
import {
  selectLocalFolder,
  selectLocalImageFile,
  selectLocalMediaFile,
} from "../runtime/dialogCommands";
import { isTauriRuntimeAvailable } from "../runtime/tauriClient";

type FormPageProps = {
  config: FormConfig;
  mode: FormMode;
  onSubmit?: (data: FormSubmitData) => Promise<FormSubmitResult> | FormSubmitResult;
};

type FormValues = Record<string, string | boolean>;
type SaveState = "idle" | "error" | "saved";

type FormSubmitData = {
  values: FormValues;
  categories: string[];
  aliases: string[];
};

type FormSubmitResult = {
  state: Exclude<SaveState, "idle">;
  message?: string;
};

function FormPage({ config, mode, onSubmit }: FormPageProps) {
  const [values, setValues] = useState<FormValues>(config.initialValues[mode]);
  const [categories, setCategories] = useState<string[]>(
    config.initialCategories[mode],
  );
  const [aliases, setAliases] = useState<string[]>(
    config.initialAliases?.[mode] ?? [],
  );
  const [aliasDraft, setAliasDraft] = useState("");
  const [managedCategories, setManagedCategories] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const canBrowsePaths = isTauriRuntimeAvailable();

  useEffect(() => {
    setValues(config.initialValues[mode]);
    setCategories(config.initialCategories[mode]);
    setAliases(config.initialAliases?.[mode] ?? []);
    setAliasDraft("");
    setSaveState("idle");
    setSaveMessage("");
  }, [config, mode]);

  useEffect(() => {
    setManagedCategories(getStoredManagedCategories());
  }, []);

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

  async function browsePath(field: TextField) {
    if (!canBrowsePaths) {
      return;
    }

    try {
      const selectedPath = await selectPathForField(config.kind, field.name);

      if (selectedPath) {
        updateValue(field.name, selectedPath);
      }
    } catch {
      setSaveState("error");
      setSaveMessage("Unable to open file picker.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requiredValue = values[config.requiredField];

    if (typeof requiredValue !== "string" || requiredValue.trim() === "") {
      setSaveState("error");
      setSaveMessage("Required field is empty.");
      return;
    }

    if (!onSubmit) {
      setSaveState("saved");
      setSaveMessage("Local visual save state only");
      return;
    }

    try {
      const result = await onSubmit({ values, categories, aliases });
      setSaveState(result.state);
      setSaveMessage(
        result.message ??
          (result.state === "saved" ? "Saved." : "Unable to save."),
      );
    } catch {
      setSaveState("error");
      setSaveMessage("Unable to save.");
    }
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
              <CategoryPicker
                selected={categories}
                managedCategories={managedCategories}
                onChange={setCategories}
              />
            </>
          )}
        </FieldGrid>
      </FormSection>

      {config.kind === "performers" ? (
        <PerformerExtraSections
          config={config}
          values={values}
          canBrowsePaths={canBrowsePaths}
          updateValue={updateValue}
          browsePath={browsePath}
        />
      ) : (
        <CatalogExtraSections
          config={config}
          values={values}
          categories={categories}
          setCategories={setCategories}
          managedCategories={managedCategories}
          canBrowsePaths={canBrowsePaths}
          updateValue={updateValue}
          browsePath={browsePath}
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
                {saveMessage || "Local visual save state only"}
              </p>
            )}
            {saveState === "error" && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600">
                {saveMessage || "Required field is empty."}
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
  setCategories,
  managedCategories,
  canBrowsePaths,
  updateValue,
  browsePath,
}: {
  config: FormConfig;
  values: FormValues;
  categories: string[];
  setCategories: Dispatch<SetStateAction<string[]>>;
  managedCategories: string[];
  canBrowsePaths: boolean;
  updateValue: (name: string, value: string | boolean) => void;
  browsePath: (field: TextField) => void;
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
          <CategoryPicker
            selected={categories}
            managedCategories={managedCategories}
            onChange={setCategories}
          />
        </FieldGrid>
      </FormSection>
      <FormSection index={3} title={pathTitle}>
        <p className="mb-3 text-xs font-medium text-slate-500">
          Paths are saved as manual text. Browse selects a local path only.
        </p>
        <FieldGrid>
          {config.pathFields.map((field) => (
            <PathInput
              key={field.name}
              field={field}
              value={String(values[field.name] ?? "")}
              browseLabel={field.name === "mediaPath" ? "Browse Media" : field.name === "folderPath" ? "Browse Folder" : "Browse Cover"}
              browseDisabled={!canBrowsePaths}
              onChange={(value) => updateValue(field.name, value)}
              onBrowse={() => browsePath(field)}
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
  canBrowsePaths,
  updateValue,
  browsePath,
}: {
  config: FormConfig;
  values: FormValues;
  canBrowsePaths: boolean;
  updateValue: (name: string, value: string | boolean) => void;
  browsePath: (field: TextField) => void;
}) {
  const sections = config.performerSections;

  if (!sections) {
    return null;
  }

  return (
    <>
      <FormSection index={2} title="Media">
        <p className="mb-3 text-xs font-medium text-slate-500">
          Cover path is saved as manual text. Thumbnail paths are planned and not saved in MVP.
        </p>
        <FieldGrid>
          {config.pathFields.map((field) => (
            <PathInput
              key={field.name}
              field={field}
              value={String(values[field.name] ?? "")}
              browseLabel="Browse Cover"
              browseDisabled={!canBrowsePaths}
              onChange={(value) => updateValue(field.name, value)}
              onBrowse={() => browsePath(field)}
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
      <FormSection index={3} title="Summary">
        <FieldGrid>
          {sections.summary.map((field) => (
            <TextInput
              key={field.name}
              field={field}
              value={String(values[field.name] ?? "")}
              onChange={(value) => updateValue(field.name, value)}
              inactive={field.name === "yearsActive"}
            />
          ))}
        </FieldGrid>
      </FormSection>
      <FormSection index={4} title="Personal">
        <p className="mb-3 text-xs font-medium text-slate-500">
          Birth date is saved. Other personal fields are planned and not saved in MVP.
        </p>
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
        <span className="grid flex-1 gap-1">
          <span className="flex items-center gap-2">
            <input
              className={inputClass(inactive)}
              aria-label={field.label}
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
          {field.helper && (
            <span className="text-xs font-medium text-slate-500">
              {field.helper}
            </span>
          )}
        </span>
      </span>
    </label>
  );
}

function PathInput({
  field,
  value,
  browseLabel,
  browseDisabled,
  onChange,
  onBrowse,
}: {
  field: TextField;
  value: string;
  browseLabel: string;
  browseDisabled: boolean;
  onChange: (value: string) => void;
  onBrowse: () => void;
}) {
  return (
    <div className="grid gap-2 text-sm font-semibold text-slate-700 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center">
      <span>{field.label}</span>
      <div className="grid gap-1">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
          <input
            className={inputClass(false)}
            aria-label={field.label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          <button
            type="button"
            disabled={browseDisabled}
            onClick={onBrowse}
            className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold ${
              browseDisabled
                ? "border-slate-200 bg-slate-100 text-slate-400"
                : "border-sakura-200 bg-sakura-50 text-sakura-600 hover:bg-sakura-100"
            }`}
          >
            {browseLabel}
          </button>
        </div>
        {field.helper && (
          <span className="text-xs font-medium text-slate-500">
            {field.helper}
          </span>
        )}
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
  options = [],
  onDraftChange,
  onAdd,
  onRemove,
}: {
  label: string;
  draft: string;
  chips: string[];
  placeholder: string;
  options?: string[];
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (chip: string) => void;
}) {
  const optionListId = `${label.toLowerCase().replace(/\s+/g, "-")}-options`;

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
          list={options.length > 0 ? optionListId : undefined}
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
        {options.length > 0 && (
          <datalist id={optionListId}>
            {options.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        )}
      </div>
    </div>
  );
}

function CategoryPicker({
  selected,
  managedCategories,
  onChange,
}: {
  selected: string[];
  managedCategories: string[];
  onChange: Dispatch<SetStateAction<string[]>>;
}) {
  const availableCategories = managedCategories.filter(
    (category) => !hasCategory(selected, category),
  );

  return (
    <div className="grid gap-2 text-sm font-semibold text-slate-700 lg:grid-cols-[240px_minmax(0,1fr)]">
      <span className="pt-2">Categories</span>
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
          {selected.length === 0 ? (
            <span className="px-1 text-sm font-medium text-slate-400">
              No categories selected.
            </span>
          ) : (
            selected.map((category) => {
              const isManaged = hasCategory(managedCategories, category);

              return (
                <span
                  key={category}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${
                    isManaged
                      ? "border-sakura-100 bg-sakura-50 text-sakura-600"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {category}
                  {!isManaged && (
                    <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] uppercase tracking-normal">
                      Record-only
                    </span>
                  )}
                  <button
                    type="button"
                    className={
                      isManaged
                        ? "text-sakura-500 hover:text-sakura-700"
                        : "text-amber-700 hover:text-amber-900"
                    }
                    aria-label={`Remove ${category}`}
                    onClick={() =>
                      onChange((current) =>
                        current.filter((item) => item !== category),
                      )
                    }
                  >
                    <X size={13} />
                  </button>
                </span>
              );
            })
          )}
        </div>

        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            {availableCategories.length > 0 ? (
              availableCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className="inline-flex h-8 items-center rounded-md border border-sakura-100 bg-sakura-50 px-3 text-xs font-semibold text-sakura-600 transition hover:border-sakura-200 hover:bg-sakura-100"
                  aria-label={`Add ${category}`}
                  onClick={() =>
                    onChange((current) =>
                      hasCategory(current, category)
                        ? current
                        : [...current, category],
                    )
                  }
                >
                  {category}
                </button>
              ))
            ) : (
              <p className="text-xs font-medium text-slate-500">
                No Managed Categories available.
              </p>
            )}
          </div>
          <p className="text-xs font-medium text-slate-500">
            Create categories in Category Management first.{" "}
            <Link
              to="/settings/category-management"
              className="font-semibold text-sakura-600 hover:text-sakura-700"
            >
              Open Category Management
            </Link>
          </p>
        </div>
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

function hasCategory(categories: string[], category: string) {
  const categoryKey = category.trim().toLowerCase();

  return categories.some((item) => item.trim().toLowerCase() === categoryKey);
}

function inputClass(inactive: boolean) {
  return [
    "h-9 w-full rounded-lg border px-3 text-sm font-normal outline-none transition",
    inactive
      ? "border-slate-200 bg-slate-100 text-slate-500"
      : "border-slate-200 bg-white text-slate-700 placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100",
  ].join(" ");
}

function selectPathForField(kind: FormConfig["kind"], fieldName: string) {
  if (fieldName === "folderPath") {
    return selectLocalFolder();
  }

  if (kind === "videos" && fieldName === "mediaPath") {
    return selectLocalMediaFile();
  }

  return selectLocalImageFile();
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
