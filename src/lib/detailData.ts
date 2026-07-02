import type { LucideIcon } from "lucide-react";
import { Image, UserRound, Video } from "lucide-react";
import { parseSourceLinkArray } from "../backend/json";
import { formatLocalTimestampDisplay } from "./dateDisplay";

export type DetailKind = "videos" | "images" | "performers";
export const DETAIL_EMPTY_VALUE = "N/A";

export type RelatedPerformerDetailItem = {
  name: string;
  originalName?: string;
  aliases?: string;
  coverPath?: string;
  metadata?: string;
  rating?: number | null;
  favorite?: boolean;
  filmographyCount?: string;
  pictorialsCount?: string;
  routeTo?: string;
  unresolved: boolean;
};

export type RelatedCatalogDetailItem = {
  title: string;
  originalTitle?: string;
  code?: string;
  coverPath?: string;
  availability?: string;
  censorship?: string;
  publisherLabel?: string;
  metadata?: string;
  releaseDate?: string;
  rating?: number | null;
  favorite?: boolean;
  routeTo?: string;
  roleName?: string;
  creditType?: string;
  unresolved: boolean;
};

export type CreditDetailItem = {
  id: string;
  performerId: string;
  performerName: string;
  performerOriginalName?: string;
  performerRouteTo?: string;
  performerCoverPath?: string;
  performerRating?: number | null;
  performerFavorite?: boolean;
  performerAliases?: string;
  performerFilmographyCount?: string;
  performerPictorialsCount?: string;
  characterName?: string;
  characterOriginalName?: string;
  creditedAs?: string;
  creditType?: string;
  roleImportance?: string;
  billingOrder?: number;
  note?: string;
};

export type FilmographyDetailItem = {
  id: string;
  workTitle: string;
  workOriginalTitle?: string;
  workType: "Video" | "Image";
  workRouteTo?: string;
  releaseDate?: string;
  publisherLabel?: string;
  characterName?: string;
  characterOriginalName?: string;
  creditedAs?: string;
  creditType?: string;
  roleImportance?: string;
  billingOrder?: number;
  note?: string;
};

export type DetailSection = {
  title: string;
  description: string;
  credits?: CreditDetailItem[];
  filmography?: FilmographyDetailItem[];
  relatedPerformers?: RelatedPerformerDetailItem[];
  relatedCatalogRecords?: RelatedCatalogDetailItem[];
  controls?: "performer-related";
};

type RatingAxis = {
  key?: string;
  label: string;
  value: number;
};

type MetadataItem = {
  label: string;
  value: string;
  secondaryValue?: string;
};

export type SourceLinkItem = {
  title?: string;
  url?: string;
};

export type MediaPathItem = {
  label: string;
  path: string;
  playable?: boolean;
};

type BaseDetailConfig = {
  kind: DetailKind;
  recordId?: string;
  title: string;
  subtitle: string;
  backLabel: string;
  backTo: string;
  editTo: string;
  placeholderLabel: string;
  placeholderIcon: LucideIcon;
  coverPath?: string;
  displayTitle: string;
  originalTitle: string;
  favorite: boolean;
  chips: string[];
  categories: string[];
  gender?: MetadataItem;
  bodyType?: MetadataItem;
  metadata: MetadataItem[];
  sourceLinks?: SourceLinkItem[];
  mediaPaths: MediaPathItem[];
  systemInfo: MetadataItem[];
  ratingTitle: string;
  rating: RatingAxis[];
  techTitle: string;
  techMessage: string;
  techItems: MetadataItem[];
  notes: string;
  relatedTitle: string;
  relatedSections: DetailSection[];
};

export type VideoDetailConfig = BaseDetailConfig & {
  kind: "videos";
  code: string;
};

export type ImageDetailConfig = BaseDetailConfig & {
  kind: "images";
  code: string;
  galleryImagePaths: string[];
};

export type PerformerDetailConfig = BaseDetailConfig & {
  kind: "performers";
  aliases: string[];
  thumbnailPaths: string[];
  summary: MetadataItem[];
  personal: MetadataItem[];
  physical: MetadataItem[];
};

export type DetailConfig =
  | VideoDetailConfig
  | ImageDetailConfig
  | PerformerDetailConfig;

export function formatSystemTimestamp(
  value: string | number | null | undefined,
) {
  return formatLocalTimestampDisplay(value, DETAIL_EMPTY_VALUE);
}

export function sourceLinksFromRecord(record: unknown): SourceLinkItem[] {
  if (!record || typeof record !== "object") {
    return [];
  }

  const sourceRecord = record as {
    sourceTitle?: unknown;
    sourceUrl?: unknown;
    sourceLinksJson?: unknown;
  };
  const links: SourceLinkItem[] = [];
  const sourceTitle =
    typeof sourceRecord.sourceTitle === "string" ? sourceRecord.sourceTitle : "";
  const sourceUrl =
    typeof sourceRecord.sourceUrl === "string" ? sourceRecord.sourceUrl : "";

  if (sourceTitle.trim() || sourceUrl.trim()) {
    links.push({
      title: sourceTitle,
      url: sourceUrl,
    });
  }

  if (typeof sourceRecord.sourceLinksJson === "string") {
    links.push(...parseSourceLinkArray(sourceRecord.sourceLinksJson));
  }

  return links;
}

export const detailConfigs: Record<DetailKind, DetailConfig> = {
  videos: {
    kind: "videos",
    title: "Video Detail",
    subtitle: "View saved video catalog information",
    backLabel: "Back to Videos",
    backTo: "/videos",
    editTo: "/videos",
    placeholderLabel: "Cover",
    placeholderIcon: Video,
    displayTitle: "Morning Archive",
    originalTitle: "Asa no Archive",
    code: "VID-024",
    favorite: true,
    chips: ["Owned", "Censored"],
    categories: ["Drama", "Soft Tone", "Favorite"],
    metadata: [
      { label: "Release Date", value: "2025-03-14" },
      { label: "Publisher / Label", value: "Sakura Studio" },
    ],
    mediaPaths: [
      { label: "Cover status", path: "" },
      { label: "Media status", path: "", playable: true },
    ],
    systemInfo: [
      { label: "Created in Sakurava", value: DETAIL_EMPTY_VALUE },
      { label: "Last edited", value: DETAIL_EMPTY_VALUE },
    ],
    ratingTitle: "Rating Summary",
    rating: [
      { label: "Rewatch", value: 4 },
      { label: "Performance", value: 5 },
      { label: "Visual", value: 4 },
      { label: "Intensity", value: 3 },
      { label: "Story", value: 3 },
      { label: "Chemistry", value: 4 },
    ],
    techTitle: "Tech Info",
    techMessage: "",
    techItems: [
      { label: "Duration", value: "124 min" },
      { label: "Resolution", value: DETAIL_EMPTY_VALUE },
      { label: "File Size", value: DETAIL_EMPTY_VALUE },
      { label: "File Type", value: DETAIL_EMPTY_VALUE },
    ],
    notes:
      "No notes saved.",
    relatedTitle: "Related Content",
    relatedSections: [
      {
        title: "Related Performers",
        description: "",
        relatedPerformers: [],
      },
      {
        title: "Related Images",
        description: "",
        relatedCatalogRecords: [],
      },
    ],
  },
  images: {
    kind: "images",
    title: "Image Detail",
    subtitle: "View a local image catalog item",
    backLabel: "Back to Images",
    backTo: "/images",
    editTo: "/images",
    placeholderLabel: "Image",
    placeholderIcon: Image,
    displayTitle: "City Light Set",
    originalTitle: "Machi no Hikari",
    code: "IMG-014",
    favorite: true,
    chips: ["Owned", "Uncensored"],
    categories: ["Portrait", "Night", "Private"],
    metadata: [
      { label: "Release Date", value: "2025-01-22" },
      { label: "Publisher / Label", value: "Urban Light Studio" },
    ],
    mediaPaths: [{ label: "Cover status", path: "" }],
    systemInfo: [
      { label: "Created in Sakurava", value: DETAIL_EMPTY_VALUE },
      { label: "Last edited", value: DETAIL_EMPTY_VALUE },
      { label: "Gallery status", value: DETAIL_EMPTY_VALUE },
    ],
    ratingTitle: "Rating Summary",
    rating: [
      { label: "Memorability", value: 4 },
      { label: "Visual", value: 5 },
      { label: "Posing", value: 4 },
      { label: "Atmosphere", value: 4 },
      { label: "Flow", value: 3 },
      { label: "Signature", value: 5 },
    ],
    techTitle: "Tech Info",
    techMessage: "",
    techItems: [
      { label: "Gallery Count", value: "84 images" },
      { label: "Resolution", value: DETAIL_EMPTY_VALUE },
      { label: "File Size", value: DETAIL_EMPTY_VALUE },
      { label: "File Type", value: DETAIL_EMPTY_VALUE },
    ],
    notes:
      "No notes saved.",
    relatedTitle: "Related Content",
    relatedSections: [
      {
        title: "Related Performers",
        description: "",
        relatedPerformers: [],
      },
      {
        title: "Related Videos",
        description: "",
        relatedCatalogRecords: [],
      },
    ],
    galleryImagePaths: [],
  },
  performers: {
    kind: "performers",
    title: "Performer Detail",
    subtitle: "View profile, catalog summary, and personal notes",
    backLabel: "Back to Performers",
    backTo: "/performers",
    editTo: "/performers",
    placeholderLabel: "Profile image",
    placeholderIcon: UserRound,
    displayTitle: "Aoi Hanami",
    originalTitle: "Hanami Aoi",
    favorite: true,
    chips: ["Active"],
    aliases: ["Aoi H.", "Hanami"],
    thumbnailPaths: [],
    categories: ["Favorite", "Lead", "Studio"],
    summary: [
      { label: "Years Active", value: "2015 - Now" },
      { label: "Filmography", value: "18" },
      { label: "Pictorials", value: "9" },
    ],
    metadata: [
      { label: "Birth Date", value: "1999-04-12" },
      { label: "Debut Date", value: "2015-04-01" },
      { label: "Retired Date", value: DETAIL_EMPTY_VALUE },
    ],
    mediaPaths: [{ label: "Profile image status", path: "" }],
    systemInfo: [
      { label: "Created in Sakurava", value: DETAIL_EMPTY_VALUE },
      { label: "Last edited", value: DETAIL_EMPTY_VALUE },
    ],
    personal: [
      { label: "Birth Place", value: DETAIL_EMPTY_VALUE },
      { label: "Nationality", value: DETAIL_EMPTY_VALUE },
      { label: "Zodiac", value: "Aries" },
      { label: "Blood Type", value: DETAIL_EMPTY_VALUE },
    ],
    physical: [
      { label: "Height", value: DETAIL_EMPTY_VALUE },
      { label: "Weight", value: DETAIL_EMPTY_VALUE },
      { label: "Measurement", value: DETAIL_EMPTY_VALUE },
      { label: "Cup Size", value: DETAIL_EMPTY_VALUE },
    ],
    ratingTitle: "Rating Summary",
    rating: [
      { label: "Attraction", value: 4 },
      { label: "Visual", value: 5 },
      { label: "Performance", value: 4 },
      { label: "Popularity", value: 3 },
      { label: "Exceptional", value: 4 },
      { label: "Versatility", value: 3 },
    ],
    techTitle: "Profile Media",
    techMessage: "",
    techItems: [
      { label: "Performer Thumbnail 1", value: DETAIL_EMPTY_VALUE },
      { label: "Performer Thumbnail 2", value: DETAIL_EMPTY_VALUE },
      { label: "Performer Thumbnail 3", value: DETAIL_EMPTY_VALUE },
      { label: "Performer Thumbnail 4", value: DETAIL_EMPTY_VALUE },
    ],
    notes:
      "No notes saved.",
    relatedTitle: "Related Content",
    relatedSections: [
      {
        title: "Related Videos",
        description: "",
        relatedCatalogRecords: [],
      },
      {
        title: "Related Images",
        description: "",
        relatedCatalogRecords: [],
      },
    ],
  },
};
