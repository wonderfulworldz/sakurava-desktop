import { Image, Plus, Star, UserRound, Video, type LucideIcon } from "lucide-react";
import type {
  Image as ImageRecord,
  Performer,
  Video as VideoRecord,
} from "../backend/types";

export type HomeSummaryCard = {
  label: string;
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
};

type HomeRecentCandidate = HomeRecentItem & {
  createdAt?: number | string | null;
  updatedAt?: number | string | null;
};

export const summaryCards: HomeSummaryCard[] = [
  {
    label: "Videos",
    value: "0",
    detail: "No saved videos yet",
    icon: Video,
  },
  {
    label: "Images",
    value: "0",
    detail: "No saved images yet",
    icon: Image,
  },
  {
    label: "Performers",
    value: "0",
    detail: "No saved performers yet",
    icon: UserRound,
  },
  {
    label: "Favorites",
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
      label: "Videos",
      value: String(videos.length),
      detail: countDetail(videos.length, "saved video"),
      icon: Video,
    },
    {
      label: "Images",
      value: String(images.length),
      detail: countDetail(images.length, "saved image"),
      icon: Image,
    },
    {
      label: "Performers",
      value: String(performers.length),
      detail: countDetail(performers.length, "saved performer"),
      icon: UserRound,
    },
    {
      label: "Favorites",
      value: String(favoriteCount),
      detail: countDetail(favoriteCount, "favorite item"),
      icon: Star,
    },
  ];
}

export const quickActions = [
  {
    label: "Add Video",
    detail: "Create a new video catalog item",
    to: "/videos/new",
    icon: Plus,
  },
  {
    label: "Add Image",
    detail: "Create a new image catalog item",
    to: "/images/new",
    icon: Plus,
  },
  {
    label: "Add Performer",
    detail: "Create a new performer profile",
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
