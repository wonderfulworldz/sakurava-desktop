import type { LucideIcon } from "lucide-react";
import { Image, UserRound, Video } from "lucide-react";

export type DetailKind = "videos" | "images" | "performers";

export type RelatedPerformerDetailItem = {
  name: string;
  originalName?: string;
  unresolved: boolean;
};

export type RelatedCatalogDetailItem = {
  title: string;
  originalTitle?: string;
  unresolved: boolean;
};

export type DetailSection = {
  title: string;
  description: string;
  relatedPerformers?: RelatedPerformerDetailItem[];
  relatedCatalogRecords?: RelatedCatalogDetailItem[];
};

type RatingAxis = {
  key?: string;
  label: string;
  value: number;
};

type MetadataItem = {
  label: string;
  value: string;
};

export type MediaPathItem = {
  label: string;
  path: string;
  playable?: boolean;
};

type BaseDetailConfig = {
  kind: DetailKind;
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
  metadata: MetadataItem[];
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
  if (value === null || value === undefined) {
    return "Not set";
  }

  const rawValue = String(value).trim();
  if (!rawValue) {
    return "Not set";
  }

  const date = /^\d+$/.test(rawValue)
    ? new Date(Number(rawValue))
    : new Date(rawValue);

  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

export const detailConfigs: Record<DetailKind, DetailConfig> = {
  videos: {
    kind: "videos",
    title: "Video Detail",
    subtitle: "View saved video catalog information",
    backLabel: "Back to Videos",
    backTo: "/videos",
    editTo: "/videos/sample-id/edit",
    placeholderLabel: "Cover Placeholder",
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
      { label: "Cover Path", path: "Manual cover path placeholder" },
      {
        label: "Media Path",
        path: "Manual media path placeholder",
        playable: true,
      },
    ],
    systemInfo: [
      { label: "Created in Sakurava", value: "Preview only" },
      { label: "Last edited", value: "Preview only" },
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
    techMessage: "Tech info is data-dependent and not available yet.",
    techItems: [
      { label: "Duration", value: "124 min" },
      { label: "Resolution", value: "Not detected" },
      { label: "File Size", value: "Not detected" },
      { label: "File Type", value: "Not detected" },
    ],
    notes:
      "No notes saved.",
    relatedTitle: "Related Content",
    relatedSections: [
      {
        title: "Related Performer",
        description: "Available after relation features are added.",
      },
      {
        title: "Related Images",
        description: "Available after relation features are added.",
      },
    ],
  },
  images: {
    kind: "images",
    title: "Image Detail",
    subtitle: "View a local image catalog item",
    backLabel: "Back to Images",
    backTo: "/images",
    editTo: "/images/sample-id/edit",
    placeholderLabel: "Image Placeholder",
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
    mediaPaths: [
      { label: "Cover Path", path: "Manual path placeholder" },
      { label: "Folder Path", path: "Manual folder placeholder" },
    ],
    systemInfo: [
      { label: "Created in Sakurava", value: "Preview only" },
      { label: "Last edited", value: "Preview only" },
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
    techMessage: "Gallery tech info is data-dependent and not available yet.",
    techItems: [
      { label: "Image Count", value: "84 images" },
      { label: "Folder Size", value: "Not detected" },
      { label: "Detected Image Count", value: "Not detected" },
      { label: "Main Resolution", value: "Not detected" },
      { label: "File Types", value: "Not detected" },
    ],
    notes:
      "No notes saved.",
    relatedTitle: "Related Content",
    relatedSections: [
      {
        title: "Related Video",
        description: "Available after relation features are added.",
      },
      {
        title: "Related Performer",
        description: "Available after relation features are added.",
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
    editTo: "/performers/sample-id/edit",
    placeholderLabel: "Profile Placeholder",
    placeholderIcon: UserRound,
    displayTitle: "Aoi Hanami",
    originalTitle: "Hanami Aoi",
    favorite: true,
    chips: ["Active"],
    aliases: ["Aoi H.", "Hanami"],
    thumbnailPaths: [],
    categories: ["Favorite", "Lead", "Studio"],
    summary: [
      { label: "Years Active", value: "2015-present\n(19 - 30 y)" },
      { label: "Filmography", value: "18" },
      { label: "Pictorials", value: "9" },
    ],
    metadata: [
      { label: "Birth Date", value: "1999-04-12" },
      { label: "Status", value: "Active" },
    ],
    mediaPaths: [{ label: "Cover Path", path: "Manual cover path placeholder" }],
    systemInfo: [
      { label: "Created in Sakurava", value: "Preview only" },
      { label: "Last edited", value: "Preview only" },
    ],
    personal: [
      { label: "Birthplace", value: "Not saved" },
      { label: "Nationality", value: "Not saved" },
      { label: "Astrological Sign", value: "Not saved" },
      { label: "Blood Type", value: "Not saved" },
    ],
    physical: [
      { label: "Height", value: "Not saved" },
      { label: "Weight", value: "Not saved" },
      { label: "Measurement", value: "Not saved" },
      { label: "Cup Size", value: "Not saved" },
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
    techMessage: "Mini thumbnails use explicit saved local image paths.",
    techItems: [
      { label: "Performer Thumbnail 1", value: "Not set" },
      { label: "Performer Thumbnail 2", value: "Not set" },
      { label: "Performer Thumbnail 3", value: "Not set" },
      { label: "Performer Thumbnail 4", value: "Not set" },
    ],
    notes:
      "No notes saved.",
    relatedTitle: "Related Content",
    relatedSections: [
      {
        title: "Related Video",
        description: "Available after relation features are added.",
      },
      {
        title: "Related Images",
        description: "Available after relation features are added.",
      },
    ],
  },
};
