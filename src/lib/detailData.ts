import type { LucideIcon } from "lucide-react";
import { Image, UserRound, Video } from "lucide-react";

export type DetailKind = "videos" | "images" | "performers";

type DetailSection = {
  title: string;
  description: string;
};

type RatingAxis = {
  label: string;
  value: number;
};

type MetadataItem = {
  label: string;
  value: string;
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
  displayTitle: string;
  originalTitle: string;
  favorite: boolean;
  chips: string[];
  categories: string[];
  metadata: MetadataItem[];
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
  galleryLabels: string[];
};

export type PerformerDetailConfig = BaseDetailConfig & {
  kind: "performers";
  aliases: string[];
  summary: MetadataItem[];
  personal: MetadataItem[];
  physical: MetadataItem[];
};

export type DetailConfig =
  | VideoDetailConfig
  | ImageDetailConfig
  | PerformerDetailConfig;

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
      { label: "Duration", value: "124 min" },
      { label: "Publisher / Label", value: "Sakura Studio" },
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
    techMessage: "Tech info is not detected in MVP.",
    techItems: [
      { label: "Resolution", value: "Not detected" },
      { label: "File Size", value: "Not detected" },
      { label: "File Type", value: "Not detected" },
    ],
    notes:
      "Static notes preview for the selected video. Real saved notes arrive in a later integration batch.",
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
      { label: "Image Count", value: "84 images" },
      { label: "Publisher / Label", value: "Urban Light Studio" },
      { label: "Cover Path", value: "Manual path placeholder" },
      { label: "Folder Path", value: "Manual folder placeholder" },
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
    techMessage: "Folder analysis is not available in MVP.",
    techItems: [
      { label: "Folder Size", value: "Not detected" },
      { label: "Detected Image Count", value: "Not detected" },
      { label: "Main Resolution", value: "Not detected" },
      { label: "File Types", value: "Not detected" },
    ],
    notes:
      "Static notes preview for a local image set. Folder scanning and saved edits are intentionally out of scope here.",
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
    galleryLabels: [
      "Gallery Placeholder 1",
      "Gallery Placeholder 2",
      "Gallery Placeholder 3",
      "Gallery Placeholder 4",
      "Gallery Placeholder 5",
      "Gallery Placeholder 6",
    ],
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
    categories: ["Favorite", "Lead", "Studio"],
    summary: [
      { label: "Years Active", value: "2015 - present" },
      { label: "Filmography", value: "18" },
      { label: "Pictorials", value: "9" },
    ],
    metadata: [
      { label: "Birth Date", value: "1999-04-12" },
      { label: "Status", value: "Active" },
      { label: "Profile Source", value: "Manual placeholder" },
    ],
    personal: [
      { label: "Birthplace", value: "Tokyo, Japan" },
      { label: "Nationality", value: "Japanese" },
      { label: "Astrological Sign", value: "Aries" },
      { label: "Blood Type", value: "O" },
    ],
    physical: [
      { label: "Height", value: "165 cm" },
      { label: "Weight", value: "50 kg" },
      { label: "Measurement", value: "88-58-85 cm" },
      { label: "Cup Size", value: "C" },
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
    techMessage: "Thumbnail paths are inactive placeholders in MVP.",
    techItems: [
      { label: "Thumbnail 1", value: "Placeholder" },
      { label: "Thumbnail 2", value: "Placeholder" },
      { label: "Thumbnail 3", value: "Placeholder" },
      { label: "Thumbnail 4", value: "Placeholder" },
    ],
    notes:
      "Static performer notes preview. Advanced profile fields are visual placeholders until a later approved phase.",
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
