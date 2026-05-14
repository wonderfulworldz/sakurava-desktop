import { parseTextLabelArray } from "../backend/json";
import type { Image, Performer, Video } from "../backend/types";

export type CategoryRenamePreviewExample = {
  kind: "Video" | "Image" | "Performer";
  label: string;
};

export type CategoryRenamePreview = {
  videos: number;
  images: number;
  performers: number;
  total: number;
  examples: CategoryRenamePreviewExample[];
};

type PreviewRecord = Pick<Video | Image | Performer, "categoriesJson">;
type TitledRecord = PreviewRecord & { title?: string; name?: string };

export function buildCategoryRenamePreview(
  sourceCategory: string,
  records: {
    videos: TitledRecord[];
    images: TitledRecord[];
    performers: TitledRecord[];
  },
  exampleLimit = 8,
): CategoryRenamePreview {
  const sourceKey = sourceCategory.trim().toLowerCase();
  const videoMatches = records.videos.filter((record) =>
    hasCategory(record, sourceKey),
  );
  const imageMatches = records.images.filter((record) =>
    hasCategory(record, sourceKey),
  );
  const performerMatches = records.performers.filter((record) =>
    hasCategory(record, sourceKey),
  );

  return {
    videos: videoMatches.length,
    images: imageMatches.length,
    performers: performerMatches.length,
    total: videoMatches.length + imageMatches.length + performerMatches.length,
    examples: [
      ...videoMatches.map((record) => ({
        kind: "Video" as const,
        label: record.title || "Untitled video",
      })),
      ...imageMatches.map((record) => ({
        kind: "Image" as const,
        label: record.title || "Untitled image",
      })),
      ...performerMatches.map((record) => ({
        kind: "Performer" as const,
        label: record.name || "Untitled performer",
      })),
    ].slice(0, exampleLimit),
  };
}

function hasCategory(record: PreviewRecord, sourceKey: string) {
  if (!sourceKey) {
    return false;
  }

  return parseTextLabelArray(record.categoriesJson).some(
    (category) => category.trim().toLowerCase() === sourceKey,
  );
}
