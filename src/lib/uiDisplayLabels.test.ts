import { describe, expect, it } from "vitest";
import { getAllTranslationKeys, getBuiltInText, translate } from "./language";
import {
  catalogFilterChipKey,
  formatImageCount,
  formatMinCount,
  formatMinuteCount,
  formatMoreCount,
  formatPicCount,
  formatSetCount,
  formatVideoCount,
  translateCatalogFilterValue,
  translateUiDisplayLabel,
  translateUiDisplayValue,
} from "./uiDisplayLabels";

const overrides = {
  "enum.availability.owned": "Dimiliki",
  "sort.titleAz": "Judul A-Z",
  "years.activeNow": "{start} - Sekarang",
  "detail.performer.yearsActive.duration": "({start} sampai {end} tahun)",
  "common.count.images": "{count} Gambar",
  "common.count.minutes": "{count} Menit",
  "common.count.min": "{count} mnt",
  "common.count.pics": "{count} foto",
  "common.count.videos": "{count} video",
  "common.count.sets": "{count} set",
  "common.count.more": "+{count} lainnya",
  "enum.status.active": "Aktif",
  "enum.common.unknown": "Tidak diketahui",
  "catalog.filterValue.ratingStars": "{count} bintang",
};

const t = (key: string, replacements: Record<string, string> = {}) =>
  translate("id", key, replacements, overrides);

describe("UI display translations", () => {
  it("translates shared enum and sort labels without changing stored values", () => {
    expect(translateUiDisplayLabel(t, "Owned")).toBe("Dimiliki");
    expect(translateUiDisplayLabel(t, "Title A-Z")).toBe("Judul A-Z");
    expect(translateUiDisplayLabel(t, "User Category")).toBe("User Category");
  });

  it("translates dynamic years and count templates", () => {
    expect(translateUiDisplayValue(t, "2020 - Now")).toBe("2020 - Sekarang");
    expect(translateUiDisplayValue(t, "(20 - 25 y)")).toBe(
      "(20 sampai 25 tahun)",
    );
    expect(translateUiDisplayValue(t, "12 Images")).toBe("12 Gambar");
  });

  it("translates shared card and compact table count formats", () => {
    expect(formatMinuteCount(t, 12)).toBe("12 Menit");
    expect(formatImageCount(t, "12 images")).toBe("12 Gambar");
    expect(formatMinCount(t, 86)).toBe("86 mnt");
    expect(formatPicCount(t, 42)).toBe("42 foto");
    expect(formatVideoCount(t, 3)).toBe("3 video");
    expect(formatSetCount(t, 4)).toBe("4 set");
    expect(formatMoreCount(t, 2)).toBe("+2 lainnya");
  });

  it("maps every catalog active-filter prefix and translates enum values", () => {
    expect([
      "availability",
      "censorship",
      "year",
      "publisherLabel",
      "quality",
      "rating",
      "duration",
      "imageCount",
      "status",
      "cupSize",
      "gender",
      "height",
      "age",
      "bodyType",
      "nationality",
      "debutYear",
      "filmography",
      "pictorials",
    ].map(catalogFilterChipKey)).toEqual([
      "catalog.filterChip.availability",
      "catalog.filterChip.censorship",
      "catalog.filterChip.releaseYears",
      "catalog.filterChip.publisherLabel",
      "catalog.filterChip.quality",
      "catalog.filterChip.rating",
      "catalog.filterChip.duration",
      "catalog.filterChip.imageCount",
      "catalog.filterChip.availability",
      "catalog.filterChip.cupSize",
      "catalog.filterChip.gender",
      "catalog.filterChip.bodyHeight",
      "catalog.filterChip.age",
      "catalog.filterChip.bodyType",
      "catalog.filterChip.nationality",
      "catalog.filterChip.debutYears",
      "catalog.filterChip.filmographyCount",
      "catalog.filterChip.pictorialsCount",
    ]);
    expect(translateCatalogFilterValue(t, "status", "Active")).toBe("Aktif");
    expect(translateCatalogFilterValue(t, "status", "Unknow")).toBe(
      "Tidak diketahui",
    );
    expect(translateCatalogFilterValue(t, "rating", "5 star")).toBe(
      "5 bintang",
    );
  });

  it("keeps representative smoke labels exportable with canonical English copy", () => {
    expect(getBuiltInText("en", "catalog.table.header.availability")).toBe("AVAILABILITY");
    expect(getBuiltInText("en", "detail.imageTitle")).toBe("Image Detail");
    expect(getBuiltInText("en", "form.categorySearchVideo")).toBe(
      "Search categories, genre, setting, attribute...",
    );
    expect(getBuiltInText("en", "form.miniThumbnailEmpty")).toBe(
      "No Mini Thumbnail Path row added.",
    );

    const english = getAllTranslationKeys()
      .map((key) => getBuiltInText("en", key))
      .join("\n");
    expect(english).not.toMatch(/\bUnknow\b|\bCURD\b|Childs Only|Performer Used/);
    expect(english).not.toMatch(/^Reduce$/m);
  });
});
