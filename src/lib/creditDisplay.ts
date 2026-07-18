import {
  parseRelatedCatalogRecordArray,
  parseRelatedPerformerArray,
  parseTextLabelArray,
} from "../backend/json";
import { createRatingSummary } from "./ratingSummary";
import type {
  Credit,
  Image,
  ManagedCategory,
  Performer,
  Video,
} from "../backend/types";
import type {
  CreditDetailItem,
  FilmographyDetailItem,
} from "./detailData";

export function buildCreditDetailItems(
  credits: Credit[],
  performers: Performer[],
  categories: ManagedCategory[],
  relatedPerformersJson: string | null | undefined,
): CreditDetailItem[] {
  const performerById = new Map(
    performers.map((performer) => [performer.id, performer]),
  );
  const categoryByKey = new Map(
    categories.map((category) => [category.key, category.name]),
  );
  const legacyNameByPerformerId = new Map(
    parseRelatedPerformerArray(relatedPerformersJson)
      .filter((relation) => relation.performerId && relation.nameSnapshot)
      .map((relation) => [relation.performerId, relation.nameSnapshot]),
  );

  return credits
    .map((credit, loadedIndex) => {
      const performer = performerById.get(credit.performerId);
      const performerName =
        performer?.name?.trim() ||
        performer?.originalName?.trim() ||
        legacyNameByPerformerId.get(credit.performerId)?.trim() ||
        "Unknown performer";
      const characterName =
        credit.characterMode === "self"
          ? "Self"
          : credit.characterName.trim() || undefined;

      return {
        id: credit.id,
        performerId: credit.performerId,
        performerName,
        performerOriginalName:
          performer?.originalName?.trim() &&
          performer.originalName.trim() !== performerName
            ? performer.originalName.trim()
            : undefined,
        performerRouteTo: performer
          ? `/performers/${performer.id}`
          : undefined,
        performerCoverPath: performer?.coverPath,
        performerRating: performer
          ? createRatingSummary(performer.ratingJson).average
          : undefined,
        performerFavorite: performer?.favorite,
        performerAliases: performer
          ? parseTextLabelArray(performer.aliasesJson).join(", ")
          : undefined,
        performerFilmographyCount: performer
          ? String(parseRelatedCatalogRecordArray(performer.relatedVideosJson).length)
          : undefined,
        performerPictorialsCount: performer
          ? String(parseRelatedCatalogRecordArray(performer.relatedImagesJson).length)
          : undefined,
        characterName,
        characterOriginalName:
          characterName && credit.characterOriginalName?.trim()
            ? credit.characterOriginalName.trim()
            : undefined,
        creditedAs:
          credit.creditedAsMode === "custom"
            ? credit.creditedAs?.trim() || undefined
            : undefined,
        creditType:
          credit.creditTypeText?.trim() ||
          resolveCategoryLabel(
            credit.creditTypeCategoryId || credit.roleImportanceCategoryId,
            categoryByKey,
          ),
        billingOrder:
          typeof credit.billingOrder === "number"
            ? credit.billingOrder
            : undefined,
        note: credit.note?.trim() || undefined,
        loadedIndex,
      };
    })
    .sort((left, right) => {
      const leftOrder = left.billingOrder ?? Number.POSITIVE_INFINITY;
      const rightOrder = right.billingOrder ?? Number.POSITIVE_INFINITY;
      return leftOrder - rightOrder || left.loadedIndex - right.loadedIndex;
    })
    .map(({ loadedIndex: _loadedIndex, ...item }) => item);
}

export function buildFilmographyDetailItems(
  credits: Credit[],
  videos: Video[],
  images: Image[],
  categories: ManagedCategory[],
): FilmographyDetailItem[] {
  const videoById = new Map(videos.map((video) => [video.id, video]));
  const imageById = new Map(images.map((image) => [image.id, image]));
  const categoryByKey = new Map(
    categories.map((category) => [category.key, category.name]),
  );

  return credits
    .map((credit, loadedIndex) => {
      const work =
        credit.workType === "video"
          ? videoById.get(credit.workId)
          : imageById.get(credit.workId);
      const workType: FilmographyDetailItem["workType"] =
        credit.workType === "video" ? "Video" : "Image";
      const workTitle =
        work?.title?.trim() ||
        work?.originalTitle?.trim() ||
        `Unknown ${credit.workType}`;
      const characterName =
        credit.characterMode === "self"
          ? "Self"
          : credit.characterName.trim() || undefined;

      return {
        id: credit.id,
        workTitle,
        workOriginalTitle:
          work?.originalTitle?.trim() &&
          work.originalTitle.trim() !== workTitle
            ? work.originalTitle.trim()
            : undefined,
        workType,
        workRouteTo: work
          ? `/${credit.workType === "video" ? "videos" : "images"}/${work.id}`
          : undefined,
        releaseDate: work?.releaseDate?.trim() || undefined,
        publisherLabel: work?.publisherLabel?.trim() || undefined,
        characterName,
        characterOriginalName:
          characterName && credit.characterOriginalName?.trim()
            ? credit.characterOriginalName.trim()
            : undefined,
        creditedAs:
          credit.creditedAsMode === "custom"
            ? credit.creditedAs?.trim() || undefined
            : undefined,
        creditType:
          credit.creditTypeText?.trim() ||
          resolveCategoryLabel(
            credit.creditTypeCategoryId || credit.roleImportanceCategoryId,
            categoryByKey,
          ),
        billingOrder:
          typeof credit.billingOrder === "number"
            ? credit.billingOrder
            : undefined,
        note: credit.note?.trim() || undefined,
        createdAt: credit.createdAt,
        loadedIndex,
      };
    })
    .sort((left, right) => {
      const typeOrder = left.workType.localeCompare(right.workType);
      if (typeOrder !== 0) {
        return left.workType === "Video" ? -1 : 1;
      }

      const dateOrder = (right.releaseDate ?? "").localeCompare(
        left.releaseDate ?? "",
      );
      if (dateOrder !== 0) {
        return dateOrder;
      }

      const billingOrder =
        (left.billingOrder ?? Number.POSITIVE_INFINITY) -
        (right.billingOrder ?? Number.POSITIVE_INFINITY);
      if (billingOrder !== 0) {
        return billingOrder;
      }

      return (
        left.workTitle.localeCompare(right.workTitle) ||
        left.createdAt.localeCompare(right.createdAt) ||
        left.loadedIndex - right.loadedIndex
      );
    })
    .map(({ createdAt: _createdAt, loadedIndex: _loadedIndex, ...item }) => item);
}

function resolveCategoryLabel(
  key: string | null,
  categoryByKey: Map<string, string>,
) {
  if (!key?.trim()) {
    return undefined;
  }

  return categoryByKey.get(key)?.trim() || key;
}
