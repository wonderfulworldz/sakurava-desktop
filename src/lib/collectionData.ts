import type { LucideIcon } from "lucide-react";
import { Image, UserRound, Video } from "lucide-react";

export type CollectionKind = "videos" | "images" | "performers";

type BaseCollectionItem = {
  key: string;
  title: string;
  originalTitle: string;
  favorite: boolean;
  availability?: string;
  censorship?: string;
  categories: string[];
};

export type VideoCollectionItem = BaseCollectionItem & {
  kind: "videos";
  duration: string;
};

export type ImageCollectionItem = BaseCollectionItem & {
  kind: "images";
  code: string;
  imageCount: string;
};

export type PerformerCollectionItem = {
  kind: "performers";
  key: string;
  name: string;
  originalName: string;
  favorite: boolean;
  status: string;
  filmographyCount: string;
  pictorialsCount: string;
  categories: string[];
};

export type CollectionItem =
  | VideoCollectionItem
  | ImageCollectionItem
  | PerformerCollectionItem;

export type CollectionConfig = {
  kind: CollectionKind;
  title: string;
  subtitle: string;
  countLabel: string;
  actionLabel: string;
  actionTo: string;
  searchPlaceholder: string;
  filterLabel: string;
  filterOptions: string[];
  sortOptions: string[];
  placeholderLabel: string;
  placeholderIcon: LucideIcon;
  items: CollectionItem[];
};

const sharedCategories = ["Favorite", "Private", "Cataloged"];

export const collectionConfigs: Record<CollectionKind, CollectionConfig> = {
  videos: {
    kind: "videos",
    title: "Videos",
    subtitle: "Manage your local video catalog",
    countLabel: "24 videos",
    actionLabel: "Add Video",
    actionTo: "/videos/new",
    searchPlaceholder: "Search videos...",
    filterLabel: "Availability",
    filterOptions: ["All availability", "Owned", "Not Owned", "Missing"],
    sortOptions: ["Recently Added", "Title A-Z", "Release Date", "Duration"],
    placeholderLabel: "Cover Placeholder",
    placeholderIcon: Video,
    items: [
      {
        kind: "videos",
        key: "video-morning-archive",
        title: "Morning Archive",
        originalTitle: "Asa no Archive",
        duration: "124 min",
        availability: "Owned",
        censorship: "Censored",
        categories: ["Drama", "Soft Tone", ...sharedCategories.slice(0, 1)],
        favorite: true,
      },
      {
        kind: "videos",
        key: "video-sakura-session",
        title: "Sakura Session",
        originalTitle: "Sakura no Jikan",
        duration: "98 min",
        availability: "Missing",
        censorship: "Uncensored",
        categories: ["Studio", "Spring"],
        favorite: false,
      },
      {
        kind: "videos",
        key: "video-evening-cut",
        title: "Evening Cut",
        originalTitle: "Yoru no Cut",
        duration: "142 min",
        availability: "Not Owned",
        censorship: "Reduced",
        categories: ["Classic", "Longform"],
        favorite: true,
      },
    ],
  },
  images: {
    kind: "images",
    title: "Images",
    subtitle: "Manage your local image catalog",
    countLabel: "24 images",
    actionLabel: "Add Image",
    actionTo: "/images/new",
    searchPlaceholder: "Search images...",
    filterLabel: "Availability",
    filterOptions: ["All availability", "Owned", "Not Owned", "Missing"],
    sortOptions: ["Recently Added", "Title A-Z", "Image Count", "Publisher"],
    placeholderLabel: "Image Placeholder",
    placeholderIcon: Image,
    items: [
      {
        kind: "images",
        key: "image-city-light-set",
        title: "City Light Set",
        originalTitle: "Machi no Hikari",
        code: "IMG-014",
        imageCount: "84 images",
        availability: "Owned",
        censorship: "Uncensored",
        categories: ["Portrait", "Night", ...sharedCategories.slice(1, 2)],
        favorite: true,
      },
      {
        kind: "images",
        key: "image-studio-notes",
        title: "Studio Notes",
        originalTitle: "Studio Memo",
        code: "IMG-028",
        imageCount: "46 images",
        availability: "Owned",
        censorship: "Censored",
        categories: ["Studio", "Reference"],
        favorite: false,
      },
      {
        kind: "images",
        key: "image-spring-folder",
        title: "Spring Folder",
        originalTitle: "Haru Folder",
        code: "IMG-039",
        imageCount: "112 images",
        availability: "Missing",
        censorship: "Reduced",
        categories: ["Outdoor", "Seasonal"],
        favorite: false,
      },
    ],
  },
  performers: {
    kind: "performers",
    title: "Performers",
    subtitle: "Manage your local performer catalog",
    countLabel: "24 performers",
    actionLabel: "Add Performer",
    actionTo: "/performers/new",
    searchPlaceholder: "Search performers...",
    filterLabel: "Status",
    filterOptions: ["All status", "Active", "Retired", "Unknown"],
    sortOptions: ["Recently Added", "Name A-Z", "Filmography", "Pictorials"],
    placeholderLabel: "Profile Placeholder",
    placeholderIcon: UserRound,
    items: [
      {
        kind: "performers",
        key: "performer-aoi-hanami",
        name: "Aoi Hanami",
        originalName: "Hanami Aoi",
        status: "Active",
        filmographyCount: "18 videos",
        pictorialsCount: "9 pictorials",
        categories: ["Favorite", "Lead", "Studio"],
        favorite: true,
      },
      {
        kind: "performers",
        key: "performer-mika-sora",
        name: "Mika Sora",
        originalName: "Sora Mika",
        status: "Retired",
        filmographyCount: "34 videos",
        pictorialsCount: "14 pictorials",
        categories: ["Classic", "Portrait"],
        favorite: false,
      },
      {
        kind: "performers",
        key: "performer-rin-tsukino",
        name: "Rin Tsukino",
        originalName: "Tsukino Rin",
        status: "Unknown",
        filmographyCount: "7 videos",
        pictorialsCount: "5 pictorials",
        categories: ["New", "Cataloged"],
        favorite: false,
      },
    ],
  },
};
