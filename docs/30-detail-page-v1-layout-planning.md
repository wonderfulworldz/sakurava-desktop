# 30 - Detail Page V1 Layout Planning

## 1. Purpose

Batch 27.1 mendefinisikan rencana layout Detail Page V1 sebelum implementasi.

Dokumen ini adalah planning-only. Tidak ada implementasi UI, source code, runtime, database, schema, Tauri config, package config, test, atau perubahan behavior Detail dari batch ini.

Detail Page V1 mencakup:

- Video Detail
- Image Detail
- Performer Detail

## 2. Context

Latest completed checkpoint sebelum batch ini:

```text
post-mvp-26-6-categories-page-v1-cleanup-v1
```

Batch 26.1 mendokumentasikan audit dan prioritas UI/UX V1. Batch 26.2 membersihkan App Shell V1. Batch 26.3 membersihkan Home Page V1. Batch 26.4 merencanakan Catalog Toolbar V1. Batch 26.5 mengimplementasikan Catalog Toolbar V1. Batch 26.6 membersihkan Categories Page V1.

Batch 27.1 hanya merencanakan layout Detail Page V1. Implementasi ditargetkan untuk batch berikutnya dan harus tetap mempertahankan CRUD/detail navigation, Image Gallery behavior, `categoriesJson`, `galleryImagePathsJson`, dan related JSON behavior yang sudah ada.

## 3. Detail Page V1 Principles

- Detail pages harus lebih clean, information-focused, dan tidak terasa placeholder/MVP.
- Layout mengikuti arah Sakurava V1: light, minimal, Apple-inspired, dan konsisten dengan App Shell, Home, Catalog Toolbar, dan Categories Page V1.
- Perubahan harus staged dan reversible.
- Jangan mencampur Detail Hero, rating chart, Tech Info detection, related picker, form, Settings, atau Category Management dalam satu batch implementasi.
- Jangan expose raw IDs, UUIDs, raw JSON, atau raw file/folder paths di normal metadata.
- Jangan fake Quality, resolution, file size, file type, rating average, filmography, pictorials, atau path status.
- Preserve Image Gallery full-size viewer behavior.
- Preserve no-folder-scan rule untuk Image Detail.
- Jangan memperkenalkan schema/database/runtime changes dari planning batch ini.

## 4. Video Detail V1 Plan

### Hero target

- Code dan Favorite top-right aligned.
- Title prominent sebagai fokus utama.
- Original Title tampil di bawah Title jika tersedia.
- Play button tampil sebagai primary action jika media path tersedia dan action aman.
- Auto resolution label direncanakan: SD, HD, FHD, 2K, 4K, 8K.
- Owned status tampil sebagai user-facing status.
- Censored/Censorship tampil sebagai user-facing status.
- Categories tampil sebagai chips dari `categoriesJson`.
- Cover/thumbnail tetap memakai safe fallback.
- Hero tidak menampilkan raw ID, raw JSON, raw media path, atau raw cover path.

### Planning notes

- Resolution label bergantung pada Tech Info detection/storage. Jika data belum tersedia, label harus planned/data-dependent dan tidak ditampilkan sebagai nilai aktif.
- Play button harus preserve behavior dari Video Detail Play Button batch. Batch 27.1 tidak mengubah action open media.
- Categories chips hanya membaca existing `categoriesJson`; tidak ada perubahan storage kategori.

## 5. Image Detail V1 Plan

### Hero target

- Code dan Favorite top-right aligned.
- Title prominent sebagai fokus utama.
- Original Title tampil di bawah Title jika tersedia.
- Auto resolution label direncanakan: SD, HD, FHD, 2K, 4K, 8K.
- Owned status tampil sebagai user-facing status.
- Censored/Censorship tampil sebagai user-facing status.
- Categories tampil sebagai chips dari `categoriesJson`.
- Cover/thumbnail tetap memakai safe fallback.
- Hero tidak menampilkan raw ID, raw JSON, raw folder path, raw gallery paths, atau raw cover path.

### Planning notes

- Resolution label bergantung pada Tech Info detection/storage. Jika data belum tersedia, label harus planned/data-dependent.
- Image Gallery harus tetap memakai saved explicit paths dari `galleryImagePathsJson`; `folderPath` tidak boleh discan dari Image Detail.

## 6. Performer Detail V1 Plan

### Hero target

- Name prominent sebagai fokus utama.
- Original Name tampil jika tersedia.
- Favorite top-right aligned.
- Status tampil jika data reliable.
- Categories tampil sebagai chips dari `categoriesJson`.
- Cover/profile image tetap memakai safe fallback.
- Mini Thumbnail / Detail Thumbnail concept tetap aligned dengan performer thumbnail work yang sudah ada.
- Hero tidak menampilkan raw ID, raw JSON, atau raw file paths.

### Planning notes

- Performer Detail tidak memiliki Quality, Duration, atau Gallery Count seperti media records.
- Status harus jujur. Jika status value belum normalized, tampilkan hanya data yang aman atau tandai sebagai membutuhkan normalization.

## 7. Section Order Recommendations

### Video Detail

1. Hero
2. Main metadata / content summary
3. Rating Summary / Spider Chart
4. Tech Info
5. Related Performers / Related Images
6. System Info
7. Notes / secondary information jika masih diperlukan

### Image Detail

1. Hero
2. Gallery
3. Main metadata / content summary
4. Rating Summary / Spider Chart
5. Tech Info
6. Related Performers / Related Videos
7. System Info
8. Notes / secondary information jika masih diperlukan

### Performer Detail

1. Hero
2. Main profile summary
3. Rating Summary / Spider Chart
4. Related Videos
5. Related Images
6. Personal / Physical information jika tersedia dan data-compatible
7. System Info
8. Notes / secondary information jika masih diperlukan

Urutan ini boleh disesuaikan sedikit pada implementasi jika struktur komponen existing membutuhkan path yang lebih aman, tetapi implementasi harus mendokumentasikan alasan perubahan.

## 8. Metadata Cleanup Plan

### Video

- Pindahkan Duration keluar dari general Metadata dan masukkan ke Tech Info.
- Sembunyikan Cover Path dan Media Path dari normal Metadata.
- Normal Metadata hanya berisi field user-facing seperti title, original title, release information, owned/censorship status, categories, dan notes yang relevan.
- Raw path status boleh diringkas di System Info, bukan ditampilkan sebagai path mentah.

### Image

- Pindahkan Image Count keluar dari general Metadata ke Tech Info jika appropriate.
- Sembunyikan Cover Path dan Folder Path dari normal Metadata.
- Normal Metadata hanya berisi field user-facing seperti title, original title, release information, owned/censorship status, categories, dan notes yang relevan.
- Gallery source tetap `galleryImagePathsJson`; raw list path tidak boleh tampil di normal Metadata.

### Performer

- Summary harus lebih concise dan tidak terasa placeholder.
- Years Active sebaiknya dihapus dari V1 jika roadmap implementation batch mengonfirmasi tidak lagi cocok.
- Debut Date dan Retired Date direncanakan sebagai field profile yang lebih jelas, tetapi hanya aktif jika storage/form data sudah mendukung atau setelah storage planning.
- Filmography harus dihitung dari related videos jika reliable.
- Pictorials harus dihitung dari related images jika reliable.
- Personal dan Physical fields boleh diaktifkan/integrasikan hanya jika storage existing mendukung atau planning terpisah menyetujuinya.

## 9. Rating / Spider Chart Planning

V1 target adalah mengganti star display sederhana dengan functional spider/radar chart.

Functional berarti:

- membaca dimension rating dari `ratingJson` secara defensif;
- mendukung jumlah dimension yang variable, misalnya 5, 6, atau lebih;
- menampilkan axis, label dimension, score polygon, dan scale yang mudah dibaca;
- menghitung average/final score secara jujur dari dimension yang valid;
- menampilkan average/final score di center chart;
- menangani empty/invalid `ratingJson` tanpa crash dan tanpa fake value.

Rules:

- Gunakan `ratingJson` sebagai current rating source jika memungkinkan.
- Jangan mengubah `ratingJson` storage dalam Batch 27.1.
- Video, Image, dan Performer boleh memiliki dimension rating yang berbeda.
- Jika `ratingJson` kosong/invalid, tampilkan empty state seperti Not rated atau Rating not available, bukan chart palsu.
- Rating average/final score membutuhkan helper yang teruji.
- Spider chart membutuhkan planning/implementation terpisah jika helper dan visual component belum siap.

Acceptance criteria untuk future spider chart implementation:

- Chart render untuk 5 dan 6 dimension.
- Chart tetap aman untuk dimension kosong, score invalid, dan label kosong.
- Average/final score sesuai data valid yang tersedia.
- Tidak ada fake score ketika data tidak tersedia.
- Tidak mengubah `ratingJson` storage.

## 10. Tech Info Planning

Tech Info adalah section terpisah untuk data teknis yang benar-benar tersedia.

### Video Tech Info target

- duration in minutes
- resolution
- file size
- file type

### Image Tech Info target

- image/gallery count
- resolution
- file size
- file type

### Performer Tech Info target

Performer tidak memiliki media Tech Info yang sama dengan Videos/Images. Jika dibutuhkan, Performer sebaiknya memakai System Info atau Profile Asset Info yang hanya merangkum status cover/detail thumbnail secara jujur.

### Planning notes

- Runtime metadata detection adalah high-risk dan data-dependent.
- Jangan implement file metadata reading, scanner, watcher, atau folder live scan dari Batch 27.1.
- Jangan menambahkan schema/database changes dari Detail layout planning.
- Jika source fields tidak tersedia, Tech Info item harus planned/data-dependent atau dipindahkan ke batch planning terpisah.
- Resolution Quality label harus bergantung pada data nyata, bukan dugaan dari path atau filename.

## 11. Media Status / System Info Planning

V1 target adalah menghapus separate Media File Status section jika ada dan menggabungkan status sederhana ke System Info.

System Info sebaiknya merangkum:

- cover path status: Set, Not set, Missing, atau Available jika data/status aman;
- media path status untuk Videos: Set, Not set, Missing, atau Available jika data/status aman;
- folder path/gallery path status untuk Images hanya jika aman dan tidak membaca folder dari Detail;
- relevant timestamps: Created dan Last edited.

Rules:

- Jangan tampilkan raw paths di normal metadata.
- Jika path info perlu ditampilkan, gunakan wording user-friendly dan ringkas.
- Jangan tampilkan raw JSON.
- Jangan membuat large technical block kecuali dibutuhkan untuk troubleshooting yang disetujui.
- Preserve existing Media File Status safety: tidak delete, move, rename, modify, auto-play, scan recursive, atau watch files.

## 12. Related Cards Planning

Related sections harus terasa seperti small collection cards, bukan raw relation dump.

Card target:

- thumbnail/fallback;
- title/name;
- type label jika membantu;
- concise metadata yang aman;
- tidak menampilkan raw IDs atau raw JSON;
- missing related records ditangani dengan empty/missing state yang aman.

Per page target:

- Performer Detail menambahkan Related Videos dan Related Images jika related data reliable.
- Video Detail mempertahankan related performers/images sesuai storage existing.
- Image Detail mempertahankan related performers/videos sesuai storage existing.

Planning notes:

- Gunakan related JSON sources yang sudah ada jika tersedia.
- Jangan implement relation picker changes dalam Batch 27.1.
- Jangan mengubah storage related data dalam Batch 27.1.
- Jangan auto-create, auto-mutate, atau auto-link records dari Detail Page.

## 13. Image Gallery Placement Planning

Image Detail Gallery V1 target:

- Gallery berada di bawah Hero dan di atas Metadata.
- Initial load dikurangi menjadi kira-kira 2 visible rows sebelum Load More.
- Contoh desktop target: 8 columns x 2 rows = 16 initial images jika layout mendukung.
- Karena responsive columns dapat berubah, implementation requirement adalah approximately 2 visible rows, bukan hard-code 16 untuk semua viewport.
- Preserve Gallery full-size viewer behavior.
- Preserve Previous/Next, zoom, fullscreen, close, counter/status, dan keyboard behavior yang sudah ada.
- Preserve no folder live scan rule.
- Gallery tetap memakai saved `galleryImagePathsJson`-derived paths only.
- Jangan scan `folderPath`.
- Jangan read folder dari Image Detail.
- Jangan copy/import/move/rename/delete/generate thumbnails.

Thumbnail preview/view mode:

- Cover preview sebaiknya selaras dengan overlay style Picture Detail Gallery viewer jika implementasi reuse aman.
- Safe fallback tetap dipertahankan.
- Jangan generate thumbnails.
- Jangan copy/import files.

## 14. Data Readiness Classification

| Item | Classification | Notes |
| --- | --- | --- |
| Video/Image/Performer hero cleanup | Ready for 27.2 | Layout/copy/order cleanup tanpa storage change. |
| Hide raw path fields from normal metadata | Ready for 27.2 | Raw path status dipindahkan ke System Info summary jika aman. |
| Move Gallery below Image Hero | Ready for 27.2 atau 27.8 | Low risk, tetapi bisa dipisah ke 27.8 agar 27.2 tetap fokus hero/metadata. |
| Reduce Image Gallery initial visible rows | Ready for 27.8 | Butuh adjustment render count dan responsive expectation. |
| Related section visual card cleanup | Ready for 27.7 jika related data tersedia | Jangan mengubah picker/storage. |
| System Info wording cleanup | Ready for 27.2 jika current status data tersedia | Path status helper mungkin diperlukan. |
| Created / Last edited display | Ready for 27.2 | Preserve existing timestamp display dan parser safety. |
| Rating average/final score | Needs helper | Hitung dari valid rating dimensions only. |
| Spider chart dimension parser | Needs helper | Parse `ratingJson` defensively. |
| Path status labels | Needs helper | Dibutuhkan jika status belum centralized. |
| Gallery visible row calculation | Needs helper | Hanya jika responsive behavior tidak bisa memakai fixed safe count. |
| Functional spider chart implementation | Needs separate planning | Batch 27.3/27.4. |
| Runtime Tech Info detection | Needs separate planning | Batch 27.5/27.6; high-risk. |
| Resolution Quality label | Needs separate planning | Bergantung pada stored/detected resolution. |
| File size/file type detection | Needs separate planning | Jangan fake dari path. |
| Performer Personal/Physical full integration | Needs separate planning | Tergantung storage/form completeness. |
| Filmography/Pictorials from related records | Needs separate planning | Butuh reliable related data/count helper. |
| Debut Date / Retired Date persistence | Needs storage/schema planning if not stored | Jangan pakai Birth Date sebagai substitute. |
| Persistent Tech Info fields | Needs storage/schema planning | Jika metadata perlu disimpan. |
| Category thumbnail or advanced category relation | Needs storage/schema planning | Di luar Detail Page V1. |
| Advanced media player | Post-V1 unless promoted | Deferred. |
| Runtime scanner/live watcher | Post-V1 unless promoted | Deferred dan high-risk. |
| Internal metadata extraction pipeline | Post-V1 unless promoted | Deferred. |
| Advanced analytics | Post-V1 unless promoted | Deferred. |

## 15. Safety Rules

- No source code changes in 27.1.
- No tests edits in 27.1.
- No database/schema changes.
- No Tauri/runtime changes.
- No file scanning.
- No folder live scan.
- No thumbnail generation.
- No file copy/import/move/rename/delete/write.
- Preserve Image Gallery no-folder-scan rule.
- Preserve `galleryImagePathsJson` as saved explicit gallery paths.
- Preserve `categoriesJson` behavior.
- Preserve related JSON storage behavior.
- Do not expose raw IDs, UUIDs, or raw JSON in UI planning.
- Do not show raw paths in normal metadata.
- Do not fake Quality/Tech Info values.
- Do not fake rating average/final score.
- Do not use Birth Date as Performer Debut Year.
- Keep changes staged and reversible.
- Do not auto-commit, push, or create PR from this planning batch.

## 16. Non-goals

- No Detail UI implementation.
- No source code changes.
- No tests edits.
- No runtime/Tauri changes.
- No database/schema changes.
- No package/config changes.
- No Tech Info detection.
- No runtime metadata extraction.
- No file scanner or watcher.
- No thumbnail generation.
- No Image Gallery storage change.
- No related storage change.
- No relation picker changes.
- No Category Management changes.
- No Settings changes.
- No Form changes.
- No Home changes.
- No Catalog Toolbar changes.
- No Image Gallery full-size viewer behavior changes.
- No advanced media player.

## 17. Recommended Implementation Batch Sequence

Recommended sequence setelah 27.1:

1. 27.2 - Detail Hero + Metadata Cleanup
2. 27.3 - Functional Spider Chart Rating Planning
3. 27.4 - Functional Spider Chart Rating Implementation
4. 27.5 - Tech Info + Media Status Planning
5. 27.6 - Tech Info + Media Status Implementation
6. 27.7 - Related Cards on Detail Pages
7. 27.8 - Image Detail Gallery Placement Adjustment

Rationale:

- 27.2 dapat menangani cleanup visual yang paling low-risk: hero order, metadata hiding, System Info wording ringan, dan no raw path cleanup.
- Spider chart dipisah karena butuh parser, average/final score helper, dan visual acceptance criteria.
- Tech Info dipisah karena runtime metadata detection dan persistence bisa high-risk.
- Related Cards dipisah supaya tidak tercampur dengan relation picker/storage work.
- Image Gallery placement dipisah agar preserve viewer behavior dan no-folder-scan rule bisa diverifikasi fokus.

Jika implementasi 27.2 menemukan Image Gallery placement sangat kecil dan aman, perubahan Gallery boleh tetap ditunda ke 27.8 agar scope Detail Hero + Metadata Cleanup tidak melebar.

## 18. Acceptance Criteria

- Docs clearly define Video Detail V1 layout.
- Docs clearly define Image Detail V1 layout.
- Docs clearly define Performer Detail V1 layout.
- Docs clearly state Image Gallery moves below Image Hero and above Metadata.
- Docs clearly state Image Gallery should show about 2 rows before Load More.
- Docs clearly state Media File Status should merge into System Info.
- Docs clearly state raw file paths should not appear in normal metadata.
- Docs clearly state Rating Summary spider chart needs planning/implementation.
- Docs clearly state Tech Info is data-dependent and must not fake values.
- Docs classify ready vs helper/planning/storage/post-V1 items.
- Docs include implementation batch sequence.
- Git diff shows documentation changes only.

## 19. Future Smoke Test Checklist

Use checklist ini untuk Batch 27.2 sampai 27.8 sesuai scope masing-masing:

- Video Detail hero shows Code/Favorite top-right, Title prominent, Original Title when available, Play primary when media path action is available, Owned, Censored/Censorship, Categories chips, and safe cover fallback.
- Video Detail normal metadata does not show raw ID, raw JSON, raw Cover Path, or raw Media Path.
- Image Detail hero shows Code/Favorite top-right, Title prominent, Original Title when available, Owned, Censored/Censorship, Categories chips, and safe cover fallback.
- Image Detail Gallery appears below Hero and above Metadata after placement batch.
- Image Detail Gallery initially shows approximately 2 visible rows before Load More.
- Image Detail Gallery full-size viewer still supports Previous/Next, zoom, fullscreen, close, counter/status, and keyboard behavior.
- Image Detail does not scan `folderPath` and uses only saved `galleryImagePathsJson` paths.
- Image Detail normal metadata does not show raw ID, raw JSON, raw Folder Path, raw Gallery paths, or raw Cover Path.
- Performer Detail hero shows Name prominent, Original Name if available, Favorite top-right, Status if reliable, Categories chips, and safe profile fallback.
- Performer Detail does not show raw ID, raw JSON, or raw file paths.
- Performer Detail does not use Birth Date as Debut Year.
- Rating Summary handles valid, empty, and invalid `ratingJson` without fake values.
- Tech Info displays only data-backed values or honest unavailable/planned states.
- System Info summarizes path/timestamp status with user-friendly labels.
- Related cards show thumbnail/fallback, title/name, type label if needed, and safe concise metadata.
- Missing related records do not crash Detail pages.
- CRUD/detail navigation still works.
- Catalog Toolbar, Home, App Shell, Categories Page, and Image Gallery behavior are not regressed.

## 20. Expected Checkpoint Tag

Expected checkpoint tag after merge:

```text
post-mvp-27-1-detail-page-v1-layout-planning-v1
```
