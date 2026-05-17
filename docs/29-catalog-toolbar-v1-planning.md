# 29 - Catalog Toolbar V1 Planning

## 1. Purpose

Batch 26.4 mendefinisikan rencana Catalog Toolbar V1 sebelum implementasi.

Dokumen ini adalah planning-only. Tidak ada implementasi UI, source code, runtime, database, schema, Tauri config, package config, test, atau perubahan behavior Catalog dari batch ini.

Target Catalog Toolbar V1 berlaku untuk:

- Videos Catalog
- Pictures / Images Catalog
- Performers Catalog

## 2. Context

Latest completed checkpoint sebelum batch ini:

```text
post-mvp-26-3-home-page-v1-cleanup-v1
```

Batch 26.1 mendokumentasikan audit dan prioritas UI/UX V1. Batch 26.2 membersihkan App Shell V1. Batch 26.3 membersihkan Home Page V1. Batch 26.4 hanya merencanakan Catalog Toolbar V1, sedangkan implementasi ditargetkan untuk Batch 26.5.

Catalog saat ini sudah memiliki collection search, sort, view toggle, pagination, dan category filtering. Batch ini tidak mengubah behavior tersebut. Rencana ini menentukan bentuk toolbar baru yang lebih compact dan data-safe:

```text
Search - Filter - Sorting - View
```

Product rule utama:

- Filter dan sorting harus berdasarkan record data dan urutan time/value yang tersedia.
- Jangan memaksa content type diversity.
- Jangan membuat artificial balancing pada Catalog list.
- Jangan fake value yang belum tersedia.
- Jika field belum tersedia atau belum reliable, item harus ditandai sebagai planned, disabled, data-dependent, atau future implementation.

## 3. Global Toolbar Structure

Catalog Toolbar V1 menggunakan struktur global:

| Control | Rencana V1 | Catatan |
| --- | --- | --- |
| Search | Tetap terlihat langsung | Preserve existing search behavior jika sudah berjalan. |
| Filter | Satu clean button/icon yang membuka dropdown atau panel | Hindari deretan filter yang membuat toolbar penuh. |
| Sorting | Separate dropdown/control | Default sorting adalah Last Updated jika data-compatible. |
| View | Satu single toggle button | Hindari dua tombol Grid/List terpisah. |

View control harus menjadi satu tombol toggle:

- Jika current state list dan action berikutnya menuju grid, icon dapat menampilkan Grid.
- Jika current state grid dan action berikutnya menuju list, icon dapat menampilkan List.
- Implementasi final boleh memilih apakah icon merepresentasikan current mode atau next action, tetapi harus konsisten dan mudah dipahami.
- Hindari two-button grid/list control lama.

Toolbar harus compact, clean, dan aligned dengan Sakurava V1 style. Batch 26.5 tidak perlu memperkenalkan broad UI polish di luar toolbar.

## 4. Videos Filter/Sorting Plan

### Videos Filter

| Filter | Source | Options / behavior | Classification |
| --- | --- | --- | --- |
| Quality | Resolution data jika sudah tersimpan/terdeteksi | SD, HD, FHD, 2K, 4K, 8K | UI planned but disabled sampai Tech Info detection tersedia |
| Categories | `categoriesJson` | Treat sebagai genre/category labels | Ready for 26.5 jika existing category filtering sudah bekerja |
| Rating | Average rating helper | 1 star, 2 stars, 3 stars, 4 stars, 5 stars | Needs data helper |
| Year | `releaseDate` year | Older, 2010 sampai current target year, contoh 2026 | Needs data helper |
| Duration | `durationMinutes` | Range filter atau planned filter group | Needs data helper |

Quality rules:

- SD mencakup record di bawah 720p.
- Berdasarkan arah user, 720p atau 720x1280 harus diperlakukan sebagai SD.
- Karena portrait/landscape dapat berbeda, klasifikasi resolusi membutuhkan safe helper dan tidak boleh ditebak dari data yang tidak tersedia.
- Jika resolution belum tersimpan atau belum terdeteksi, Quality harus disabled/planned sampai Tech Info detection tersedia.

Rating rules:

- Gunakan average rating jika tersedia.
- Jika data saat ini hanya menyimpan `ratingJson` dimensions, implementasi membutuhkan average rating helper.
- Jangan fake rating values.

Year rules:

- Source adalah year dari `releaseDate`.
- Options sebaiknya auto-generated dari actual records jika memungkinkan.
- `Older` mengelompokkan records sebelum 2010.
- Jangan fake Year jika `releaseDate` tidak tersedia.

Duration rules:

- Duration adalah Videos-only.
- Source adalah `durationMinutes`.
- Jika reliable duration belum tersedia, filter harus planned/disabled.

### Videos Sorting

| Sorting | Source | Direction | Classification |
| --- | --- | --- | --- |
| Last Updated | `updatedAt` | Descending | Ready for 26.5 dengan timestamp parser yang aman |
| New Release | `releaseDate` | Descending | Needs data helper jika parsing releaseDate belum konsisten |
| Title A-Z | `title` | Ascending | Ready for 26.5 jika field tersedia |
| Rating | Average rating helper | Descending | Needs data helper |
| Duration | `durationMinutes` | Descending atau selected direction | Needs data helper |

Last Updated harus preserve safe timestamp parsing dari Batch 26.3, termasuk kompatibilitas ISO dan Tauri millisecond strings.

## 5. Pictures/Images Filter/Sorting Plan

### Pictures / Images Filter

| Filter | Source | Options / behavior | Classification |
| --- | --- | --- | --- |
| Quality | Image/gallery resolution data jika sudah tersimpan/terdeteksi | SD, HD, FHD, 2K, 4K, 8K | UI planned but disabled sampai Tech Info detection tersedia |
| Categories | `categoriesJson` | Treat sebagai genre/category labels | Ready for 26.5 jika existing category filtering sudah bekerja |
| Rating | Average rating helper | 1 star, 2 stars, 3 stars, 4 stars, 5 stars | Needs data helper |
| Year | `releaseDate` year | Older, 2010 sampai current target year, contoh 2026 | Needs data helper |
| Count | `imageCount` atau `galleryImagePathsJson` length | Gallery image count, bukan satu single image | Needs data helper |

Quality rules:

- Quality hanya boleh berdasarkan image/gallery resolution jika resolution data tersedia.
- Jika resolution belum tersimpan atau belum terdeteksi, Quality harus planned/disabled sampai Tech Info detection tersedia.

Count rules:

- Count adalah Pictures/Images-only.
- Count berarti gallery image count, bukan satu single image.
- Source priority:
  1. `imageCount` jika reliable.
  2. Length dari `galleryImagePathsJson` jika safe dan sudah tersedia.
- Jika keduanya belum reliable, Count harus planned.

Year dan Rating rules sama dengan Videos: gunakan data nyata, jangan fake, dan butuh helper jika parsing/average belum tersedia.

### Pictures / Images Sorting

| Sorting | Source | Direction | Classification |
| --- | --- | --- | --- |
| Last Updated | `updatedAt` | Descending | Ready for 26.5 dengan timestamp parser yang aman |
| New Release | `releaseDate` | Descending | Needs data helper jika parsing releaseDate belum konsisten |
| Title A-Z | `title` | Ascending | Ready for 26.5 jika field tersedia |
| Rating | Average rating helper | Descending | Needs data helper |
| Count | Gallery count helper | Descending | Needs data helper |

## 6. Performers Filter/Sorting Plan

### Performers Filter

| Filter | Source | Options / behavior | Classification |
| --- | --- | --- | --- |
| Categories | `categoriesJson` | Treat sebagai category labels | Ready for 26.5 jika existing category filtering sudah bekerja |
| Rating | Average performer rating helper | 1 star, 2 stars, 3 stars, 4 stars, 5 stars | Needs data helper |
| Year / Debut Year | Debut Date / Debut Year | Older, 2010 sampai current target year, contoh 2026 | Needs data helper atau UI planned but disabled jika source belum tersedia |
| Status | Reliable status field | Active, Retired, Unknown jika normalized | Needs data helper / needs normalization |
| Favorite | `favorite` boolean | Favorite only | Ready for 26.5 hanya jika field dan UI fit sudah aman |

Performer-specific Year rules:

- Source adalah Debut Date / Debut Year.
- Jangan gunakan Birth Date.
- Jangan gunakan Active Year.
- Jika Debut Date belum tersedia di storage/form data, filter ini harus planned dan data-dependent.
- Label harus jelas sebagai Performer-specific Year filter, misalnya Debut Year.

Performers tidak boleh memiliki filter Quality, Duration, atau Gallery Count.

### Performers Sorting

| Sorting | Source | Direction | Classification |
| --- | --- | --- | --- |
| Last Updated | `updatedAt` | Descending | Ready for 26.5 dengan timestamp parser yang aman |
| Debut Year | Debut Date / Debut Year | Descending jika tersedia | Needs data helper atau UI planned but disabled |
| Name A-Z | `name` | Ascending | Ready for 26.5 jika field tersedia |
| Rating | Average performer rating helper | Descending | Needs data helper |
| Filmography | `filmographyCount` atau related videos count | Descending jika reliable | Needs data helper / needs separate planning |
| Pictorials | `pictorialsCount` atau related images count | Descending jika reliable | Needs data helper / needs separate planning |

Jangan gunakan New Release untuk Performers kecuali didefinisikan ulang secara eksplisit pada batch berikutnya. Jangan gunakan Birth Date untuk Performer Year filter.

## 7. Field/Source Mapping Table

| Area | Field/source | Dipakai untuk | Safety note |
| --- | --- | --- | --- |
| All Catalogs | Search source existing | Search | Preserve existing behavior. |
| All Catalogs | `categoriesJson` | Categories filter | Preserve existing `categoriesJson` semantics. |
| All Catalogs | `updatedAt` | Last Updated sort | Parser harus aman untuk ISO dan Tauri millisecond strings. |
| Videos/Images | `title` | Title A-Z sort | Ascending, case-insensitive jika existing pattern mendukung. |
| Performers | `name` | Name A-Z sort | Ascending, case-insensitive jika existing pattern mendukung. |
| Videos/Images | `releaseDate` | Year filter, New Release sort | Jangan fake Year jika source kosong/invalid. |
| Performers | Debut Date / Debut Year | Debut Year filter/sort | Jangan pakai Birth Date atau Active Year. |
| Videos | `durationMinutes` | Duration filter/sort | Videos-only; planned jika unreliable. |
| Images | `imageCount` | Count filter/sort | Priority 1 jika reliable. |
| Images | `galleryImagePathsJson` | Count helper fallback | Parse defensively; count gallery paths, bukan single image. |
| All Catalogs | `ratingJson` atau average rating field | Rating filter/sort | Butuh average rating helper jika average belum tersedia. |
| Videos/Images | Resolution fields future | Quality filter | Disabled sampai Tech Info detection/storage tersedia. |
| Performers | `status` | Status filter | Needs normalization jika values tidak konsisten. |
| Performers | `favorite` | Favorite filter | Ready hanya jika existing boolean reliable. |
| Performers | `filmographyCount` atau related videos count | Filmography sort | Needs helper atau separate planning jika belum reliable. |
| Performers | `pictorialsCount` atau related images count | Pictorials sort | Needs helper atau separate planning jika belum reliable. |

## 8. Ready vs Planned/Disabled Classification

### Ready for 26.5

- Search, jika existing behavior sudah bekerja.
- Categories filter, jika existing behavior sudah bekerja.
- Last Updated sort, dengan timestamp parser kompatibel untuk ISO dan Tauri millisecond strings.
- Title A-Z untuk Videos dan Images, jika `title` tersedia.
- Name A-Z untuk Performers, jika `name` tersedia.
- View single-toggle UI.
- Favorite filter untuk Performers hanya jika existing `favorite` field dan UI fit aman.

### UI Planned But Disabled

- Quality untuk Videos dan Images sampai resolution data tersedia.
- Performer Debut Year filter/sort jika Debut Date / Debut Year belum tersedia di storage/form data.
- Disabled entries untuk Rating, Year, Duration, Count, Status, Filmography, dan Pictorials boleh ditampilkan hanya jika label jelas sebagai planned/data-dependent.

### Needs Data Helper

- Average rating helper dari rating data yang tersedia.
- Year options generator dari `releaseDate` atau Debut Date / Debut Year.
- Safe release date parser untuk New Release sorting.
- Count helper dari `imageCount` atau safe `galleryImagePathsJson` length.
- Duration range helper dari `durationMinutes`.
- Status normalization.
- Filmography/Pictorials count helper jika field/counter belum reliable.

### Needs Separate Planning

- Runtime Tech Info detection untuk resolution, duration, file size, dan file type.
- Quality classification helper yang aman untuk portrait/landscape.
- Advanced duration range UX jika bukan simple filter group.
- Advanced count range UX jika bukan simple filter group.
- Performer Filmography/Pictorials derivation dari related records jika storage/count semantics belum final.

### Post-V1

- Runtime scanner atau file metadata enrichment yang luas.
- Schema/database changes untuk toolbar filters.
- Advanced media analytics.
- Artificial diversity/balancing logic.

## 9. Implementation Recommendation for Batch 26.5

Recommended safe scope untuk Batch 26.5:

- Implement toolbar shell/layout:

```text
Search - Filter - Sorting - View
```

- Implement single view toggle.
- Preserve existing search.
- Preserve existing categories filter jika sudah bekerja.
- Implement Last Updated sorting memakai safe timestamp parsing.
- Implement Title A-Z / Name A-Z sorting jika field sudah tersedia.
- Add UI placeholders/disabled entries untuk data-dependent filters hanya jika label jelas.
- Jangan implement Quality sampai resolution data tersedia.
- Jangan implement runtime metadata detection.
- Jangan implement schema changes.
- Jangan ubah Catalog CRUD/list/detail navigation behavior.
- Preserve Image Gallery behavior.
- Preserve Home Page timestamp parser behavior dari Batch 26.3.

Batch 26.5 sebaiknya tidak mencoba menyelesaikan semua filter sekaligus. Toolbar shell, safe sorting, category continuity, dan one-button view toggle adalah scope utama.

## 10. Safety Rules

- Do not change `categoriesJson` storage.
- Do not add relational category tables.
- Do not add schema/database changes.
- Do not add runtime scanner atau file metadata detection dalam toolbar implementation.
- Do not fake Quality jika resolution tidak tersedia.
- Do not fake Rating jika average helper tidak tersedia.
- Do not fake Year jika source date tidak tersedia.
- Do not make Performer Year use Birth Date.
- Do not use Active Year untuk Performer Year filter.
- Do not force type diversity atau artificial balancing dalam catalog lists.
- Preserve current Catalog CRUD/list/detail navigation behavior.
- Preserve Image Gallery behavior.
- Preserve Home Page timestamp parser behavior dari Batch 26.3.
- Preserve local/offline desktop behavior.
- Do not introduce cloud services, scraping, accounts, telemetry, atau network-dependent behavior.
- Do not auto-commit, push, atau create PR dari planning batch ini.

## 11. Non-goals

- No UI implementation in 26.4.
- No source code changes.
- No tests edits.
- No runtime/Tauri changes.
- No database/schema changes.
- No package/config changes.
- No Tech Info detection.
- No Quality detection implementation.
- No Rating average implementation unless already existing.
- No Category Management changes.
- No Settings changes.
- No Home changes.
- No Detail/Form changes.
- No catalog behavior changes.

## 12. Acceptance Criteria

- Docs clearly define Catalog Toolbar V1 structure.
- Docs clearly define filters per Videos, Pictures/Images, and Performers.
- Docs clearly define sorting per Videos, Pictures/Images, and Performers.
- Docs clearly state Performer Year filter uses Debut Date / Debut Year, not Birth Date.
- Docs clearly state Duration is Videos-only.
- Docs clearly state Count is Images/Gallery-only and not single image.
- Docs classify ready vs planned/disabled items.
- Docs warn against fake Quality/Rating/Year values.
- Docs recommend safe 26.5 implementation scope.
- Git diff shows documentation changes only.

## 13. Manual Smoke Test Checklist for Future Implementation

Use checklist ini untuk Batch 26.5 atau implementation batch setelahnya:

- Videos Catalog toolbar renders as Search - Filter - Sorting - View.
- Images Catalog toolbar renders as Search - Filter - Sorting - View.
- Performers Catalog toolbar renders as Search - Filter - Sorting - View.
- Search remains directly visible and preserves existing behavior.
- Filter opens one dropdown/panel, not multiple scattered toolbar controls.
- Sorting is a separate dropdown/control.
- View uses one toggle button, not two Grid/List buttons.
- Last Updated sort orders records by newest updated timestamp first.
- Timestamp parser handles ISO and Tauri millisecond string inputs safely.
- Title A-Z works for Videos and Images if enabled.
- Name A-Z works for Performers if enabled.
- Categories filtering still uses `categoriesJson`.
- Disabled/planned filters are clearly labeled and cannot silently fake values.
- Quality is not enabled without resolution data.
- Rating is not enabled without average rating helper or reliable average field.
- Year is not enabled without source date parsing.
- Performer Year does not use Birth Date.
- Duration appears only for Videos.
- Count appears only for Images/Gallery and counts gallery images, not one single image.
- Catalog CRUD/list/detail navigation still works.
- Image Gallery behavior remains unchanged.

## 14. Expected Checkpoint Tag

Expected checkpoint tag after merge:

```text
post-mvp-26-4-catalog-toolbar-v1-planning-v1
```
