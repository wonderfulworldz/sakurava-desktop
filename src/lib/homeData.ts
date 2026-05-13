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
  coverPath?: string;
  favorite: boolean;
};

type HomeRecentCandidate = HomeRecentItem & {
  createdAt?: string | null;
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

// Continue Cataloging is intended for incomplete records, such as items missing
// thumbnails, categories, or important metadata. Keep it static until that
// definition has a safe repository/query path instead of ad hoc scoring.
export const continueItems: string[] = [];

export const recentlyAdded: HomeRecentItem[] = [];

export function buildRecentlyAdded({
  videos,
  images,
  performers,
}: {
  videos: VideoRecord[];
  images: ImageRecord[];
  performers: Performer[];
}): HomeRecentItem[] {
  const videoItems: HomeRecentCandidate[] = videos.map((video) => ({
    kind: "videos" as const,
    key: video.id,
    title: video.title,
    detail: video.code || video.originalTitle || "Video",
    coverPath: video.coverPath,
    favorite: video.favorite,
    createdAt: video.createdAt,
  }));
  const imageItems: HomeRecentCandidate[] = images.map((image) => ({
    kind: "images" as const,
    key: image.id,
    title: image.title,
    detail: image.code || image.originalTitle || "Image",
    coverPath: image.coverPath,
    favorite: image.favorite,
    createdAt: image.createdAt,
  }));
  const performerItems: HomeRecentCandidate[] = performers.map((performer) => ({
    kind: "performers" as const,
    key: performer.id,
    title: performer.name,
    detail: performer.originalName || performer.status || "Performer",
    coverPath: performer.coverPath,
    favorite: performer.favorite,
    createdAt: performer.createdAt,
  }));

  const sortedGroups: HomeRecentCandidate[][] = [
    videoItems,
    imageItems,
    performerItems,
  ].map(sortRecentItems);
  const selected = sortedGroups.flatMap((items) => items.slice(0, 1));
  const selectedKeys = new Set(selected.map((item) => `${item.kind}-${item.key}`));
  const remaining = sortRecentItems(sortedGroups.flat()).filter(
    (item) => !selectedKeys.has(`${item.kind}-${item.key}`),
  );

  return sortRecentItems([...selected, ...remaining.slice(0, 4 - selected.length)])
    .map(({ createdAt: _createdAt, ...item }) => item);
}

function countDetail(count: number, singularLabel: string) {
  if (count === 0) {
    return `No ${singularLabel}s yet`;
  }

  return `${count} ${singularLabel}${count === 1 ? "" : "s"}`;
}

function sortRecentItems<T extends HomeRecentCandidate>(items: T[]) {
  return items
    .slice()
    .sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt));
}

function timestamp(value: string | null | undefined) {
  if (typeof value !== "string") {
    return 0;
  }

  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}
