# 31 - Functional Spider Chart Rating Planning

## 1. Purpose

Batch 27.3 mendefinisikan rencana Functional Spider Chart Rating sebelum implementasi.

Dokumen ini adalah planning-only. Tidak ada implementasi UI, source code, runtime, database, schema, Tauri config, package config, test, atau perubahan behavior rating dari batch ini.

Implementasi direncanakan untuk Batch 27.4.

## 2. Context

Latest completed checkpoint sebelum batch ini:

```text
post-mvp-27-2-detail-hero-metadata-cleanup-v1
```

Batch 27.1 merencanakan Detail Page V1 layout. Batch 27.2 mengimplementasikan Detail Hero + Metadata Cleanup. Batch 27.3 hanya merencanakan Functional Spider Chart Rating untuk Videos, Images, dan Performers.

Rating Summary saat ini belum menjadi target V1 final. Target V1 adalah spider chart polygon yang functional, bukan sekadar visual radial generik, dan bukan kombinasi star block dengan chart.

## 3. Product Decision: Polygon Spider Chart, Not Generic Radial Chart

Keputusan produk:

- Target V1 adalah functional spider chart polygon.
- Chart harus berbasis polygon, bukan generic circular radial display.
- Jumlah sisi polygon harus mengikuti jumlah valid rating dimensions.
- Polygon harus secara visual mengkomunikasikan jumlah dimension.

Mapping visual:

| Valid dimensions | Shape |
| --- | --- |
| 5 | pentagon / segi lima |
| 6 | hexagon / segi enam |
| 7 | heptagon / segi tujuh |
| 8 | octagon / segi delapan |
| 9+ | polygon sesuai jumlah dimension, dalam batas visual aman |

Jika jumlah dimension terlalu banyak untuk dibaca dengan nyaman, implementasi harus punya batas visual aman atau fallback layout yang tetap jujur. Batch 27.4 harus menentukan batas praktis berdasarkan UI detail page, misalnya tetap render sampai jumlah tertentu dan menampilkan empty/unsupported state jika data terlalu tidak wajar.

## 4. Rating Source and Storage Rules

Source rating tetap:

```text
ratingJson
```

Rules:

- Gunakan existing `ratingJson` sebagai sumber rating.
- Jangan mengubah `ratingJson` storage.
- Jangan menambahkan table rating baru.
- Jangan menambahkan relational rating dimensions.
- Jangan menambahkan schema/database changes.
- Jangan fake rating values.
- Jangan membuat dummy hardcoded rating data untuk mengisi chart.
- Video, Image, dan Performer boleh punya dimension rating yang berbeda.

Batch 27.3 tidak mengubah Catalog sorting/filtering dan tidak mengubah Detail Rating Summary runtime behavior.

## 5. Spider Chart Visual Rules

Spider chart V1 harus render:

- axis lines untuk setiap valid dimension;
- dimension labels di sekitar polygon;
- score polygon yang mengikuti nilai rating;
- scale levels, misalnya 1 sampai 5 atau grid bertingkat;
- center Average / Final Score;
- clean empty state jika rating tidak tersedia.

Visual rules:

- Jumlah axis sama dengan jumlah valid dimensions.
- Jumlah sisi score polygon sama dengan jumlah valid dimensions.
- Scale level harus membantu pembacaan, bukan menjadi dekorasi dominan.
- Center score format direkomendasikan:

```text
4.2 / 5
```

- Layout Detail Rating Summary V1 adalah Spider Chart only.
- Jangan membuat layout stars on left + spider on right.
- Jangan membuat layout spider on top + stars below.
- Star display lama harus dihapus/diganti hanya pada implementation batch khusus, yaitu Batch 27.4.

## 6. RatingJson Parsing Plan

Batch 27.4 sebaiknya menambahkan shared rating helper, misalnya:

- `parseRatingJson()`
- `getRatingDimensions()`
- `calculateAverageRating()`
- `getRatingBucket()`
- `normalizeRatingScore()`

Parsing rules:

- Accept object-style `ratingJson`.
- Key object dapat dipakai sebagai dimension key.
- Label display dapat berasal dari existing form/config labels jika mapping tersedia, atau dari key yang diformat secara aman.
- Ignore invalid values.
- Ignore empty labels atau malformed entries.
- Invalid atau empty `ratingJson` tidak boleh crash.
- Invalid atau empty `ratingJson` harus menghasilkan state jujur: Not rated / Rating not available.
- Jangan render zero-filled polygon jika tidak ada valid rating data.

Score range recommendation:

- Gunakan range valid 1 sampai 5 sebagai default karena current app form semantics memakai rating 1 sampai 5.
- Nilai 0 atau kosong tidak dihitung sebagai valid dimension kecuali future batch secara eksplisit mengubah semantics menjadi 0 sampai 5.
- Nilai di luar range sebaiknya ditolak dari valid dimensions, bukan diam-diam dipakai.
- Jika implementation memilih clamp, aturan clamp harus eksplisit dan ditest. Default planning recommendation adalah reject invalid out-of-range values untuk menghindari fake score.

## 7. Average / Final Score Calculation

Average / Final Score harus dihitung dari valid dimensions:

```text
Average = sum(valid dimension scores) / count(valid dimensions)
```

Rules:

- Hitung hanya dimension yang valid.
- Display satu decimal place jika berguna, contoh `4.2`.
- Center score format:

```text
4.2 / 5
```

- Jika tidak ada valid dimensions, jangan hitung score.
- Jika tidak ada valid dimensions, tampilkan Not rated / Rating not available.

Average / Final Score harus menjadi reusable computed value untuk:

1. Detail Page spider chart center score.
2. Catalog sorting by Rating.
3. Catalog filter by Rating: 1 star, 2 stars, 3 stars, 4 stars, 5 stars.

Karena dipakai lintas Detail dan Catalog, calculation tidak boleh menjadi one-off Detail UI logic.

## 8. Rating Bucket Plan for 1 Star to 5 Stars

Future Catalog Rating filter membutuhkan bucket 1 star sampai 5 stars.

Recommended default adalah floor bucket:

| Bucket | Average / Final Score |
| --- | --- |
| 1 star | 1.0 sampai 1.9 |
| 2 stars | 2.0 sampai 2.9 |
| 3 stars | 3.0 sampai 3.9 |
| 4 stars | 4.0 sampai 4.9 |
| 5 stars | 5.0 |

Examples:

- `4.2` -> 4 stars
- `4.9` -> 4 stars
- `5.0` -> 5 stars

Kenapa floor bucket direkomendasikan:

- predictable untuk filtering;
- tidak membuat `4.5` terlihat sebagai 5 stars;
- lebih konservatif dan tidak menaikkan rating secara implisit;
- mudah dipakai bersama sorting descending.

Alternative rounded bucket boleh dipertimbangkan hanya jika user secara eksplisit mengubah product rule.

## 9. Catalog Sorting/Filter Reuse Plan

Shared rating helper harus dipakai ulang untuk Catalog.

Future Catalog sorting by Rating:

- Sort by Average / Final Score descending.
- Records dengan invalid/no rating sort last.
- Stable sort fallback harus dipakai jika score sama, misalnya original index atau title/name.
- Jangan sort berdasarkan star display text.
- Jangan sort berdasarkan individual dimension kecuali future advanced feature mendefinisikannya.

Future Catalog filter by Rating:

- Gunakan `getRatingBucket()`.
- Filter options tetap 1 star sampai 5 stars.
- Invalid/no rating tidak masuk bucket manapun kecuali future UX menambahkan explicit Not rated filter.
- Videos, Images, dan Performers memakai helper yang sama walaupun dimension berbeda.

## 10. Entity-Specific Dimension Handling

Setiap entity type boleh punya rating dimensions sendiri.

Examples:

- Video dapat memiliki dimensions seperti Story, Visual, Performance, Rewatch, Chemistry.
- Image dapat memiliki dimensions seperti Visual, Composition, Concept, Memorability.
- Performer dapat memiliki dimensions seperti Visual, Performance, Popularity, Versatility, Exceptional.

Planning rule:

- Jangan paksa exact dimension names dalam planning ini jika existing data/config sudah berbeda.
- Jangan paksa semua entity punya dimension count yang sama.
- Helper harus membaca valid dimensions dari `ratingJson` secara aman.
- Jika existing form config menyediakan label yang lebih user-facing, implementation dapat memakainya untuk label chart.
- Jika label tidak tersedia, key `ratingJson` harus diformat defensif dan tidak menampilkan raw malformed value.

## 11. Empty/Invalid Rating Behavior

Empty atau invalid rating harus aman dan jujur.

Behavior:

- Jangan crash.
- Jangan fake score.
- Jangan render zero-filled polygon.
- Jangan menampilkan `0.0 / 5` kecuali product rule masa depan menyatakan 0 rating adalah valid.
- Tampilkan clean empty state seperti:

```text
Not rated
```

atau:

```text
Rating not available
```

Empty state harus tetap compact dan consistent dengan Detail Page V1.

## 12. Recommended 27.4 Implementation Scope

Recommended safe scope untuk Batch 27.4:

- Implement shared rating helper.
- Implement polygon spider chart component.
- Replace Detail Rating Summary dengan Spider Chart only.
- Show center Average / Final Score.
- Handle empty/invalid `ratingJson` safely.
- Add tests untuk:
  - 5 dimension polygon;
  - 6 dimension polygon;
  - empty/invalid `ratingJson`;
  - average calculation;
  - rating bucket helper;
  - no fake chart when no valid dimensions.

Out of 27.4 scope unless user explicitly expands it:

- Catalog Rating sorting/filter implementation.
- Rating storage changes.
- Form rating changes.
- Schema/database changes.
- Tauri/runtime changes.
- New package dependencies unless the implementation cannot be done safely with existing stack.

## 13. Future Catalog Rating Sort/Filter Integration

Future batch after 27.4 should:

- Use shared Average / Final Score helper in Catalog sorting by Rating.
- Use shared rating bucket helper in Catalog Rating filter.
- Keep Videos, Images, and Performers on the same helper.
- Allow entity-specific dimensions.
- Keep invalid/no rating records out of rating filter buckets unless Not rated filter is explicitly planned.
- Avoid duplicating rating calculation in Catalog-specific code.

Potential sequence:

1. 27.4 - Functional Spider Chart Rating Implementation.
2. Future Catalog Rating Sorting/Filter Integration batch.
3. Future QA/smoke batch if rating behavior affects many catalog pages.

## 14. Safety Rules

- No source code changes in 27.3.
- No tests edits in 27.3.
- No database/schema changes.
- No Tauri/runtime changes.
- No package/config changes.
- No `ratingJson` storage change.
- No fake score values.
- No hardcoded dummy rating data.
- No forced uniform dimensions across entity types.
- No Catalog behavior changes in this planning batch.
- No Detail UI implementation in this planning batch.
- Preserve Detail Hero/Metadata cleanup from Batch 27.2.
- Preserve local/offline desktop behavior.
- Do not auto-commit, push, or create PR.

## 15. Non-goals

- No Spider Chart implementation.
- No source code changes.
- No tests edits.
- No Rating Summary UI changes.
- No Catalog sorting/filtering changes.
- No rating form changes.
- No new rating storage model.
- No schema/database changes.
- No Tauri/runtime changes.
- No package dependency changes.
- No Detail Hero/Metadata changes.
- No Tech Info detection.
- No Image Gallery changes.

## 16. Acceptance Criteria

- Docs clearly state target is polygon spider chart, not generic radial chart.
- Docs clearly state polygon side count follows valid rating dimension count.
- Docs clearly define Average / Final Score calculation.
- Docs clearly state Average / Final Score must be reusable for Catalog sort/filter.
- Docs clearly define rating bucket behavior for 1 star to 5 stars.
- Docs clearly state `ratingJson` remains the source.
- Docs clearly state invalid/empty `ratingJson` must not fake chart/score.
- Docs clearly state Detail Rating Summary target is Spider Chart only.
- Docs clearly state no star-left/spider-right or spider-top/star-bottom layout.
- Docs clearly recommend safe 27.4 implementation scope.
- Git diff shows documentation changes only.

## 17. Future Smoke Test Checklist

Use checklist ini untuk Batch 27.4 atau implementation batch setelahnya:

- Video Detail Rating Summary renders Spider Chart only.
- Image Detail Rating Summary renders Spider Chart only.
- Performer Detail Rating Summary renders Spider Chart only.
- Star block layout is removed from Detail Rating Summary.
- No stars-left/spider-right layout exists.
- No spider-top/stars-bottom layout exists.
- 5 valid dimensions render a pentagon / segi lima.
- 6 valid dimensions render a hexagon / segi enam.
- 7 valid dimensions render a heptagon / segi tujuh if supported.
- Center score displays computed Average / Final Score, for example `4.2 / 5`.
- Empty `ratingJson` shows Not rated / Rating not available.
- Invalid `ratingJson` does not crash and does not fake a polygon.
- Average helper ignores invalid values.
- Rating bucket helper maps `4.2` and `4.9` to 4 stars and `5.0` to 5 stars.
- Detail Hero/Metadata cleanup from Batch 27.2 remains unchanged.
- Catalog Rating sorting/filtering remains unchanged until a dedicated Catalog integration batch.

## 18. Expected Checkpoint Tag

Expected checkpoint tag after merge:

```text
post-mvp-27-3-functional-spider-chart-rating-planning-v1
```
