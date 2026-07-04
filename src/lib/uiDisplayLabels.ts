export type UiTranslator = (
  key: string,
  replacements?: Record<string, string>,
) => string;

const displayLabelKeys: Record<string, string> = {
  Owned: "enum.availability.owned",
  "Not Owned": "enum.availability.notOwned",
  Missing: "enum.availability.missing",
  Unknown: "enum.common.unknown",
  Uncensored: "enum.censorship.uncensored",
  Censored: "enum.censorship.censored",
  Reduced: "enum.censorship.reduced",
  "Reduced / Reduced Mosaic": "enum.censorship.reduced",
  Leaked: "enum.censorship.leaked",
  Active: "enum.status.active",
  Retired: "enum.status.retired",
  Short: "enum.range.short",
  Medium: "enum.range.medium",
  Long: "enum.range.long",
  Tall: "enum.height.tall",
  Few: "enum.count.few",
  Some: "enum.count.some",
  Many: "enum.count.many",
  All: "enum.count.all",
  Young: "enum.age.young",
  Adult: "enum.age.adult",
  Mature: "enum.age.mature",
  Senior: "enum.age.senior",
  "Title A-Z": "sort.titleAz",
  "Title Z-A": "sort.titleZa",
  "Name A-Z": "sort.nameAz",
  "Name Z-A": "sort.nameZa",
  "Term A-Z": "sort.termAz",
  "Term Z-A": "sort.termZa",
  "Last Added": "sort.lastAdded",
  "Last Updated": "sort.lastUpdated",
  "Last Modified": "sort.lastModified",
  "Parents Only": "filter.parentsOnly",
  "Children Only": "filter.childrenOnly",
  "Videos Used": "filter.videosUsed",
  "Images Used": "filter.imagesUsed",
  "Performers Used": "filter.performersUsed",
  Title: "field.title",
  "Original Title": "field.originalTitle",
  Code: "field.code",
  Name: "field.name",
  "Original Name": "field.originalName",
  Alias: "field.alias",
  Availability: "field.availability",
  Censorship: "field.censorship",
  "Release Date": "field.releaseDate",
  "Publisher / Label": "field.publisherLabel",
  "Cover Path": "form.file.coverPath",
  "Media Path": "form.file.mediaPath",
  Duration: "field.duration",
  Resolution: "field.resolution",
  "File Size": "field.fileSize",
  "File Type": "field.fileType",
  Gender: "field.gender",
  "Birth Date": "field.birthDate",
  Birthplace: "field.birthplace",
  Nationality: "field.nationality",
  Zodiac: "field.zodiac",
  "Astrological Sign / Zodiac": "field.zodiac",
  "Astrological Sign": "form.astrologicalSign",
  "Not set": "form.notSet",
  "Debut Date": "field.debutDate",
  "Retired Date": "field.retiredDate",
  "Body Type": "field.bodyType",
  Height: "field.height",
  Weight: "field.weight",
  Measurement: "field.measurement",
  Measurements: "field.measurement",
  "Cup Size": "field.cupSize",
  "Blood Type": "field.bloodType",
  Rewatch: "rating.rewatch",
  Performance: "rating.performance",
  Visual: "rating.visual",
  Intensity: "rating.intensity",
  Story: "rating.story",
  Chemistry: "rating.chemistry",
  Memorability: "rating.memorability",
  Posing: "rating.posing",
  Atmosphere: "rating.atmosphere",
  Flow: "rating.flow",
  Signature: "rating.signature",
  Attraction: "rating.attraction",
  Popularity: "rating.popularity",
  Exceptional: "rating.exceptional",
  Versatility: "rating.versatility",
  "Back to Videos": "detail.backVideos",
  "Back to Images": "detail.backImages",
  "Back to Performers": "detail.backPerformers",
  "Rating Summary": "detail.ratingSummary",
  "Created in Sakurava": "detail.created",
  "Last edited": "detail.lastEdited",
  "Years Active": "detail.yearsActive",
  Filmography: "form.filmography",
  Pictorials: "form.pictorials",
  "No note saved": "detail.noNote",
  "No notes saved.": "detail.noNotes",
  "Tech Info": "form.techInfo",
  "Video Detail": "detail.videoTitle",
  "Image Detail": "detail.imageTitle",
  "Performer Detail": "detail.performerTitle",
  "View saved video catalog information": "detail.videoSubtitle",
  "View a local image catalog item": "detail.imageSubtitle",
  "View profile, catalog summary, and personal notes": "detail.performerSubtitle",
  "Video Create Form": "form.videoCreateLabel",
  "Video Edit Form": "form.videoEditLabel",
  "Image Create Form": "form.imageCreateLabel",
  "Image Edit Form": "form.imageEditLabel",
  "Performer Create Form": "form.performerCreateLabel",
  "Performer Edit Form": "form.performerEditLabel",
  "Add Video": "form.addVideo",
  "Edit Video": "form.editVideo",
  "Add Image": "form.addImage",
  "Edit Image": "form.editImage",
  "Add Performer": "form.addPerformer",
  "Edit Performer": "form.editPerformer",
  "Create a new video catalog item": "form.createVideoSubtitle",
  "Update a local video catalog item": "form.updateVideoSubtitle",
  "Create a new image catalog item": "form.createImageSubtitle",
  "Update a local image catalog item": "form.updateImageSubtitle",
  "Create a new performer profile": "form.createPerformerSubtitle",
  "Update a local performer profile": "form.updatePerformerSubtitle",
  "Back to Video Detail": "form.backVideoDetail",
  "Back to Image Detail": "form.backImageDetail",
  "Back to Performer Detail": "form.backPerformerDetail",
  "Related Performers": "detail.relatedPerformers",
  "Related Images": "detail.relatedImages",
  "Related Videos": "detail.relatedVideos",
  "New Release": "sort.newRelease",
  "Old Release": "sort.oldRelease",
  Available: "common.status.available",
  "Image Count": "field.imageCount",
  "Main Resolution": "field.mainResolution",
  "Total File Size": "field.totalFileSize",
  "Main File Type": "field.mainFileType",
  File: "form.file",
  "Cover status": "detail.system.coverStatus",
  "Media status": "detail.system.mediaStatus",
  "Gallery status": "detail.system.galleryStatus",
  "Profile image status": "detail.system.profileImageStatus",
  "No related performers saved.": "detail.related.empty.performers",
  "No related images saved.": "detail.related.empty.images",
  "No related videos saved.": "detail.related.empty.videos",
  "Video title": "form.placeholder.videoTitle",
  "Original release title": "form.placeholder.originalVideoTitle",
  "VID-001": "form.placeholder.videoCode",
  "Image set title": "form.placeholder.imageTitle",
  "Original image set title": "form.placeholder.originalImageTitle",
  "IMG-001": "form.placeholder.imageCode",
  "Performer name": "form.placeholder.performerName",
  "Original performer name": "form.placeholder.originalPerformerName",
  "Studio or label": "form.placeholder.publisherLabel",
  minutes: "unit.minutes",
  "n/a": "common.value.notAvailable",
};

export function translateUiDisplayLabel(t: UiTranslator, value: string) {
  const key = displayLabelKeys[value];
  return key ? t(key) : value;
}

export function translateUiDisplayValue(t: UiTranslator, value: string) {
  const activeYears = /^(\d{4})\s*-\s*Now$/i.exec(value.trim());
  if (activeYears) {
    return t("years.activeNow", { start: activeYears[1] });
  }
  const yearDuration = /^\((\d+)\s*-\s*(\d+)\s*y\)$/i.exec(value.trim());
  if (yearDuration) {
    return t("detail.performer.yearsActive.duration", {
      start: yearDuration[1],
      end: yearDuration[2],
    });
  }
  const duration = /^(\d+)\s+min$/i.exec(value.trim());
  if (duration) {
    return formatMinCount(t, duration[1]);
  }
  const count = /^(\d+)\s+(Videos|Images|Performers|Pics|Sets|Minutes)$/i.exec(value.trim());
  if (count) {
    const kind = count[2].toLowerCase();
    return t(`common.count.${kind}`, { count: count[1] });
  }
  return translateUiDisplayLabel(t, value);
}

type CountValue = number | string;

function normalizedCount(value: CountValue) {
  const match = String(value).trim().match(/^[+-]?\d[\d,]*/);
  return match?.[0] ?? String(value);
}

export function formatMinuteCount(t: UiTranslator, count: CountValue) {
  const value = normalizedCount(count);
  return t(value === "1" ? "common.count.minute" : "common.count.minutes", { count: value });
}

export function formatMinCount(t: UiTranslator, count: CountValue) {
  return t("common.count.min", { count: normalizedCount(count) });
}

export function formatImageCount(t: UiTranslator, count: CountValue) {
  const value = normalizedCount(count);
  return t(value === "1" ? "common.count.image" : "common.count.images", { count: value });
}

export function formatPicCount(t: UiTranslator, count: CountValue) {
  const value = normalizedCount(count);
  return t(value === "1" ? "common.count.pic" : "common.count.pics", { count: value });
}

export function formatVideoCount(t: UiTranslator, count: CountValue) {
  const value = normalizedCount(count);
  return t(value === "1" ? "common.count.video" : "common.count.videos", { count: value });
}

export function formatSetCount(t: UiTranslator, count: CountValue) {
  const value = normalizedCount(count);
  return t(value === "1" ? "common.count.set" : "common.count.sets", { count: value });
}

export function formatMoreCount(t: UiTranslator, count: CountValue) {
  return t("common.count.more", { count: normalizedCount(count) });
}

export function catalogFilterChipKey(filterId: string) {
  const keys: Record<string, string> = {
    availability: "catalog.filterChip.availability",
    censorship: "catalog.filterChip.censorship",
    year: "catalog.filterChip.releaseYears",
    publisherLabel: "catalog.filterChip.publisherLabel",
    quality: "catalog.filterChip.quality",
    rating: "catalog.filterChip.rating",
    duration: "catalog.filterChip.duration",
    imageCount: "catalog.filterChip.imageCount",
    status: "catalog.filterChip.availability",
    cupSize: "catalog.filterChip.cupSize",
    gender: "catalog.filterChip.gender",
    height: "catalog.filterChip.bodyHeight",
    age: "catalog.filterChip.age",
    bodyType: "catalog.filterChip.bodyType",
    nationality: "catalog.filterChip.nationality",
    debutYear: "catalog.filterChip.debutYears",
    filmography: "catalog.filterChip.filmographyCount",
    pictorials: "catalog.filterChip.pictorialsCount",
  };
  return keys[filterId] ?? "common.filter";
}

export function translateCatalogFilterValue(
  t: UiTranslator,
  filterId: string,
  value: string,
) {
  if (filterId === "rating") {
    const rating = /^(\d+)\s+star$/i.exec(value);
    if (rating) {
      return t("catalog.filterValue.ratingStars", { count: rating[1] });
    }
  }
  if ((filterId === "year" || filterId === "debutYear") && value === "Older") {
    return t("catalog.filterValue.older");
  }
  const normalized = /^(unknow|unkown)$/i.test(value.trim())
    ? "Unknown"
    : value;
  return translateUiDisplayLabel(t, normalized);
}
