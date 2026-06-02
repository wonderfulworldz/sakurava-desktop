import { ArrowLeft, CheckCircle2, Plus, Save, X, Search } from "lucide-react";
import {
  type ClipboardEvent,
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
  RelatedCatalogRecordFormValue,
  ReadOnlyField,
  RelatedPerformerFormValue,
  TextField,
} from "../lib/formData";
import {
  addFormCategory,
  hasFormCategory,
  normalizeFormCategories,
  removeFormCategory,
} from "../lib/formCategories";
import { getStoredManagedCategories } from "../lib/managedCategories";
import RelatedCatalogPicker from "../components/RelatedCatalogPicker";
import RelatedPerformerPicker from "../components/RelatedPerformerPicker";
import {
  selectGalleryFolder,
  selectLocalFolder,
  selectLocalImageFile,
  selectLocalMediaFile,
} from "../runtime/dialogCommands";
import { listGalleryFolderImages } from "../runtime/galleryFolderCommands";
import {
  isPerformerRuntimeAvailable,
  listPerformers,
} from "../runtime/performerCommands";
import { isImageRuntimeAvailable, listImages } from "../runtime/imageCommands";
import { isTauriRuntimeAvailable } from "../runtime/tauriClient";
import { isVideoRuntimeAvailable, listVideos } from "../runtime/videoCommands";
import type { Image, Performer, Video } from "../backend/types";
import {
  detectImageTechInfo,
  detectVideoTechInfo,
} from "../lib/mediaTechInfo";

const BUTTON_STYLES = {
  primary: "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sakura-500 px-6 text-xs font-bold text-white shadow-md shadow-sakura-200 transition-all duration-200 hover:bg-sakura-600 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-sakura-500/20 disabled:opacity-50 disabled:cursor-not-allowed",
  secondary: "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-6 text-xs font-bold text-slate-600 shadow-sm transition-all duration-200 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-800 hover:shadow focus:outline-none focus:ring-2 focus:ring-slate-500/10 disabled:opacity-50 disabled:cursor-not-allowed",
  action: "inline-flex h-9 items-center justify-center rounded-lg border border-sakura-200 bg-sakura-50 px-3.5 text-xs font-bold text-sakura-600 shadow-sm transition-all duration-200 hover:bg-sakura-100 hover:border-sakura-300 disabled:opacity-50 disabled:cursor-not-allowed",
  compactAction: "inline-flex h-8.5 items-center justify-center rounded-md border border-sakura-200 bg-sakura-50 px-2.5 text-xs font-bold text-sakura-600 shadow-sm transition-all duration-200 hover:bg-sakura-100 hover:border-sakura-300 disabled:opacity-50 disabled:cursor-not-allowed",
  danger: "inline-flex h-9 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-600 shadow-sm transition-all duration-200 hover:bg-rose-100 hover:border-rose-300 disabled:opacity-50 disabled:cursor-not-allowed",
  link: "font-semibold text-sakura-600 hover:text-sakura-700 transition-colors duration-200",
};

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
  relatedPerformers: RelatedPerformerFormValue[];
  relatedCatalogRecords: RelatedCatalogRecordFormValue[];
  performerRelatedVideos: RelatedCatalogRecordFormValue[];
  performerRelatedImages: RelatedCatalogRecordFormValue[];
  galleryImagePaths: string[];
};

type FormSubmitResult = {
  state: Exclude<SaveState, "idle">;
  message?: string;
};

type RelatedPerformerLoadState = "idle" | "loading" | "loaded" | "error";
type RelatedCatalogLoadState = "idle" | "loading" | "loaded" | "error";

const performerSuggestionCacheKey = "sakurava.performerSuggestionCache.v1";
const hiddenPerformerSuggestionsKey = "sakurava.hiddenPerformerSuggestions.v1";
const legacyPerformerSuggestionCacheResetKey =
  "sakurava.performerSuggestionCacheReset.v2";
const performerSuggestionCacheVersionKey =
  "sakurava.performerSuggestionsCacheVersion";
const performerSuggestionCacheVersion = "batch-33-3-suggestions-fresh-v1";
const performerSuggestionCacheKeys = [
  hiddenPerformerSuggestionsKey,
  performerSuggestionCacheKey,
  legacyPerformerSuggestionCacheResetKey,
];

function FormPage({ config, mode, onSubmit }: FormPageProps) {
  const [values, setValues] = useState<FormValues>(config.initialValues[mode]);
  const [categories, setCategories] = useState<string[]>(
    normalizeFormCategories(config.initialCategories[mode]),
  );
  const [aliases, setAliases] = useState<string[]>(
    config.initialAliases?.[mode] ?? [],
  );
  const [relatedPerformers, setRelatedPerformers] = useState<
    RelatedPerformerFormValue[]
  >(config.initialRelatedPerformers?.[mode] ?? []);
  const [relatedCatalogRecords, setRelatedCatalogRecords] = useState<
    RelatedCatalogRecordFormValue[]
  >(config.initialRelatedCatalogRecords?.[mode] ?? []);
  const [performerRelatedVideos, setPerformerRelatedVideos] = useState<
    RelatedCatalogRecordFormValue[]
  >(config.initialPerformerRelatedVideos?.[mode] ?? []);
  const [performerRelatedImages, setPerformerRelatedImages] = useState<
    RelatedCatalogRecordFormValue[]
  >(config.initialPerformerRelatedImages?.[mode] ?? []);
  const [galleryImagePaths, setGalleryImagePaths] = useState<string[]>(
    config.initialGalleryImagePaths?.[mode] ?? [],
  );
  const [aliasDraft, setAliasDraft] = useState("");
  const [managedCategories, setManagedCategories] = useState<string[]>([]);
  const [availablePerformers, setAvailablePerformers] = useState<Performer[]>([]);
  const [performerLoadState, setPerformerLoadState] =
    useState<RelatedPerformerLoadState>("idle");
  const [availableRelatedImages, setAvailableRelatedImages] = useState<Image[]>([]);
  const [availableRelatedVideos, setAvailableRelatedVideos] = useState<Video[]>([]);
  const [performerSuggestionOptions, setPerformerSuggestionOptions] = useState<
    Record<string, string[]>
  >({});
  const [relatedCatalogLoadState, setRelatedCatalogLoadState] =
    useState<RelatedCatalogLoadState>("idle");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [galleryFolderMessage, setGalleryFolderMessage] = useState("");
  const [techInfoMessage, setTechInfoMessage] = useState("");
  const canBrowsePaths = isTauriRuntimeAvailable();
  const supportsRelatedPerformerPicker =
    config.kind === "videos" || config.kind === "images";
  const supportsRelatedCatalogPicker =
    config.kind === "videos" || config.kind === "images";
  const supportsPerformerRelatedCatalogPickers = config.kind === "performers";

  useEffect(() => {
    setValues(config.initialValues[mode]);
    setCategories(normalizeFormCategories(config.initialCategories[mode]));
    setAliases(config.initialAliases?.[mode] ?? []);
    setRelatedPerformers(config.initialRelatedPerformers?.[mode] ?? []);
    setRelatedCatalogRecords(config.initialRelatedCatalogRecords?.[mode] ?? []);
    setPerformerRelatedVideos(config.initialPerformerRelatedVideos?.[mode] ?? []);
    setPerformerRelatedImages(config.initialPerformerRelatedImages?.[mode] ?? []);
    setGalleryImagePaths(config.initialGalleryImagePaths?.[mode] ?? []);
    setAliasDraft("");
    setSaveState("idle");
    setSaveMessage("");
    setGalleryFolderMessage("");
    setTechInfoMessage("");
  }, [config, mode]);

  useEffect(() => {
    setManagedCategories(getStoredManagedCategories());
    resetPerformerSuggestionCachesOnce();
  }, []);

  useEffect(() => {
    if (config.kind === "videos") {
      const mediaPath = String(values.mediaPath ?? "").trim();
      if (!mediaPath) {
        if (values.availability !== "Not Owned") {
          updateValue("availability", "Not Owned");
        }
      } else {
        if (values.availability === "Not Owned") {
          updateValue("availability", "Owned");
        }
      }
    } else if (config.kind === "images") {
      const coverPath = String(values.coverPath ?? "").trim();
      const hasGalleryPaths = galleryImagePaths.some((p) => p.trim());
      if (!coverPath && !hasGalleryPaths) {
        if (values.availability !== "Not Owned") {
          updateValue("availability", "Not Owned");
        }
      } else {
        if (values.availability === "Not Owned") {
          updateValue("availability", "Owned");
        }
      }
    }
  }, [values.mediaPath, values.coverPath, galleryImagePaths, config.kind]);

  useEffect(() => {
    let cancelled = false;

    if (!supportsRelatedPerformerPicker) {
      setAvailablePerformers([]);
      setPerformerLoadState("idle");
      return;
    }

    if (!isPerformerRuntimeAvailable()) {
      setAvailablePerformers([]);
      setPerformerLoadState("loaded");
      return;
    }

    setPerformerLoadState("loading");
    listPerformers()
      .then((performers) => {
        if (cancelled) {
          return;
        }

        setAvailablePerformers(Array.isArray(performers) ? performers : []);
        setPerformerLoadState("loaded");
      })
      .catch(() => {
        if (!cancelled) {
          setAvailablePerformers([]);
          setPerformerLoadState("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [supportsRelatedPerformerPicker]);

  useEffect(() => {
    let cancelled = false;

    if (config.kind !== "performers" || !isPerformerRuntimeAvailable()) {
      setPerformerSuggestionOptions({});
      return;
    }

    listPerformers()
      .then((performers) => {
        if (cancelled) {
          return;
        }

        setPerformerSuggestionOptions(getStoredPerformerSuggestionCache());
      })
      .catch(() => {
        if (!cancelled) {
          setPerformerSuggestionOptions({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [config.kind]);

  useEffect(() => {
    let cancelled = false;

    if (!supportsRelatedCatalogPicker && !supportsPerformerRelatedCatalogPickers) {
      setAvailableRelatedImages([]);
      setAvailableRelatedVideos([]);
      setRelatedCatalogLoadState("idle");
      return;
    }

    if (config.kind === "videos") {
      setAvailableRelatedVideos([]);

      if (!isImageRuntimeAvailable()) {
        setAvailableRelatedImages([]);
        setRelatedCatalogLoadState("loaded");
        return;
      }

      setRelatedCatalogLoadState("loading");
      listImages()
        .then((images) => {
          if (cancelled) {
            return;
          }

          setAvailableRelatedImages(Array.isArray(images) ? images : []);
          setRelatedCatalogLoadState("loaded");
        })
        .catch(() => {
          if (!cancelled) {
            setAvailableRelatedImages([]);
            setRelatedCatalogLoadState("error");
          }
        });

      return () => {
        cancelled = true;
      };
    }

    if (config.kind === "images") {
      setAvailableRelatedImages([]);

      if (!isVideoRuntimeAvailable()) {
        setAvailableRelatedVideos([]);
        setRelatedCatalogLoadState("loaded");
        return;
      }

      setRelatedCatalogLoadState("loading");
      listVideos()
        .then((videos) => {
          if (cancelled) {
            return;
          }

          setAvailableRelatedVideos(Array.isArray(videos) ? videos : []);
          setRelatedCatalogLoadState("loaded");
        })
        .catch(() => {
          if (!cancelled) {
            setAvailableRelatedVideos([]);
            setRelatedCatalogLoadState("error");
          }
        });

      return () => {
        cancelled = true;
      };
    }

    return () => {
      cancelled = true;
    };
  }, [config.kind, supportsRelatedCatalogPicker]);

  useEffect(() => {
    let cancelled = false;

    if (!supportsPerformerRelatedCatalogPickers) {
      return;
    }

    if (!isVideoRuntimeAvailable() && !isImageRuntimeAvailable()) {
      setAvailableRelatedVideos([]);
      setAvailableRelatedImages([]);
      setRelatedCatalogLoadState("loaded");
      return;
    }

    setRelatedCatalogLoadState("loading");
    Promise.all([
      isVideoRuntimeAvailable() ? listVideos() : Promise.resolve([]),
      isImageRuntimeAvailable() ? listImages() : Promise.resolve([]),
    ])
      .then(([videos, images]) => {
        if (cancelled) {
          return;
        }

        setAvailableRelatedVideos(Array.isArray(videos) ? videos : []);
        setAvailableRelatedImages(Array.isArray(images) ? images : []);
        setRelatedCatalogLoadState("loaded");
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableRelatedVideos([]);
          setAvailableRelatedImages([]);
          setRelatedCatalogLoadState("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [supportsPerformerRelatedCatalogPickers]);

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

  function removePerformerSuggestion(fieldName: string, suggestion: string) {
    setPerformerSuggestionOptions((current) => {
      const next = removeCachedPerformerSuggestion(current, fieldName, suggestion);
      storePerformerSuggestionCache(next);
      return next;
    });
  }

  async function browsePath(field: TextField) {
    if (!canBrowsePaths) {
      return;
    }

    try {
      const selectedPath = await selectPathForField(config.kind, field.name);

      if (selectedPath) {
        updateValue(field.name, selectedPath);
        if (config.kind === "videos" && field.name === "mediaPath") {
          void detectTechInfo({ mediaPath: selectedPath });
        }
      }
    } catch {
      setSaveState("error");
      setSaveMessage("Unable to open file picker.");
    }
  }

  async function browseGalleryFolder() {
    if (!canBrowsePaths) {
      return;
    }

    try {
      if (
        galleryImagePaths.length > 0 &&
        !window.confirm("Replace current Gallery Images path rows?")
      ) {
        return;
      }

      const selectedFolder = await selectGalleryFolder();
      if (!selectedFolder) {
        return;
      }

      const result = await listGalleryFolderImages(selectedFolder);
      setGalleryImagePaths(result.imagePaths);
      setSaveState("idle");
      setGalleryFolderMessage(
        result.imagePaths.length === 0
          ? "No supported image files found in the selected folder."
          : `Loaded ${result.imagePaths.length} Gallery Images path row${
              result.imagePaths.length === 1 ? "" : "s"
            }.`,
      );
      void detectTechInfo(undefined, result.imagePaths);
    } catch {
      setGalleryFolderMessage("Unable to read the selected gallery folder.");
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
      const result = await onSubmit({
        values,
        categories: normalizeFormCategories(categories),
        aliases,
        relatedPerformers,
        relatedCatalogRecords,
        performerRelatedVideos,
        performerRelatedImages,
        galleryImagePaths,
      });
      setSaveState(result.state);
      setSaveMessage(
        result.message ??
          (result.state === "saved" ? "Saved." : "Unable to save."),
      );
      if (result.state === "saved" && config.kind === "performers") {
        setPerformerSuggestionOptions((current) => {
          const next = addPerformerValuesToSuggestionCache(current, values);
          storePerformerSuggestionCache(next);
          return next;
        });
      }
    } catch {
      setSaveState("error");
      setSaveMessage("Unable to save.");
    }
  }

  async function detectTechInfo(
    valuePatch: FormValues = {},
    galleryPathOverride?: string[],
  ) {
    const nextBaseValues = { ...values, ...valuePatch };
    const nextGalleryPaths = galleryPathOverride ?? galleryImagePaths;

    try {
      const detectedValues =
        config.kind === "videos"
          ? await detectVideoTechInfo(nextBaseValues)
          : config.kind === "images"
            ? await detectImageTechInfo(nextBaseValues, nextGalleryPaths)
            : nextBaseValues;

      setValues(detectedValues);
      setSaveState("idle");
      setTechInfoMessage(
        config.kind === "videos"
          ? "Tech Info checked from the Media Path. Save to persist these values."
          : "Tech Info checked from Gallery Images. Save to persist these values.",
      );
    } catch {
      setTechInfoMessage("Tech Info could not be checked.");
    }
  }

  return (
    <form className="max-w-4xl mx-auto px-4 pt-8 pb-24 space-y-6" onSubmit={handleSubmit}>
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
          {config.kind === "performers" && config.showAliases && (
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
                setAliases((current) => current.filter((item) => item !== chip))
              }
            />
          )}
          <CheckboxInput
            checked={Boolean(values.favorite)}
            label="Favorite"
            onChange={(checked) => updateValue("favorite", checked)}
          />
        </FieldGrid>
      </FormSection>

      {config.kind !== "performers" ? (
        <>
          <FormSection index={2} title="Metadata">
            <FieldGrid>
              {config.selectFields.map((field) => 
                field.name === "availability" ? (
                  <AvailabilityBadgeRow
                    key={field.name}
                    label={field.label}
                    value={String(values[field.name] ?? "Not Owned")}
                  />
                ) : field.name === "censorship" ? (
                  <CensorshipSelectInput
                    key={field.name}
                    label={field.label}
                    value={String(values[field.name] ?? "Censored")}
                    options={field.options}
                    onChange={(value) => updateValue(field.name, value)}
                  />
                ) : (
                  <SelectInput
                    key={field.name}
                    label={field.label}
                    value={String(values[field.name] ?? field.options[0])}
                    options={field.options}
                    onChange={(value) => updateValue(field.name, value)}
                  />
                )
              )}
              {config.metadataFields.map((field) => 
                field.name === "publisherLabel" ? (
                  <SearchTextInput
                    key={field.name}
                    field={field}
                    value={String(values[field.name] ?? "")}
                    onChange={(value) => updateValue(field.name, value)}
                  />
                ) : (
                  <TextInput
                    key={field.name}
                    field={field}
                    value={String(values[field.name] ?? "")}
                    onChange={(value) => updateValue(field.name, value)}
                  />
                )
              )}
              <SourceLinksInput />
            </FieldGrid>
          </FormSection>

          <FormSection index={3} title="Files">
            <p className="mb-3 text-xs font-medium text-slate-500">
              File paths are saved as manual text. Browse selects local files or folders only.
            </p>
            <FieldGrid>
              {config.pathFields.find((f) => f.name === "coverPath") && (
                <PathInput
                  field={config.pathFields.find((f) => f.name === "coverPath")!}
                  value={String(values.coverPath ?? "")}
                  browseLabel="Browse Cover"
                  browseDisabled={!canBrowsePaths}
                  onChange={(value) => updateValue("coverPath", value)}
                  onBrowse={() => browsePath(config.pathFields.find((f) => f.name === "coverPath")!)}
                />
              )}
              {config.kind === "videos" && config.pathFields.find((f) => f.name === "mediaPath") && (
                <PathInput
                  field={config.pathFields.find((f) => f.name === "mediaPath")!}
                  value={String(values.mediaPath ?? "")}
                  browseLabel="Browse Media"
                  browseDisabled={!canBrowsePaths}
                  onChange={(value) => updateValue("mediaPath", value)}
                  onBrowse={() => browsePath(config.pathFields.find((f) => f.name === "mediaPath")!)}
                />
              )}
              {config.kind === "images" && (
                <GalleryImagePathRows
                  paths={galleryImagePaths}
                  onChange={setGalleryImagePaths}
                  folderMessage={galleryFolderMessage}
                  browseFolderDisabled={!canBrowsePaths}
                  onBrowseFolder={browseGalleryFolder}
                />
              )}
            </FieldGrid>
          </FormSection>

          <FormSection
            index={4}
            title={config.techTitle ?? "Tech Info"}
            action={
              <button
                type="button"
                className={BUTTON_STYLES.action}
                onClick={() => void detectTechInfo()}
              >
                Detect
              </button>
            }
          >
            {config.techMessage && (
              <p className="mb-4 text-xs font-medium text-slate-400">
                {config.techMessage}
              </p>
            )}
            {techInfoMessage && (
              <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                {techInfoMessage}
              </p>
            )}
            {config.techInputFields && config.techInputFields.length > 0 && (
              <FieldGrid>
                {config.techInputFields.map((field) => (
                  <TechReadOnlyTextInput
                    key={field.name}
                    label={field.label}
                    value={String(values[field.name] ?? "")}
                    placeholder={field.placeholder ?? "n/a"}
                    suffix={field.suffix}
                  />
                ))}
              </FieldGrid>
            )}
            <ReadOnlyRows fields={config.techFields} />
          </FormSection>
        </>
      ) : (
        <>
           <FormSection index={2} title="Media Assets">
            <p className="mb-4 text-xs font-medium text-slate-400">
              Cover and thumbnail paths are saved as manual text. Browse selects a local image path only.
            </p>
            <div className="space-y-6">
              {/* Cover Row */}
              <div className="border-b border-slate-100 pb-4">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Primary Cover</h3>
                {config.pathFields.map((field) => (
                  <PathInput
                    key={field.name}
                    field={field}
                    value={String(values[field.name] ?? "")}
                    browseLabel="Browse"
                    browseDisabled={!canBrowsePaths}
                    onChange={(value) => updateValue(field.name, value)}
                    onBrowse={() => browsePath(field)}
                  />
                ))}
              </div>

              {/* Thumbnails Sub-grid */}
              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Thumbnails (Optional)</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {config.performerSections?.media.map((field) => (
                    <PathInputCompact
                      key={field.name}
                      field={field}
                      value={String(values[field.name] ?? "")}
                      browseLabel="Browse"
                      browseDisabled={!canBrowsePaths}
                      onChange={(value) => updateValue(field.name, value)}
                      onBrowse={() => browsePath(field)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </FormSection>

          <FormSection index={3} title="Status & Activity">
            <FieldGrid>
              <PerformerStatusBadge
                value={derivePerformerStatusDisplay(
                  String(values.debutDate ?? ""),
                  String(values.retiredDate ?? ""),
                )}
              />
              {config.performerSections?.personal
                .filter((field) => field.name === "debutDate" || field.name === "retiredDate")
                .map((field) => (
                  <TextInput
                    key={field.name}
                    field={field}
                    value={String(values[field.name] ?? "")}
                    onChange={(value) => updateValue(field.name, value)}
                  />
                ))}
              <ReadOnlyTextInput
                label="Filmography"
                value={String(performerRelatedVideos.length)}
              />
              <ReadOnlyTextInput
                label="Pictorials"
                value={String(performerRelatedImages.length)}
              />
            </FieldGrid>
          </FormSection>

          <FormSection index={4} title="Profile Details">
            <FieldGrid>
              {config.performerSections?.personal
                .filter((field) => field.name !== "debutDate" && field.name !== "retiredDate")
                .map((field) => (
                  field.name === "astrologicalSign" ? (
                    <ReadOnlyTextInput
                      key={field.name}
                      label={field.label}
                      value={deriveAstrologicalSign(String(values.birthDate ?? ""))}
                      helper={field.helper}
                    />
                  ) : (
                    <TextInput
                      key={field.name}
                      field={field}
                      value={String(values[field.name] ?? "")}
                      onChange={(value) => updateValue(field.name, value)}
                      suggestions={performerSuggestionOptions[field.name] ?? []}
                      onHideSuggestion={(suggestion) =>
                        removePerformerSuggestion(field.name, suggestion)
                      }
                    />
                  )
                ))}
              {config.performerSections?.physical
                .map((field) => (
                  field.name === "measurements" ? (
                    <MeasurementsInput
                      key={field.name}
                      value={String(values.measurements ?? "")}
                      onChange={(value) => updateValue("measurements", value)}
                    />
                  ) : (
                    <TextInput
                      key={field.name}
                      field={field}
                      value={String(values[field.name] ?? "")}
                      onChange={(value) => updateValue(field.name, value)}
                      suggestions={performerSuggestionOptions[field.name] ?? []}
                      onHideSuggestion={(suggestion) =>
                        removePerformerSuggestion(field.name, suggestion)
                      }
                    />
                  )
                ))}
              <SourceLinksInput />
            </FieldGrid>
          </FormSection>
        </>
      )}

      <FormSection index={5} title="Categories">
        <CategoryPicker
          selected={categories}
          managedCategories={managedCategories}
          onChange={setCategories}
        />
      </FormSection>

      <FormSection index={6} title="Rating">
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

      {config.kind !== "performers" ? (
        <>
          <FormSection index={7} title="Related Performer">
            <RelatedPerformerPicker
              performers={availablePerformers}
              selected={relatedPerformers}
              loadState={performerLoadState}
              onChange={setRelatedPerformers}
            />
          </FormSection>

          <FormSection
            index={8}
            title={config.kind === "videos" ? "Related Images" : "Related Video"}
          >
            <RelatedCatalogPicker
              records={
                config.kind === "videos"
                  ? availableRelatedImages
                  : availableRelatedVideos
              }
              selected={relatedCatalogRecords}
              loadState={relatedCatalogLoadState}
              targetKind={config.kind === "videos" ? "images" : "videos"}
              onChange={setRelatedCatalogRecords}
            />
          </FormSection>
        </>
      ) : (
        <>
          <FormSection index={7} title="Related Videos">
            <RelatedCatalogPicker
              records={availableRelatedVideos}
              selected={performerRelatedVideos}
              loadState={relatedCatalogLoadState}
              targetKind="videos"
              onChange={setPerformerRelatedVideos}
            />
          </FormSection>

          <FormSection index={8} title="Related Images">
            <RelatedCatalogPicker
              records={availableRelatedImages}
              selected={performerRelatedImages}
              loadState={relatedCatalogLoadState}
              targetKind="images"
              onChange={setPerformerRelatedImages}
            />
          </FormSection>
        </>
      )}

      <NotesSection
        index={9}
        value={String(values.notes ?? "")}
        onChange={(value) => updateValue("notes", value)}
      />

      <div className="sticky bottom-0 z-10 border-t border-slate-200/80 bg-slate-50/95 py-5 backdrop-blur shadow-lg">
        <div className="max-w-4xl mx-auto px-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div aria-live="polite">
            {saveState === "saved" && (
              <p className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 shadow-sm">
                <CheckCircle2 size={14} />
                {saveMessage || "Local visual save state only"}
              </p>
            )}
            {saveState === "error" && (
              <p className="rounded-lg bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-600 shadow-sm">
                {saveMessage || "Required field is empty."}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Link
              to={cancelTo}
              className={BUTTON_STYLES.secondary}
            >
              Cancel
            </Link>
            <button
              type="submit"
              className={BUTTON_STYLES.primary}
            >
              <Save size={14} />
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
    <div className="flex flex-col gap-5 border-b border-slate-100 pb-6 mb-2">
      <div>
        <Link
          to={backTo}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-600 shadow-sm transition-all duration-200 hover:border-sakura-300 hover:text-sakura-600 hover:shadow"
        >
          <ArrowLeft size={14} />
          {backLabel}
        </Link>
      </div>
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-sakura-500">
          {formLabel}
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          {title}
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function NotesSection({
  index,
  value,
  onChange,
}: {
  index: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormSection index={index} title="Notes">
      <label className="grid gap-2 text-sm font-semibold text-slate-700">
        Notes
        <textarea
          className="min-h-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Write local notes..."
        />
      </label>
    </FormSection>
  );
}

function ReadOnlyTextInput({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center">
      {label}
      <div className="grid gap-1">
        <input
          className={inputClass(true)}
          readOnly
          value={value}
          aria-label={label}
        />
        {helper && (
          <span className="text-xs font-medium text-slate-500">{helper}</span>
        )}
      </div>
    </label>
  );
}

function TechReadOnlyTextInput({
  label,
  value,
  placeholder = "n/a",
  suffix,
}: {
  label: string;
  value: string;
  placeholder?: string;
  suffix?: string;
}) {
  const isPlaceholder = !value.trim() || value === "n/a";

  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center">
      <span className="flex items-center gap-1.5">
        {label}
        {!isPlaceholder && (
          <span className="inline-flex items-center rounded-md bg-sakura-50 px-1.5 py-0.5 text-[10px] font-bold text-sakura-600 border border-sakura-100/50 uppercase tracking-wider">
            Auto
          </span>
        )}
      </span>
      <div className="flex items-center gap-2">
        <div className="relative grid flex-1">
          <input
            className={[
              "h-9 w-full rounded-lg border px-3 text-sm outline-none transition cursor-not-allowed selection:bg-transparent",
              isPlaceholder
                ? "border-slate-100 bg-slate-50/50 text-slate-400 font-normal italic placeholder:text-slate-400/70"
                : "border-slate-100 bg-slate-50/70 text-slate-600 font-semibold",
            ].join(" ")}
            readOnly
            value={isPlaceholder ? "" : value}
            placeholder={placeholder}
            aria-label={label}
          />
        </div>
        {suffix && (
          <span className="shrink-0 text-xs font-semibold text-slate-500">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function FormSection({
  index,
  title,
  children,
  action,
}: {
  index: number;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-5">
        <h2 className="text-lg font-bold tracking-tight text-slate-900">
          {index}. {title}
        </h2>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div>{children}</div>
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
  suggestions = [],
  onHideSuggestion,
}: {
  field: TextField;
  value: string;
  onChange: (value: string) => void;
  inactive?: boolean;
  suggestions?: string[];
  onHideSuggestion?: (suggestion: string) => void;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const hasSuggestions = suggestions.length > 0 && onHideSuggestion && !inactive;

  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center">
      <span>
        {field.label}
        {field.required && <span className="text-sakura-500"> *</span>}
      </span>
      <span className="flex items-center gap-2">
        <span className="relative grid flex-1 gap-1">
          <span className="flex items-center gap-2">
            <input
              className={inputClass(inactive)}
              aria-label={field.label}
              type={field.type ?? "text"}
              value={value}
              placeholder={field.placeholder}
              disabled={inactive}
              autoComplete="off"
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => window.setTimeout(() => setShowSuggestions(false), 100)}
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
          {hasSuggestions && showSuggestions && (
            <span
              className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
              aria-label={`${field.label} suggestions`}
            >
              {suggestions.map((suggestion) => (
                <span
                  key={suggestion}
                  className="flex items-center justify-between gap-2 px-2 py-1"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-xs font-semibold text-slate-600 hover:bg-sakura-50 hover:text-sakura-600"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onChange(suggestion)}
                  >
                    {suggestion}
                  </button>
                  <button
                    type="button"
                    className="inline-flex size-5 items-center justify-center rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Remove ${field.label} suggestion ${suggestion}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onHideSuggestion(suggestion)}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </span>
          )}
        </span>
      </span>
    </label>
  );
}

function MeasurementsInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const displayValue = formatMeasurementDigits(measurementDigitsFromValue(value));

  function normalizeInputValue(nextValue: string) {
    onChange(formatMeasurementDigits(measurementDigitsFromValue(nextValue)));
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    normalizeInputValue(event.clipboardData.getData("text"));
  }

  return (
    <div className="grid gap-2 text-sm font-semibold text-slate-700 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center">
      <span>Measurements</span>
      <div className="flex items-center gap-2">
        <input
          className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-700 outline-none transition focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
          aria-label="Measurements"
          inputMode="numeric"
          value={displayValue}
          autoComplete="off"
          onChange={(event) => normalizeInputValue(event.target.value)}
          onPaste={handlePaste}
        />
        <span
          className="shrink-0 text-xs font-semibold text-slate-500"
          aria-label="Measurements unit"
        >
          cm
        </span>
      </div>
    </div>
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
            className={BUTTON_STYLES.action}
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

function GalleryImagePathRows({
  paths,
  onChange,
  folderMessage,
  browseFolderDisabled,
  onBrowseFolder,
}: {
  paths: string[];
  onChange: Dispatch<SetStateAction<string[]>>;
  folderMessage: string;
  browseFolderDisabled: boolean;
  onBrowseFolder: () => void;
}) {
  const [showAllPaths, setShowAllPaths] = useState(false);

  function updatePath(index: number, value: string) {
    onChange((current) =>
      current.map((path, currentIndex) =>
        currentIndex === index ? value : path,
      ),
    );
  }

  function removePath(index: number) {
    onChange((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
  }

  function clearPaths() {
    if (
      paths.length === 0 ||
      window.confirm("Clear all Gallery Images path rows?")
    ) {
      onChange([]);
    }
  }

  const visiblePaths = showAllPaths ? paths : paths.slice(0, 5);

  return (
    <div className="grid gap-3">
      <p className="text-xs font-medium text-slate-500">
        Browse one gallery folder or add explicit local image paths. Folder results replace current rows.
      </p>
      {folderMessage && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
          {folderMessage}
        </p>
      )}
      <div
        className="grid max-h-80 gap-2 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-2"
        data-testid="gallery-image-path-list"
      >
        {paths.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-500">
            No Gallery Images paths added.
          </p>
        ) : (
          visiblePaths.map((path, index) => (
            <div
              key={index}
              className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px]"
            >
              <input
                className={inputClass(false)}
                aria-label={`Gallery Image Path ${index + 1}`}
                value={path}
                onChange={(event) => updatePath(index, event.target.value)}
              />
              <button
                type="button"
                className={BUTTON_STYLES.danger}
                onClick={() => removePath(index)}
              >
                <X size={13} />
                Remove
              </button>
            </div>
          ))
        )}
      </div>

      {paths.length > 5 && !showAllPaths && (
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-2">
          <span className="text-xs font-bold text-slate-400">
            + {paths.length - 5} more files are loaded
          </span>
          <button
            type="button"
            className={`${BUTTON_STYLES.link} text-xs`}
            onClick={() => setShowAllPaths(true)}
          >
            Show All
          </button>
        </div>
      )}
      {showAllPaths && paths.length > 5 && (
        <div className="flex justify-end">
          <button
            type="button"
            className={`${BUTTON_STYLES.link} text-xs`}
            onClick={() => setShowAllPaths(false)}
          >
            Show Less
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={browseFolderDisabled}
          className={BUTTON_STYLES.action}
          onClick={onBrowseFolder}
        >
          Browse Gallery Folder
        </button>
        <button
          type="button"
          className={BUTTON_STYLES.action}
          onClick={() => onChange((current) => [...current, ""])}
        >
          <Plus size={14} />
          Add Images
        </button>
        <button
          type="button"
          disabled={paths.length === 0}
          className={BUTTON_STYLES.secondary}
          onClick={clearPaths}
        >
          Clear All
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
    <label className="grid gap-2 text-sm font-semibold text-slate-700 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center cursor-pointer">
      <span>{label}</span>
      <div className="relative flex items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
          id="favorite-toggle"
          aria-label={label}
        />
        {/* Visual toggle switch - click naturally handled by parent label wrapping */}
        <div
          className="h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sakura-500 peer-checked:after:translate-x-full peer-checked:after:border-white relative"
        />
      </div>
    </label>
  );
}

function AvailabilityBadgeInput({
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
    <div className="grid gap-2 text-sm font-semibold text-slate-700 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center">
      <span>{label}</span>
      <div className="flex gap-2.5">
        {options.map((option) => {
          const isSelected = value === option;
          let badgeColorClass = "";
          if (option === "Owned") {
            badgeColorClass = isSelected
              ? "bg-emerald-50 border-emerald-300 text-emerald-700 ring-2 ring-emerald-500/20"
              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50";
          } else if (option === "Not Owned") {
            badgeColorClass = isSelected
              ? "bg-slate-100 border-slate-300 text-slate-700 ring-2 ring-slate-400/20"
              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50";
          } else if (option === "Missing") {
            badgeColorClass = isSelected
              ? "bg-rose-50 border-rose-300 text-rose-700 ring-2 ring-rose-500/20"
              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50";
          } else {
            badgeColorClass = isSelected
              ? "bg-sakura-50 border-sakura-300 text-sakura-700 ring-2 ring-sakura-500/20"
              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50";
          }

          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={`inline-flex items-center justify-center rounded-full border px-3.5 py-1 text-xs font-semibold shadow-sm transition-all duration-200 ${badgeColorClass}`}
            >
              {option}
            </button>
          );
        })}
        {/* Hidden select with aria-label so tests/DOM queries work exactly the same */}
        <select
          className="sr-only"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function PerformerStatusBadge({
  value,
}: {
  value: string;
}) {
  let badgeColorClass = "bg-slate-50 border-slate-200 text-slate-600";
  if (value === "Active") {
    badgeColorClass = "bg-emerald-50 border-emerald-200 text-emerald-700";
  } else if (value === "Retired") {
    badgeColorClass = "bg-amber-50 border-amber-200 text-amber-700";
  }

  return (
    <div className="grid gap-2 text-sm font-semibold text-slate-700 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center">
      <span>Status</span>
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center justify-center rounded-full border px-3.5 py-1 text-xs font-bold shadow-sm ${badgeColorClass}`}>
          {value}
        </span>
        {/* sr-only input with aria-label and value so tests can query screen.getByLabelText("Status") */}
        <input
          className="sr-only"
          readOnly
          value={value}
          aria-label="Status"
        />
      </div>
    </div>
  );
}

function PathInputCompact({
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
    <div className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
      <span className="text-xs font-semibold text-slate-600">{field.label}</span>
      <div className="flex gap-2">
        <input
          className="h-8.5 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-normal text-slate-700 outline-none transition focus:border-sakura-300 focus:ring-2 focus:ring-sakura-100"
          aria-label={field.label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          disabled={browseDisabled}
          onClick={onBrowse}
          className={BUTTON_STYLES.compactAction}
        >
          {browseLabel}
        </button>
      </div>
    </div>
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
  const normalizedSelected = normalizeFormCategories(selected);
  const normalizedManagedCategories = normalizeFormCategories(managedCategories);
  const availableCategories = normalizedManagedCategories.filter(
    (category) => !hasFormCategory(normalizedSelected, category),
  );
  const [categorySearch, setCategorySearch] = useState("");
  const categorySearchKey = categorySearch.trim().toLowerCase();
  const filteredCategories = availableCategories.filter((category) =>
    category.toLowerCase().includes(categorySearchKey),
  );

  useEffect(() => {
    if (
      selected.length !== normalizedSelected.length ||
      selected.some((category, index) => category !== normalizedSelected[index])
    ) {
      onChange(normalizedSelected);
    }
  }, [normalizedSelected, onChange, selected]);

  function addSelectedCategory(category: string) {
    onChange((current) => addFormCategory(current, category));
    setCategorySearch("");
  }

  return (
    <div
      className="grid gap-2 text-sm font-semibold text-slate-700 lg:grid-cols-[240px_minmax(0,1fr)]"
      data-testid="category-picker-field"
    >
      <span className="pt-2">Categories</span>
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
          {normalizedSelected.length === 0 ? (
            <span className="px-1 text-sm font-medium text-slate-400">
              No categories selected.
            </span>
          ) : (
            normalizedSelected.map((category) => {
              const isManaged = hasFormCategory(normalizedManagedCategories, category);

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
                  <button
                    type="button"
                    className={
                      isManaged
                        ? "text-sakura-500 hover:text-sakura-700"
                        : "text-amber-700 hover:text-amber-900"
                    }
                    aria-label={`Remove ${category}`}
                    onClick={() =>
                      onChange((current) => removeFormCategory(current, category))
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
          {normalizedManagedCategories.length > 0 ? (
            availableCategories.length > 0 ? (
              <div className="grid gap-2">
                <input
                  className={inputClass(false)}
                  aria-label="Search categories"
                  value={categorySearch}
                  placeholder="Search Managed Categories..."
                  onChange={(event) => setCategorySearch(event.target.value)}
                />
                {filteredCategories.length > 0 ? (
                  <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-2">
                    {filteredCategories.map((category) => (
                      <button
                        key={category}
                        type="button"
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-sakura-100 bg-white px-3 text-xs font-semibold text-sakura-600 hover:border-sakura-200 hover:bg-sakura-50"
                        aria-label={`Add ${category}`}
                        onClick={() => addSelectedCategory(category)}
                      >
                        <Plus size={13} />
                        {category}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
                    No matching Managed Categories. Use Manage Category to add it first.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs font-medium text-slate-500">
                All Managed Categories are selected.
              </p>
            )
          ) : (
            <p className="text-xs font-medium text-slate-500">
              No Managed Categories available.
            </p>
          )}
          <p className="text-xs font-medium text-slate-500">
            Manage categories in Category Management.{" "}
            <Link
              to="/settings/category-management"
              className="font-semibold text-sakura-600 hover:text-sakura-700"
            >
              Manage Category
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

function deriveAstrologicalSign(birthDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);

  if (!match) {
    return "Not set";
  }

  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(month) || !Number.isInteger(day)) {
    return "Not set";
  }

  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return "Aries";
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return "Taurus";
  if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return "Gemini";
  if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return "Cancer";
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return "Leo";
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return "Virgo";
  if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return "Libra";
  if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return "Scorpio";
  if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return "Sagittarius";
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return "Capricorn";
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return "Aquarius";
  if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) return "Pisces";

  return "Not set";
}

function derivePerformerStatusDisplay(debutDate: string, retiredDate: string) {
  if (retiredDate.trim()) {
    return "Retired";
  }

  if (debutDate.trim()) {
    return "Active";
  }

  return "Unknown";
}

function buildPerformerSuggestions(performers: Performer[]) {
  const recentPerformers = [...performers].sort(
    (left, right) => performerSuggestionTime(right) - performerSuggestionTime(left),
  );

  return {
    birthplace: uniqueSuggestions(recentPerformers.map((performer) => performer.birthplace))
      .slice(0, 10),
    nationality: uniqueSuggestions(recentPerformers.map((performer) => performer.nationality))
      .slice(0, 10),
    bloodType: uniqueSuggestions(recentPerformers.map((performer) => performer.bloodType))
      .slice(0, 10),
    cupSize: uniqueSuggestions(recentPerformers.map((performer) => performer.cupSize))
      .slice(0, 10),
  };
}

function performerSuggestionTime(performer: Performer) {
  const updatedAt = Date.parse(String(performer.updatedAt ?? ""));
  if (Number.isFinite(updatedAt)) {
    return updatedAt;
  }

  const createdAt = Date.parse(String(performer.createdAt ?? ""));
  return Number.isFinite(createdAt) ? createdAt : 0;
}

function removeCachedPerformerSuggestion(
  current: Record<string, string[]>,
  fieldName: string,
  suggestion: string,
) {
  const normalizedSuggestion = suggestion.trim();
  if (!normalizedSuggestion) {
    return current;
  }

  const currentFieldSuggestions = current[fieldName] ?? [];
  const normalizedKey = normalizedSuggestion.toLowerCase();
  const nextFieldSuggestions = currentFieldSuggestions.filter(
    (currentSuggestion) => currentSuggestion.trim().toLowerCase() !== normalizedKey,
  );

  if (nextFieldSuggestions.length === currentFieldSuggestions.length) {
    return current;
  }

  return {
    ...current,
    [fieldName]: nextFieldSuggestions,
  };
}

function addPerformerValuesToSuggestionCache(
  current: Record<string, string[]>,
  values: FormValues,
) {
  return performerSuggestionFieldNames.reduce(
    (next, fieldName) =>
      addCachedPerformerSuggestion(next, fieldName, String(values[fieldName] ?? "")),
    current,
  );
}

function addCachedPerformerSuggestion(
  current: Record<string, string[]>,
  fieldName: string,
  suggestion: string,
) {
  const normalizedSuggestion = suggestion.trim();
  if (!normalizedSuggestion) {
    return current;
  }

  const remainingSuggestions = (current[fieldName] ?? []).filter(
    (currentSuggestion) =>
      currentSuggestion.trim().toLowerCase() !== normalizedSuggestion.toLowerCase(),
  );

  return {
    ...current,
    [fieldName]: [normalizedSuggestion, ...remainingSuggestions].slice(0, 10),
  };
}

function mergePerformerSuggestionCaches(
  primary: Record<string, string[]>,
  fallback: Record<string, string[]>,
) {
  return Object.fromEntries(
    performerSuggestionFieldNames.map((fieldName) => [
      fieldName,
      uniqueSuggestions([
        ...(primary[fieldName] ?? []),
        ...(fallback[fieldName] ?? []),
      ]).slice(0, 10),
    ]),
  );
}

function getStoredPerformerSuggestionCache() {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(performerSuggestionCacheKey) ?? "{}",
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, values]) => Array.isArray(values))
        .map(([fieldName, values]) => [
          fieldName,
          uniqueSuggestions(values as string[]).slice(0, 10),
        ]),
    );
  } catch {
    return {};
  }
}

function storePerformerSuggestionCache(cache: Record<string, string[]>) {
  window.localStorage.setItem(performerSuggestionCacheKey, JSON.stringify(cache));
}

function resetPerformerSuggestionCachesOnce() {
  if (
    window.localStorage.getItem(performerSuggestionCacheVersionKey) ===
    performerSuggestionCacheVersion
  ) {
    return;
  }

  for (const cacheKey of performerSuggestionCacheKeys) {
    window.localStorage.removeItem(cacheKey);
  }
  window.localStorage.setItem(
    performerSuggestionCacheVersionKey,
    performerSuggestionCacheVersion,
  );
}

const performerSuggestionFieldNames = [
  "birthplace",
  "nationality",
  "bloodType",
  "cupSize",
];

function uniqueSuggestions(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const suggestions: string[] = [];

  for (const value of values) {
    const suggestion = value?.trim();
    if (!suggestion) {
      continue;
    }

    const key = suggestion.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    suggestions.push(suggestion);
  }

  return suggestions;
}

function normalizeMeasurementInput(value: string) {
  const digits = measurementDigitsFromValue(value);

  if (digits.length !== 6) {
    return null;
  }

  return `${formatMeasurementDigits(digits)} cm`;
}

function measurementDigitsFromValue(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

function formatMeasurementDigits(digits: string) {
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)]
    .filter(Boolean)
    .join(" / ");
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
    "h-9 w-full rounded-lg border px-3 text-sm transition outline-none selection:bg-transparent",
    inactive
      ? "border-slate-100 bg-slate-50/70 text-slate-500 font-medium cursor-not-allowed"
      : "border-slate-200 bg-white text-slate-700 placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100 font-normal",
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

function AvailabilityBadgeRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const options = ["Owned", "Not Owned", "Missing"];
  return (
    <div className="grid gap-2 text-sm font-semibold text-slate-700 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center">
      <span>{label}</span>
      <div className="flex gap-2.5">
        {options.map((option) => {
          const isSelected = value === option;
          let badgeColorClass = "";
          if (option === "Owned") {
            badgeColorClass = isSelected
              ? "bg-emerald-50 border-emerald-300 text-emerald-700 ring-2 ring-emerald-500/10"
              : "bg-slate-50/50 border-slate-100 text-slate-400 opacity-60 cursor-not-allowed";
          } else if (option === "Not Owned") {
            badgeColorClass = isSelected
              ? "bg-slate-100 border-slate-300 text-slate-700 ring-2 ring-slate-400/10"
              : "bg-slate-50/50 border-slate-100 text-slate-400 opacity-60 cursor-not-allowed";
          } else if (option === "Missing") {
            badgeColorClass = isSelected
              ? "bg-rose-50 border-rose-300 text-rose-700 ring-2 ring-rose-500/10"
              : "bg-slate-50/50 border-slate-100 text-slate-400 opacity-60 cursor-not-allowed";
          }

          return (
            <span
              key={option}
              className={`inline-flex items-center justify-center rounded-full border px-3.5 py-1 text-xs font-semibold shadow-sm transition ${badgeColorClass}`}
            >
              {option}
            </span>
          );
        })}
        {/* Hidden select with aria-label so JSDOM queries find it perfectly */}
        <select
          className="sr-only"
          value={value}
          onChange={() => {}}
          aria-label={label}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function CensorshipSelectInput({
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
  const displayToCensorship = (val: string) => {
    if (val === "Reduced / Reduced Mosaic") return "Reduced";
    if (val === "Unknown") return "";
    return val;
  };

  const censorshipToDisplay = (val: string) => {
    if (val === "Reduced") return "Reduced / Reduced Mosaic";
    if (val === "") return "Unknown";
    return val;
  };

  const uiValue = censorshipToDisplay(value);

  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center">
      {label}
      <select
        className={inputClass(false)}
        value={uiValue}
        onChange={(event) => onChange(displayToCensorship(event.target.value))}
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function SearchTextInput({
  field,
  value,
  onChange,
}: {
  field: TextField;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center">
      <span>{field.label}</span>
      <div className="relative flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          <Search size={14} />
        </span>
        <input
          className="h-9 w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-normal text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
          aria-label={field.label}
          value={value}
          placeholder="Search or enter publisher..."
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </label>
  );
}

function SourceLinksInput() {
  return (
    <div className="grid gap-2 text-sm font-semibold text-slate-700 lg:grid-cols-[240px_minmax(0,1fr)]">
      <span className="pt-2">Source Links</span>
      <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 shadow-sm">
        <div className="flex gap-3">
          <span className="text-lg leading-none" role="img" aria-label="info">ℹ️</span>
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-amber-800">
              External Source Links (Deferred)
            </h4>
            <p className="text-xs font-medium leading-relaxed text-amber-700">
              Source links will be added in a future batch once a database column is added. No data is saved or lost here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FormPage;
