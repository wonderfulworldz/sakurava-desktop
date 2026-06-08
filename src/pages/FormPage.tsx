import { ArrowLeft, CheckCircle2, Plus, Save, Search, Star, Trash2, X } from "lucide-react";
import {
  type ClipboardEvent,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useState,
} from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { listManagedCategories } from "../runtime/managedCategoryCommands";
import { isTauriRuntimeAvailable } from "../runtime/tauriClient";
import { isVideoRuntimeAvailable, listVideos } from "../runtime/videoCommands";
import type { Image, ManagedCategory, Performer, Video } from "../backend/types";
import {
  detectImageTechInfo,
  detectVideoTechInfo,
} from "../lib/mediaTechInfo";
import ConfirmDialog from "../components/ConfirmDialog";

const BUTTON_STYLES = {
  primary: "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sakura-500 px-5 text-xs font-bold text-white transition-colors duration-150 hover:bg-sakura-600 focus:outline-none focus:ring-2 focus:ring-sakura-500/20 disabled:cursor-not-allowed disabled:opacity-50",
  secondary: "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-xs font-bold text-slate-600 transition-colors duration-150 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500/10 disabled:cursor-not-allowed disabled:opacity-50",
  action: "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-sakura-200 bg-sakura-50 px-3.5 text-xs font-bold text-sakura-600 transition-colors duration-150 hover:border-sakura-300 hover:bg-sakura-100 disabled:cursor-not-allowed disabled:opacity-50",
  compactAction: "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-sakura-200 bg-sakura-50 px-2.5 text-xs font-bold text-sakura-600 transition-colors duration-150 hover:border-sakura-300 hover:bg-sakura-100 disabled:cursor-not-allowed disabled:opacity-50",
  iconDanger: "inline-flex size-9 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 transition-colors duration-150 hover:border-rose-300 hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50",
  danger: "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-600 transition-colors duration-150 hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50",
  link: "font-semibold text-sakura-600 hover:text-sakura-700 transition-colors duration-200",
};

const PILL_STYLES = "inline-flex h-7 max-w-full min-w-0 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-semibold";
const CHIP_TEXT_STYLES = "min-w-0 truncate whitespace-nowrap";
const PICKER_ROW_GRID_STYLES =
  "group grid h-12 w-full grid-cols-[minmax(0,1fr)_minmax(10rem,0.75fr)_2.25rem] items-center gap-4";
const FORM_ROW_STYLES =
  "grid gap-2 text-sm font-semibold text-slate-700 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-center";
const FORM_ROW_START_STYLES =
  "grid gap-2 text-sm font-semibold text-slate-700 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-start";

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

type FormConfirmation =
  | "save"
  | "discard"
  | "replaceGallery"
  | "clearGallery"
  | null;

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
  const navigate = useNavigate();
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
  const [managedCategoryRecords, setManagedCategoryRecords] = useState<
    ManagedCategory[]
  >([]);
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
  const [showRatingError, setShowRatingError] = useState(false);
  const [confirmation, setConfirmation] = useState<FormConfirmation>(null);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const [cleanSnapshot, setCleanSnapshot] = useState(() =>
    formSnapshot({
      values: config.initialValues[mode],
      categories: normalizeFormCategories(config.initialCategories[mode]),
      aliases: config.initialAliases?.[mode] ?? [],
      relatedPerformers: config.initialRelatedPerformers?.[mode] ?? [],
      relatedCatalogRecords: config.initialRelatedCatalogRecords?.[mode] ?? [],
      performerRelatedVideos: config.initialPerformerRelatedVideos?.[mode] ?? [],
      performerRelatedImages: config.initialPerformerRelatedImages?.[mode] ?? [],
      galleryImagePaths: config.initialGalleryImagePaths?.[mode] ?? [],
    }),
  );
  const canBrowsePaths = isTauriRuntimeAvailable();
  const supportsRelatedPerformerPicker =
    config.kind === "videos" || config.kind === "images";
  const supportsRelatedCatalogPicker =
    config.kind === "videos" || config.kind === "images";
  const supportsPerformerRelatedCatalogPickers = config.kind === "performers";

  const averageRating = (() => {
    const ratings = config.ratingFields.map((f) =>
      getRatingControlValue(values[f.name]),
    );
    const validRatings = ratings.filter((rating): rating is number => rating !== null);
    if (validRatings.length !== config.ratingFields.length) return null;
    const sum = validRatings.reduce((acc, rating) => acc + rating, 0);
    return sum / validRatings.length;
  })();

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
    setShowRatingError(false);
    setConfirmation(null);
    setConfirmationPending(false);
    setCleanSnapshot(
      formSnapshot({
        values: config.initialValues[mode],
        categories: normalizeFormCategories(config.initialCategories[mode]),
        aliases: config.initialAliases?.[mode] ?? [],
        relatedPerformers: config.initialRelatedPerformers?.[mode] ?? [],
        relatedCatalogRecords: config.initialRelatedCatalogRecords?.[mode] ?? [],
        performerRelatedVideos: config.initialPerformerRelatedVideos?.[mode] ?? [],
        performerRelatedImages: config.initialPerformerRelatedImages?.[mode] ?? [],
        galleryImagePaths: config.initialGalleryImagePaths?.[mode] ?? [],
      }),
    );
  }, [config, mode]);

  useEffect(() => {
    let cancelled = false;
    const storedCategories = getStoredManagedCategories();

    setManagedCategories(storedCategories);
    setManagedCategoryRecords([]);
    resetPerformerSuggestionCachesOnce();

    if (isTauriRuntimeAvailable()) {
      void listManagedCategories()
        .then((records) => {
          if (cancelled) {
            return;
          }

          setManagedCategoryRecords(records);
          setManagedCategories(
            normalizeFormCategories([
              ...records.map((category) => category.name),
              ...storedCategories,
            ]),
          );
        })
        .catch(() => {
          if (!cancelled) {
            setManagedCategoryRecords([]);
          }
        });
    }

    return () => {
      cancelled = true;
    };
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
  const currentSnapshot = formSnapshot({
    values,
    categories: normalizeFormCategories(categories),
    aliases,
    relatedPerformers,
    relatedCatalogRecords,
    performerRelatedVideos,
    performerRelatedImages,
    galleryImagePaths,
  });
  const isDirty = currentSnapshot !== cleanSnapshot;
  const performerTaxonomyOptions =
    config.kind === "performers"
      ? buildPerformerTaxonomyOptions(managedCategoryRecords)
      : null;

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

    if (galleryImagePaths.length > 0) {
      setConfirmation("replaceGallery");
      return;
    }

    await replaceGalleryFolder();
  }

  async function replaceGalleryFolder() {
    try {
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
    validateAndRequestSave();
  }

  function validateAndRequestSave() {
    const requiredValue = values[config.requiredField];

    if (typeof requiredValue !== "string" || requiredValue.trim() === "") {
      setSaveState("error");
      setSaveMessage("Required field is empty.");
      return;
    }

    const missingRatings = config.ratingFields.filter(
      (field) => getRatingControlValue(values[field.name]) === null,
    );

    if (missingRatings.length > 0) {
      setSaveState("error");
      setSaveMessage("Please complete all rating criteria.");
      setShowRatingError(true);
      return;
    }

    setConfirmation("save");
  }

  async function executeSave() {
    if (confirmationPending) {
      return;
    }

    setConfirmationPending(true);
    if (!onSubmit) {
      setSaveState("saved");
      setSaveMessage("Local visual save state only");
      setCleanSnapshot(currentSnapshot);
      setConfirmation(null);
      setConfirmationPending(false);
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
      if (result.state === "saved") {
        setCleanSnapshot(currentSnapshot);
        setConfirmation(null);
      }
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
    } finally {
      setConfirmationPending(false);
    }
  }

  function requestCancel() {
    if (!isDirty) {
      navigate(cancelTo);
      return;
    }
    setConfirmation("discard");
  }

  function clearGalleryPaths() {
    if (galleryImagePaths.length === 0) {
      setGalleryImagePaths([]);
      return;
    }
    setConfirmation("clearGallery");
  }

  function closeConfirmation() {
    if (!confirmationPending) {
      setConfirmation(null);
    }
  }

  async function confirmCurrentAction() {
    if (confirmation === "save") {
      await executeSave();
      return;
    }
    if (confirmation === "discard") {
      navigate(cancelTo);
      return;
    }
    if (confirmation === "replaceGallery") {
      if (confirmationPending) {
        return;
      }
      setConfirmationPending(true);
      await replaceGalleryFolder();
      setConfirmationPending(false);
      setConfirmation(null);
      return;
    }
    if (confirmation === "clearGallery") {
      setGalleryImagePaths([]);
      setConfirmation(null);
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
        onBack={requestCancel}
        title={title}
        subtitle={subtitle}
        formLabel={formLabel}
      />

      <div className="rounded-xl border border-slate-200 bg-white px-6 shadow-sm divide-y divide-slate-100">
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
            <FieldGrid>
              {config.pathFields.find((f) => f.name === "coverPath") && (
                <PathInput
                  field={config.pathFields.find((f) => f.name === "coverPath")!}
                  value={String(values.coverPath ?? "")}
                  browseLabel="Browse"
                  browseDisabled={!canBrowsePaths}
                  onChange={(value) => updateValue("coverPath", value)}
                  onBrowse={() => browsePath(config.pathFields.find((f) => f.name === "coverPath")!)}
                />
              )}
              {config.kind === "videos" && config.pathFields.find((f) => f.name === "mediaPath") && (
                <PathInput
                  field={config.pathFields.find((f) => f.name === "mediaPath")!}
                  value={String(values.mediaPath ?? "")}
                  browseLabel="Browse"
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
                  onClearPaths={clearGalleryPaths}
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
            <div className="space-y-6">
              <div className="border-b border-slate-100 pb-4">
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

              <div>
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
              {performerTaxonomyOptions && (
                <PerformerTaxonomyFields
                  genderOptions={performerTaxonomyOptions.gender}
                  bodyTypeOptions={performerTaxonomyOptions.bodyType}
                  selectedCategories={categories}
                  onChange={setCategories}
                />
              )}
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
        <LabeledControl label="Categories">
          <CategoryPicker
            kind={config.kind}
            selected={categories}
            managedCategories={managedCategories}
            managedCategoryRecords={managedCategoryRecords}
            onChange={setCategories}
          />
        </LabeledControl>
      </FormSection>

      <FormSection index={6} title="Rating">
        {showRatingError && (
          <div
            className="mb-4 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
            data-testid="rating-validation-error"
          >
            Complete all 6 rating criteria before saving.
          </div>
        )}
        <div className="grid gap-x-14 gap-y-2 lg:grid-cols-2">
          {config.ratingFields.map((field) => (
            <RatingInput
              key={field.name}
              label={field.label}
              value={String(values[field.name] ?? "")}
              onChange={(value) => {
                updateValue(field.name, value);
                setShowRatingError(false);
              }}
            />
          ))}
        </div>
        <div className="mt-4 flex h-11 items-center justify-between border-t border-slate-100 pt-3 text-sm font-semibold text-slate-700">
          <span className="text-slate-700">Average: Auto</span>
          <span
            className="inline-flex h-8 min-w-12 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-800"
            data-testid="average-rating-display"
          >
            {averageRating === null ? "Complete all ratings" : averageRating.toFixed(1)}
          </span>
        </div>
      </FormSection>

      {config.kind !== "performers" ? (
        <>
          <FormSection index={7} title="Related Performer">
            <LabeledControl label="Performers">
              <RelatedPerformerPicker
                performers={availablePerformers}
                selected={relatedPerformers}
                loadState={performerLoadState}
                onChange={setRelatedPerformers}
              />
            </LabeledControl>
          </FormSection>

          <FormSection
            index={8}
            title={config.kind === "videos" ? "Related Images" : "Related Video"}
          >
            <LabeledControl label={config.kind === "videos" ? "Images" : "Videos"}>
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
            </LabeledControl>
          </FormSection>
        </>
      ) : (
        <>
          <FormSection index={7} title="Related Videos">
            <LabeledControl label="Videos">
              <RelatedCatalogPicker
                records={availableRelatedVideos}
                selected={performerRelatedVideos}
                loadState={relatedCatalogLoadState}
                targetKind="videos"
                onChange={setPerformerRelatedVideos}
              />
            </LabeledControl>
          </FormSection>

          <FormSection index={8} title="Related Images">
            <LabeledControl label="Images">
              <RelatedCatalogPicker
                records={availableRelatedImages}
                selected={performerRelatedImages}
                loadState={relatedCatalogLoadState}
                targetKind="images"
                onChange={setPerformerRelatedImages}
              />
            </LabeledControl>
          </FormSection>
        </>
      )}

      <NotesSection
        index={9}
        value={String(values.notes ?? "")}
        onChange={(value) => updateValue("notes", value)}
      />
      </div>

      <div className="sticky bottom-0 z-10 border-t border-slate-100 bg-slate-50/95 py-4 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div aria-live="polite">
            {saveState === "saved" && (
              <p className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3.5 text-xs font-bold text-emerald-700">
                <CheckCircle2 size={14} />
                {saveMessage || "Local visual save state only"}
              </p>
            )}
            {saveState === "error" && (
              <p className="inline-flex h-9 items-center rounded-lg border border-rose-100 bg-rose-50 px-3.5 text-xs font-bold text-rose-600">
                {saveMessage || "Required field is empty."}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2.5">
            <button
              type="button"
              onClick={requestCancel}
              className={BUTTON_STYLES.secondary}
            >
              Cancel
            </button>
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
      <ConfirmDialog
        open={confirmation !== null}
        title={formConfirmationCopy(confirmation, config.kind, mode).title}
        description={formConfirmationCopy(confirmation, config.kind, mode).description}
        confirmLabel={formConfirmationCopy(confirmation, config.kind, mode).confirmLabel}
        pending={confirmationPending}
        pendingLabel={formConfirmationCopy(confirmation, config.kind, mode).pendingLabel}
        onCancel={closeConfirmation}
        onConfirm={() => void confirmCurrentAction()}
      />
    </form>
  );
}

function FormHeader({
  backLabel,
  onBack,
  title,
  subtitle,
  formLabel,
}: {
  backLabel: string;
  onBack: () => void;
  title: string;
  subtitle: string;
  formLabel: string;
}) {
  return (
    <div className="flex flex-col gap-5 border-b border-slate-100 pb-6 mb-2">
      <div>
        <button
          type="button"
          onClick={onBack}
          className={BUTTON_STYLES.secondary}
        >
          <ArrowLeft size={14} />
          {backLabel}
        </button>
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
      <label className={FORM_ROW_START_STYLES}>
        <span className="pt-2">Notes</span>
        <textarea
          className="min-h-24 select-text rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-700 outline-none transition selection:bg-sakura-100 selection:text-slate-900 placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
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
    <label className={FORM_ROW_STYLES}>
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
    <label className={FORM_ROW_STYLES}>
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
              "h-9 w-full select-text rounded-lg border px-3 text-sm outline-none transition selection:bg-sakura-100 selection:text-slate-900",
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
  index: _index,
  title,
  children,
  action,
}: {
  index?: number;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="py-6 first:pt-6 last:pb-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight text-slate-900">
          {title}
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

function LabeledControl({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={FORM_ROW_START_STYLES}>
      <span className="pt-3">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
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
    <label className={FORM_ROW_STYLES}>
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
    <div className={FORM_ROW_STYLES}>
      <span>Measurements</span>
      <div className="flex items-center gap-2">
        <input
          className="h-9 min-w-0 flex-1 select-text rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-700 outline-none transition selection:bg-sakura-100 selection:text-slate-900 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
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
    <div className={FORM_ROW_STYLES}>
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
  onClearPaths,
}: {
  paths: string[];
  onChange: Dispatch<SetStateAction<string[]>>;
  folderMessage: string;
  browseFolderDisabled: boolean;
  onBrowseFolder: () => void;
  onClearPaths: () => void;
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

  const visiblePaths = showAllPaths ? paths : paths.slice(0, 5);

  return (
    <div className={FORM_ROW_START_STYLES}>
      <span className="pt-2">Gallery Images</span>
      <div className="grid gap-3">
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
                  className={BUTTON_STYLES.iconDanger}
                  aria-label={`Remove Gallery Image Path ${index + 1}`}
                  title="Remove"
                  onClick={() => removePath(index)}
                >
                  <X size={13} />
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
            Browse
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
            onClick={onClearPaths}
          >
            Clear All
          </button>
        </div>
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
    <label className={FORM_ROW_STYLES}>
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
    <label className={`${FORM_ROW_STYLES} cursor-pointer`}>
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
    <div className={FORM_ROW_STYLES}>
      <span>{label}</span>
      <div className="flex gap-2.5">
        {options.map((option) => {
          const isSelected = value === option;
          let badgeColorClass = "";
          if (option === "Owned") {
            badgeColorClass = isSelected
              ? "bg-emerald-50 border-emerald-300 text-emerald-700 ring-2 ring-emerald-500/10"
              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50";
          } else if (option === "Not Owned") {
            badgeColorClass = isSelected
              ? "bg-slate-100 border-slate-300 text-slate-700 ring-2 ring-slate-400/10"
              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50";
          } else if (option === "Missing") {
            badgeColorClass = isSelected
              ? "bg-rose-50 border-rose-300 text-rose-700 ring-2 ring-rose-500/10"
              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50";
          } else {
            badgeColorClass = isSelected
              ? "bg-sakura-50 border-sakura-300 text-sakura-700 ring-2 ring-sakura-500/10"
              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50";
          }

          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={`${PILL_STYLES} transition-colors duration-150 ${badgeColorClass}`}
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
  const options = ["Active", "Retired", "Unknown"];

  return (
    <div className={FORM_ROW_STYLES}>
      <span>Status</span>
      <div className="flex flex-wrap items-center gap-2.5">
        {options.map((option) => {
          const isSelected = value === option;
          let badgeColorClass = "";
          if (option === "Active") {
            badgeColorClass = isSelected
              ? "bg-emerald-50 border-emerald-300 text-emerald-700 ring-2 ring-emerald-500/10"
              : "bg-slate-50/50 border-slate-100 text-slate-400 opacity-60";
          } else if (option === "Retired") {
            badgeColorClass = isSelected
              ? "bg-amber-50 border-amber-300 text-amber-700 ring-2 ring-amber-500/10"
              : "bg-slate-50/50 border-slate-100 text-slate-400 opacity-60";
          } else {
            badgeColorClass = isSelected
              ? "bg-slate-100 border-slate-300 text-slate-700 ring-2 ring-slate-400/10"
              : "bg-slate-50/50 border-slate-100 text-slate-400 opacity-60";
          }

          return (
            <span
              key={option}
              className={`${PILL_STYLES} ${badgeColorClass}`}
              aria-current={isSelected ? "true" : undefined}
            >
              {option}
            </span>
          );
        })}
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
    <div className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50/50 p-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
      <span className="text-xs font-semibold text-slate-600">{field.label}</span>
      <div className="flex min-w-0 gap-2">
        <input
          className="h-8.5 min-w-0 flex-1 select-text rounded-md border border-slate-200 bg-white px-2.5 text-xs font-normal text-slate-700 outline-none transition selection:bg-sakura-100 selection:text-slate-900 focus:border-sakura-300 focus:ring-2 focus:ring-sakura-100"
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
    <div className={FORM_ROW_START_STYLES}>
      <span className="pt-2">{label}</span>
      <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
        {chips.map((chip) => (
          <span
            key={chip}
            className={`${PILL_STYLES} border-sakura-100 bg-sakura-50 text-sakura-600`}
          >
            <span className={CHIP_TEXT_STYLES}>{chip}</span>
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
          className="min-w-40 flex-1 select-text border-0 bg-transparent px-1 py-1 text-sm font-normal text-slate-700 outline-none selection:bg-sakura-100 selection:text-slate-900 placeholder:text-slate-400"
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
          className="inline-flex size-7 items-center justify-center rounded-full border border-sakura-100 bg-sakura-50 text-sakura-500 transition-colors hover:bg-sakura-100"
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

function PerformerTaxonomyFields({
  genderOptions,
  bodyTypeOptions,
  selectedCategories,
  onChange,
}: {
  genderOptions: TaxonomyCategoryOption[];
  bodyTypeOptions: TaxonomyCategoryOption[];
  selectedCategories: string[];
  onChange: Dispatch<SetStateAction<string[]>>;
}) {
  return (
    <>
      <TaxonomySelect
        label="Gender"
        placeholder="Select gender"
        emptyMessage="No Gender categories found"
        options={genderOptions}
        selectedCategories={selectedCategories}
        onChange={onChange}
      />
      <TaxonomySelect
        label="Body Type"
        placeholder="Select body type"
        emptyMessage="No Body Type categories found"
        options={bodyTypeOptions}
        selectedCategories={selectedCategories}
        onChange={onChange}
      />
    </>
  );
}

function TaxonomySelect({
  label,
  placeholder,
  emptyMessage,
  options,
  selectedCategories,
  onChange,
}: {
  label: string;
  placeholder: string;
  emptyMessage: string;
  options: TaxonomyCategoryOption[];
  selectedCategories: string[];
  onChange: Dispatch<SetStateAction<string[]>>;
}) {
  const optionLabels = new Set(options.map((option) => option.name));
  const selectedValue =
    selectedCategories.find((category) => optionLabels.has(category)) ?? "";
  const disabled = options.length === 0;

  return (
    <div className={FORM_ROW_START_STYLES}>
      <label className="pt-2" htmlFor={`performer-taxonomy-${taxonomyFieldId(label)}`}>
        {label}
      </label>
      <div className="grid gap-1.5">
        <select
          id={`performer-taxonomy-${taxonomyFieldId(label)}`}
          aria-label={label}
          value={selectedValue}
          disabled={disabled}
          className={inputClass(disabled)}
          onChange={(event) => {
            updateTaxonomyCategorySelection(onChange, options, event.target.value);
          }}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.key} value={option.name}>
              {option.name}
            </option>
          ))}
        </select>
        {disabled && (
          <p className="text-xs font-semibold text-slate-500">{emptyMessage}</p>
        )}
      </div>
    </div>
  );
}

function CategoryPicker({
  kind,
  selected,
  managedCategories,
  managedCategoryRecords,
  onChange,
}: {
  kind: FormConfig["kind"];
  selected: string[];
  managedCategories: string[];
  managedCategoryRecords: ManagedCategory[];
  onChange: Dispatch<SetStateAction<string[]>>;
}) {
  const [categorySearch, setCategorySearch] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showAllSelected, setShowAllSelected] = useState(false);
  const normalizedSelected = normalizeFormCategories(selected);
  const normalizedManagedCategories = normalizeFormCategories(managedCategories);
  const categoryOptions = buildCategoryOptions(
    normalizedManagedCategories,
    managedCategoryRecords,
    kind,
  );
  const availableCategories = categoryOptions.filter(
    (category) => !hasFormCategory(normalizedSelected, category.label),
  );
  const categorySearchKey = categorySearch.trim().toLowerCase();
  const filteredCategories = availableCategories.filter((category) =>
    category.searchText.includes(categorySearchKey),
  );
  const visibleSelected = showAllSelected
    ? normalizedSelected
    : normalizedSelected.slice(0, 4);
  const hiddenSelectedCount = Math.max(normalizedSelected.length - visibleSelected.length, 0);
  const shouldShowResults = isSearchOpen && categorySearch.trim().length > 0;

  useEffect(() => {
    if (
      selected.length !== normalizedSelected.length ||
      selected.some((category, index) => category !== normalizedSelected[index])
    ) {
      onChange(normalizedSelected);
    }
  }, [normalizedSelected, onChange, selected]);

  useEffect(() => {
    if (normalizedSelected.length <= 4) {
      setShowAllSelected(false);
    }
  }, [normalizedSelected.length]);

  function addSelectedCategory(category: string) {
    onChange((current) => addFormCategory(current, category));
    setIsSearchOpen(categorySearch.trim().length > 0);
  }

  return (
    <div
      className="grid gap-4 text-sm font-semibold text-slate-700"
      data-testid="category-picker-field"
      onBlur={() => {
        window.setTimeout(() => setIsSearchOpen(false), 120);
      }}
    >
      <div className="relative">
        <Search
          size={18}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
        />
        <input
          className={[
            "h-12 w-full select-text rounded-lg border bg-white pl-12 pr-11 text-sm font-medium text-slate-700 outline-none transition selection:bg-sakura-100 selection:text-slate-900 placeholder:text-slate-400",
            shouldShowResults
              ? "border-sakura-400 ring-4 ring-sakura-100"
              : "border-slate-200 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100",
          ].join(" ")}
          aria-label="Search categories"
          value={categorySearch}
          placeholder={categorySearchPlaceholder(kind)}
          onFocus={() => {
            if (categorySearch.trim()) {
              setIsSearchOpen(true);
            }
          }}
          onChange={(event) => {
            setCategorySearch(event.target.value);
            setIsSearchOpen(event.target.value.trim().length > 0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsSearchOpen(false);
            }
          }}
        />
        {categorySearch.length > 0 && (
          <button
            type="button"
            className="absolute right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-sakura-300"
            aria-label="Clear category search"
            onClick={() => {
              setCategorySearch("");
              setIsSearchOpen(false);
            }}
          >
            <X size={16} />
          </button>
        )}

        {shouldShowResults && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {normalizedManagedCategories.length === 0 ? (
              <p className="px-4 py-3 text-sm font-medium text-slate-500">
                No Managed Categories available.
              </p>
            ) : filteredCategories.length > 0 ? (
              filteredCategories.map((category) => (
                <button
                  key={category.label}
                  type="button"
                  className={`${PICKER_ROW_GRID_STYLES} overflow-hidden border-b border-slate-100 px-4 text-left text-sm font-semibold text-slate-700 transition-colors last:border-b-0 hover:bg-sakura-50 hover:text-sakura-700 focus:bg-sakura-50 focus:outline-none`}
                  data-testid="category-result-row"
                  aria-label={`Add ${category.label}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => addSelectedCategory(category.label)}
                >
                  <span className="min-w-0 truncate whitespace-nowrap font-bold text-slate-800">
                    {category.displayPath}
                  </span>
                  <span
                    className="min-w-0 truncate whitespace-nowrap text-right text-sm font-medium text-slate-500"
                    aria-hidden="true"
                  >
                    {" "}
                  </span>
                  <span className="flex size-8 items-center justify-center justify-self-end rounded-full text-sakura-500 transition-colors group-hover:bg-sakura-100">
                    <Plus size={14} />
                  </span>
                </button>
              ))
            ) : (
              <p className="px-4 py-3 text-sm font-medium text-slate-500">
                No matching Managed Categories. Use Manage Category to add it first.
              </p>
            )}
          </div>
        )}
      </div>

      {normalizedSelected.length === 0 ? (
        <p className="text-sm font-medium text-slate-500">
          No categories selected.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {visibleSelected.map((category) => {
              const isManaged = hasFormCategory(normalizedManagedCategories, category);

              return (
                <span
                  key={category}
                  className={`${PILL_STYLES} ${
                    isManaged
                      ? "border-sakura-100 bg-sakura-50 text-sakura-600"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  <span className={CHIP_TEXT_STYLES}>{category}</span>
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
            })}
          {hiddenSelectedCount > 0 && (
            <button
              type="button"
              className={`${PILL_STYLES} border-slate-200 bg-slate-50 text-slate-700 transition-colors hover:border-sakura-200 hover:bg-sakura-50 hover:text-sakura-600`}
              onClick={() => setShowAllSelected(true)}
            >
              +{hiddenSelectedCount} more
            </button>
          )}
          {showAllSelected && normalizedSelected.length > 4 && (
            <button
              type="button"
              className={`${PILL_STYLES} border-slate-200 bg-white text-slate-500 transition-colors hover:border-sakura-200 hover:bg-sakura-50 hover:text-sakura-600`}
              onClick={() => setShowAllSelected(false)}
            >
              Show less
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-500">
          {normalizedSelected.length > 0
            ? `${normalizedSelected.length} ${
                normalizedSelected.length === 1 ? "category" : "categories"
              } selected`
            : ""}
        </span>
        <div className="flex items-center gap-4">
          {normalizedSelected.length > 0 && (
            <button
              type="button"
              className="font-semibold text-slate-500 transition-colors hover:text-slate-700"
              onClick={() => onChange([])}
            >
              Clear all
            </button>
          )}
          {normalizedSelected.length > 0 && (
            <span className="h-5 w-px bg-slate-200" aria-hidden="true" />
          )}
          <Link
            to="/settings/category-management"
            className="font-semibold text-sakura-600 transition-colors hover:text-sakura-700"
          >
            Manage Category
          </Link>
        </div>
      </div>
    </div>
  );
}

function categorySearchPlaceholder(kind: FormConfig["kind"]) {
  if (kind === "images") {
    return "Search categories, face, body, pose, setting...";
  }

  if (kind === "performers") {
    return "Search categories, face, body, specialty, attribute...";
  }

  return "Search categories, genre, setting, attribute...";
}

type CategoryOption = {
  label: string;
  displayPath: string;
  pathParts: string[];
  searchText: string;
};

type TaxonomyCategoryOption = {
  key: string;
  name: string;
};

function buildPerformerTaxonomyOptions(categories: ManagedCategory[]) {
  return {
    gender: childTaxonomyOptions(categories, ["gender"]),
    bodyType: childTaxonomyOptions(categories, [
      "bodytype",
      "body type",
      "body-type",
      "body_type",
    ]),
  };
}

function childTaxonomyOptions(
  categories: ManagedCategory[],
  parentAliases: string[],
): TaxonomyCategoryOption[] {
  const parent = findTaxonomyParent(categories, parentAliases);
  if (!parent) {
    return [];
  }

  return categories
    .filter((category) =>
      category.parentKey === parent.key &&
      category.showInPerformers &&
      category.name.trim(),
    )
    .map((category) => ({
      key: category.key,
      name: category.name.trim(),
    }));
}

function findTaxonomyParent(
  categories: ManagedCategory[],
  aliases: string[],
) {
  const normalizedAliases = aliases.map(normalizeTaxonomyName);
  const matchingParents = categories.filter((category) =>
    !category.parentKey &&
    normalizedAliases.includes(normalizeTaxonomyName(category.name)),
  );

  return matchingParents.sort((first, second) => {
    const firstExactRank = exactTaxonomyAliasRank(first.name, aliases);
    const secondExactRank = exactTaxonomyAliasRank(second.name, aliases);
    if (firstExactRank !== secondExactRank) {
      return firstExactRank - secondExactRank;
    }
    return categories.indexOf(first) - categories.indexOf(second);
  })[0] ?? null;
}

function exactTaxonomyAliasRank(name: string, aliases: string[]) {
  const normalizedName = name.trim().toLowerCase();
  const exactIndex = aliases.findIndex(
    (alias) => alias.trim().toLowerCase() === normalizedName,
  );
  return exactIndex === -1 ? Number.MAX_SAFE_INTEGER : exactIndex;
}

function normalizeTaxonomyName(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]/g, "");
}

function taxonomyFieldId(label: string) {
  return label.toLowerCase().replace(/\s+/g, "-");
}

function updateTaxonomyCategorySelection(
  onChange: Dispatch<SetStateAction<string[]>>,
  options: TaxonomyCategoryOption[],
  value: string,
) {
  const optionNames = new Set(options.map((option) => option.name));
  onChange((current) => {
    const withoutPreviousTaxonomy = current.filter(
      (category) => !optionNames.has(category),
    );
    return value
      ? normalizeFormCategories([...withoutPreviousTaxonomy, value])
      : normalizeFormCategories(withoutPreviousTaxonomy);
  });
}

function buildCategoryOptions(
  managedCategories: string[],
  managedCategoryRecords: ManagedCategory[],
  kind: FormConfig["kind"],
): CategoryOption[] {
  const optionsByKey = new Map<string, CategoryOption>();
  const recordKeys = new Set(
    managedCategoryRecords
      .map((category) => category.name.trim().toLowerCase())
      .filter(Boolean),
  );
  const recordsByKey = new Map(
    managedCategoryRecords.map((category) => [category.key, category]),
  );

  for (const category of managedCategoryRecords) {
    const label = category.name.trim();
    if (!label) {
      continue;
    }
    if (!categorySupportsFormKind(category, kind)) {
      continue;
    }

    const pathParts = buildManagedCategoryPath(category, recordsByKey);
    const displayPath = pathParts.join(" > ");
    optionsByKey.set(label.toLowerCase(), {
      label,
      displayPath,
      pathParts,
      searchText: `${label} ${displayPath}`.toLowerCase(),
    });
  }

  for (const label of managedCategories) {
    const normalizedLabel = label.trim();
    const key = normalizedLabel.toLowerCase();
    if (!normalizedLabel || optionsByKey.has(key) || recordKeys.has(key)) {
      continue;
    }

    optionsByKey.set(key, {
      label: normalizedLabel,
      displayPath: normalizedLabel,
      pathParts: [normalizedLabel],
      searchText: normalizedLabel.toLowerCase(),
    });
  }

  return [...optionsByKey.values()];
}

function categorySupportsFormKind(
  category: ManagedCategory,
  kind: FormConfig["kind"],
) {
  if (kind === "videos") {
    return category.showInVideos;
  }
  if (kind === "images") {
    return category.showInImages;
  }
  return category.showInPerformers;
}

function buildManagedCategoryPath(
  category: ManagedCategory,
  recordsByKey: Map<string, ManagedCategory>,
) {
  const path = [category.name.trim()].filter(Boolean);
  const visitedKeys = new Set([category.key]);
  let parentKey = category.parentKey;

  while (parentKey && !visitedKeys.has(parentKey)) {
    visitedKeys.add(parentKey);
    const parent = recordsByKey.get(parentKey);
    if (!parent) {
      break;
    }

    const parentName = parent.name.trim();
    if (parentName) {
      path.unshift(parentName);
    }
    parentKey = parent.parentKey;
  }

  return path.length > 0 ? path : [category.name];
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
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const ratingVal = getRatingControlValue(value);
  const previewValue = hoverValue ?? ratingVal;

  return (
    <div className="grid min-h-9 grid-cols-[minmax(7rem,9rem)_auto] items-center justify-start gap-3 text-sm font-semibold text-slate-700">
      <span className="min-w-0 truncate">{label}</span>
      <div
        className="flex shrink-0 items-center gap-1"
        onMouseLeave={() => setHoverValue(null)}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const isSelected = hoverValue === null && ratingVal !== null && ratingVal >= star;
          const isPreviewed = hoverValue !== null && previewValue !== null && previewValue >= star;
          return (
            <button
              key={star}
              type="button"
              onClick={() => onChange(String(star))}
              onMouseEnter={() => setHoverValue(star)}
              className="flex size-7 items-center justify-center rounded-full text-slate-300 transition hover:bg-sakura-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-400"
              aria-label={`Rate ${label} ${star} out of 5`}
            >
              <Star
                size={17}
                className={`transition-colors duration-150 ${
                  isSelected
                    ? "fill-sakura-500 text-sakura-500"
                    : isPreviewed
                      ? "fill-sakura-200 text-sakura-300"
                    : "fill-white text-slate-300"
                }`}
              />
            </button>
          );
        })}
        {/* Hidden input styled with sr-only for test/DOM query compatibility */}
        <input
          type="number"
          min="1"
          max="5"
          className="sr-only"
          value={ratingVal ?? ""}
          onChange={(event) =>
            onChange(formatRatingControlValue(event.target.value))
          }
          aria-label={label}
        />
      </div>
    </div>
  );
}

function getRatingControlValue(value: FormValues[string] | unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : null;
}

function formatRatingControlValue(value: FormValues[string] | unknown) {
  const rating = getRatingControlValue(value);
  return rating === null ? "" : String(rating);
}

function ReadOnlyRows({ fields }: { fields: ReadOnlyField[] }) {
  return (
    <div className="grid gap-3">
      {fields.map((field) => (
        <label
          key={field.label}
          className={FORM_ROW_STYLES}
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

function formSnapshot(data: FormSubmitData) {
  return JSON.stringify(data);
}

function formConfirmationCopy(
  confirmation: FormConfirmation,
  kind: FormConfig["kind"],
  mode: FormMode,
) {
  const noun = kind === "videos" ? "video" : kind === "images" ? "image" : "performer";

  if (confirmation === "discard") {
    return {
      title: "Discard changes?",
      description: "Unsaved changes will be lost.",
      confirmLabel: "Discard",
      pendingLabel: "Discarding...",
    };
  }

  if (confirmation === "replaceGallery") {
    return {
      title: "Replace Gallery Images?",
      description: "Current Gallery Images path rows will be replaced.",
      confirmLabel: "Replace",
      pendingLabel: "Replacing...",
    };
  }

  if (confirmation === "clearGallery") {
    return {
      title: "Clear Gallery Images?",
      description: "Current Gallery Images path rows will be removed from this form.",
      confirmLabel: "Clear",
      pendingLabel: "Clearing...",
    };
  }

  return mode === "create"
    ? {
        title: `Save new ${noun}?`,
        description: "Review the form before saving this new record.",
        confirmLabel: "Save",
        pendingLabel: "Saving...",
      }
    : {
        title: "Save changes?",
        description: "The saved record will be updated with these changes.",
        confirmLabel: "Save changes",
        pendingLabel: "Saving...",
      };
}

function inputClass(inactive: boolean) {
  return [
    "h-9 w-full select-text rounded-lg border px-3 text-sm outline-none transition selection:bg-sakura-100 selection:text-slate-900",
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
    <div className={FORM_ROW_STYLES}>
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
              className={`${PILL_STYLES} ${badgeColorClass}`}
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
    <label className={FORM_ROW_STYLES}>
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
    <label className={FORM_ROW_STYLES}>
      <span>{field.label}</span>
      <div className="relative flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          <Search size={14} />
        </span>
        <input
          className="h-9 w-full select-text rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-normal text-slate-700 outline-none transition selection:bg-sakura-100 selection:text-slate-900 placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
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
  const [rows, setRows] = useState([{ title: "", link: "" }]);

  function updateRow(index: number, field: "title" | "link", value: string) {
    setRows((current) =>
      current.map((row, currentIndex) =>
        currentIndex === index ? { ...row, [field]: value } : row,
      ),
    );
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  return (
    <div className={FORM_ROW_START_STYLES}>
      <span className="pt-2">Source Links</span>
      <div className="grid gap-2">
        {rows.map((row, index) => {
          const canDelete = rows.length > 1;

          return (
            <div
              key={index}
              className="grid gap-2 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)_2.25rem]"
            >
              <input
                className={inputClass(false)}
                aria-label={`Source Link Title ${index + 1}`}
                placeholder={`Title ${index + 1}`}
                value={row.title}
                onChange={(event) => updateRow(index, "title", event.target.value)}
              />
              <input
                className={inputClass(false)}
                aria-label={`Source Link URL ${index + 1}`}
                placeholder={`Link ${index + 1}`}
                value={row.link}
                onChange={(event) => updateRow(index, "link", event.target.value)}
              />
              {canDelete ? (
                <button
                  type="button"
                  className={BUTTON_STYLES.iconDanger}
                  aria-label={`Delete Source Link ${index + 1}`}
                  title="Delete"
                  onClick={() => removeRow(index)}
                >
                  <Trash2 size={14} />
                </button>
              ) : (
                <span aria-hidden="true" />
              )}
            </div>
          );
        })}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-medium text-amber-700">
            Deferred: source links are not saved yet.
          </p>
          <button
            type="button"
            className={BUTTON_STYLES.action}
            onClick={() => setRows((current) => [...current, { title: "", link: "" }])}
          >
            <Plus size={14} />
            Add Link
          </button>
        </div>
      </div>
    </div>
  );
}

export default FormPage;
