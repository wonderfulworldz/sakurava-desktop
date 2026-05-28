import { Image, Plus, Star, UserRound, Video, type LucideIcon } from "lucide-react";
import type {
  Image as ImageRecord,
  Performer,
  Video as VideoRecord,
} from "../backend/types";
import { parseTextLabelArray } from "../backend/json";
import { deriveQualityBucket } from "./catalogDerivedFields";
import { createRatingSummary } from "./ratingSummary";

export type HomeSummaryCard = {
  labelKey: string;
  value: string;
  detail: string;
  icon: LucideIcon;
};

export type HomeRecentItem = {
  kind: "videos" | "images" | "performers";
  key: string;
  title: string;
  detail: string;
  typeLabel: "Video" | "Image" | "Performer";
  coverPath?: string;
  favorite: boolean;
  code?: string;
  aliases?: string;
  releaseYear?: string;
  rating?: number | null;
  duration?: string;
  imageCount?: string;
  filmographyCount?: string;
  pictorialsCount?: string;
  censorship?: string;
  quality?: string;
};

type HomeRecentCandidate = HomeRecentItem & {
  createdAt?: number | string | null;
  updatedAt?: number | string | null;
};

export const summaryCards: HomeSummaryCard[] = [
  {
    labelKey: "home.summaryVideos",
    value: "0",
    detail: "No saved videos yet",
    icon: Video,
  },
  {
    labelKey: "home.summaryImages",
    value: "0",
    detail: "No saved images yet",
    icon: Image,
  },
  {
    labelKey: "home.summaryPerformers",
    value: "0",
    detail: "No saved performers yet",
    icon: UserRound,
  },
  {
    labelKey: "home.summaryFavorites",
    value: "0",
    detail: "No favorites yet",
    icon: Star,
  },
];

export function buildHomeSummaryCards({
  videos,
  images,
  performers,
}: {
  videos: VideoRecord[];
  images: ImageRecord[];
  performers: Performer[];
}): HomeSummaryCard[] {
  const favoriteCount = [...videos, ...images, ...performers].filter(
    (item) => item.favorite,
  ).length;

  return [
    {
      labelKey: "home.summaryVideos",
      value: String(videos.length),
      detail: countDetail(videos.length, "saved video"),
      icon: Video,
    },
    {
      labelKey: "home.summaryImages",
      value: String(images.length),
      detail: countDetail(images.length, "saved image"),
      icon: Image,
    },
    {
      labelKey: "home.summaryPerformers",
      value: String(performers.length),
      detail: countDetail(performers.length, "saved performer"),
      icon: UserRound,
    },
    {
      labelKey: "home.summaryFavorites",
      value: String(favoriteCount),
      detail: countDetail(favoriteCount, "favorite item"),
      icon: Star,
    },
  ];
}

export const quickActions = [
  {
    labelKey: "home.addVideo",
    detailKey: "home.addVideoDetail",
    to: "/videos/new",
    icon: Plus,
  },
  {
    labelKey: "home.addImage",
    detailKey: "home.addImageDetail",
    to: "/images/new",
    icon: Plus,
  },
  {
    labelKey: "home.addPerformer",
    detailKey: "home.addPerformerDetail",
    to: "/performers/new",
    icon: Plus,
  },
];

export const recentlyAdded: HomeRecentItem[] = [];

export const lastEdited: HomeRecentItem[] = [];

export function buildRecentlyAdded({
  videos,
  images,
  performers,
}: {
  videos: VideoRecord[];
  images: ImageRecord[];
  performers: Performer[];
}): HomeRecentItem[] {
  return sortRecentlyAddedItems(normalizeHomeItems({ videos, images, performers }))
    .slice(0, 4)
    .map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...item }) => item);
}

export function buildLastEdited({
  videos,
  images,
  performers,
}: {
  videos: VideoRecord[];
  images: ImageRecord[];
  performers: Performer[];
}): HomeRecentItem[] {
  return sortContinueCatalogingItems(
    normalizeHomeItems({ videos, images, performers }),
  )
    .slice(0, 3)
    .map(({ updatedAt: _updatedAt, createdAt: _createdAt, ...item }) => item);
}

function normalizeHomeItems({
  videos,
  images,
  performers,
}: {
  videos: VideoRecord[];
  images: ImageRecord[];
  performers: Performer[];
}): HomeRecentCandidate[] {
  return [
    ...videos.map((video) => ({
      kind: "videos" as const,
      key: video.id,
      title: video.title,
      detail: video.code || video.originalTitle || "Video",
      typeLabel: "Video" as const,
      coverPath: video.coverPath,
      favorite: video.favorite,
      code: video.code || "No code",
      releaseYear: releaseYear(video.releaseDate),
      rating: createRatingSummary(video.ratingJson).average,
      duration: formatMinutes(video.durationMinutes),
      censorship: video.censorship || "Unspecified",
      quality: deriveQualityBucket(video) ?? undefined,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
    })),
    ...images.map((image) => ({
      kind: "images" as const,
      key: image.id,
      title: image.title,
      detail: image.code || image.originalTitle || "Image",
      typeLabel: "Image" as const,
      coverPath: image.coverPath,
      favorite: image.favorite,
      code: image.code || "No code",
      releaseYear: releaseYear(image.releaseDate),
      rating: createRatingSummary(image.ratingJson).average,
      imageCount: formatImageCount(image.imageCount),
      censorship: image.censorship || "Unspecified",
      quality: deriveQualityBucket(image) ?? undefined,
      createdAt: image.createdAt,
      updatedAt: image.updatedAt,
    })),
    ...performers.map((performer) => ({
      kind: "performers" as const,
      key: performer.id,
      title: performer.name,
      detail: performer.originalName || performer.status || "Performer",
      typeLabel: "Performer" as const,
      coverPath: performer.coverPath,
      favorite: performer.favorite,
      aliases: formatAliases(performer.aliasesJson),
      rating: createRatingSummary(performer.ratingJson).average,
      filmographyCount: String(relatedCount(performer.relatedVideosJson)),
      pictorialsCount: String(relatedCount(performer.relatedImagesJson)),
      createdAt: performer.createdAt,
      updatedAt: performer.updatedAt,
    })),
  ];
}

function countDetail(count: number, singularLabel: string) {
  if (count === 0) {
    return `No ${singularLabel}s yet`;
  }

  return `${count} ${singularLabel}${count === 1 ? "" : "s"}`;
}

function releaseYear(value: string) {
  const match = value.trim().match(/^(\d{4})/);
  return match?.[1] ?? "Unknown";
}

function formatMinutes(value: number | null) {
  return value && value > 0 ? `${value} min` : "-";
}

function formatImageCount(value: number | null) {
  return value && value > 0 ? `${value} images` : "-";
}

function relatedCount(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function formatAliases(value: string | null | undefined) {
  const aliases = parseTextLabelArray(value)
    .map((alias) => alias.trim())
    .filter(Boolean);

  return aliases.length > 0 ? aliases.join(", ") : "No aliases";
}

function sortRecentlyAddedItems<T extends HomeRecentCandidate>(items: T[]) {
  return items
    .slice()
    .sort((left, right) => {
      const rightTime = timestamp(right.createdAt) || timestamp(right.updatedAt);
      const leftTime = timestamp(left.createdAt) || timestamp(left.updatedAt);

      return rightTime - leftTime;
    });
}

function sortContinueCatalogingItems<T extends HomeRecentCandidate>(items: T[]) {
  return items
    .slice()
    .sort((left, right) => {
      const rightTime = timestamp(right.updatedAt) || timestamp(right.createdAt);
      const leftTime = timestamp(left.updatedAt) || timestamp(left.createdAt);

      return rightTime - leftTime;
    });
}

function timestamp(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const trimmed = value.trim();

  if (trimmed === "") {
    return 0;
  }

  const numericTime = Number(trimmed);
  const numericLike = /^[-+]?(?:\d+|\d*\.\d+)$/.test(trimmed);

  if (Number.isFinite(numericTime) && numericTime > 0) {
    return numericTime;
  }

  if (numericLike) {
    return 0;
  }

  const time = Date.parse(trimmed);
  return Number.isFinite(time) ? time : 0;
}
