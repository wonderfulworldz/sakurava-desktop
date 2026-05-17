# 32 - Tech Info + Media Status Planning

## 1. Purpose

Batch 27.5 mendefinisikan rencana Tech Info + Media Status sebelum implementasi.

Dokumen ini adalah planning-only. Tidak ada implementasi UI, source code, test, runtime, Tauri command, database, schema, package/config, metadata detection, media status behavior, atau file operation dari batch ini.

Implementasi direncanakan untuk Batch 27.6.

## 2. Context

Latest completed checkpoint sebelum batch ini:

```text
post-mvp-27-4-functional-spider-chart-rating-implementation-v1
```

Batch 27.1 merencanakan Detail Page V1 layout. Batch 27.2 mengimplementasikan Detail Hero + Metadata Cleanup. Batch 27.3 merencanakan Functional Spider Chart Rating. Batch 27.4 mengimplementasikan Detail Rating Summary dengan polygon spider chart dan shared rating helper.

Batch 27.5 hanya merencanakan Tech Info + Media Status untuk:

- Video Detail
- Image Detail
- Performer Detail jika applicable

Planning ini harus preserve Detail Hero/Metadata cleanup dari Batch 27.2, Spider Chart dari Batch 27.4, Image Gallery no-folder-scan rule, `galleryImagePathsJson`, `categoriesJson`, dan `ratingJson` behavior.

## 3. Product Direction

Tech Info harus menampilkan nilai yang data-backed saja.

Rules utama:

- Jangan fake resolution, file size, file type, duration, gallery count, atau Quality label.
- Jangan infer resolution dari filename/path.
- Jangan tampilkan raw file/folder paths di normal metadata.
- Media File Status sebaiknya disederhanakan dan digabung ke System Info jika praktis.
- Path information harus diringkas dengan status user-friendly: Set, Not set, Available, Missing, atau Unknown.
- Image Detail tidak boleh scan `folderPath`.
- Tidak ada folder live scan, recursive scan, watcher, auto metadata extraction, thumbnail generation, atau file mutation.

## 4. Video Tech Info Plan

Target Video Tech Info:

| Field | Source | Classification | Notes |
| --- | --- | --- | --- |
| Duration | `durationMinutes` | Ready for 27.6 jika existing value reliable | Tampilkan hanya jika value tersimpan valid. Jika kosong, gunakan honest unavailable state. |
| Resolution | stored/detected resolution | Deferred/runtime-dependent | Membutuhkan runtime metadata detection atau stored metadata. Jangan infer dari filename/path. |
| File Size | runtime file metadata | Deferred/runtime-dependent | Membutuhkan akses metadata file. Jangan implement tanpa batasan runtime yang jelas. |
| File Type | extension atau runtime verified type | Needs helper / runtime-dependent | Extension-derived boleh hanya jika label jelas, misalnya "Extension: MP4"; jangan pretend sebagai verified content type. |

Rekomendasi:

- Batch 27.6 boleh menampilkan Duration dari `durationMinutes`.
- Resolution dan File Size tetap unavailable/planned jika belum ada source aman.
- File Type boleh ditunda. Jika diaktifkan dari extension, UI/copy harus jelas bahwa itu berasal dari extension, bukan verifikasi isi file.

## 5. Image Tech Info Plan

Target Image Tech Info:

| Field | Source | Classification | Notes |
| --- | --- | --- | --- |
| Gallery Count | `imageCount` atau `galleryImagePathsJson` length | Ready for 27.6 if safe | Count berarti jumlah gambar dalam gallery, bukan satu single image. |
| Resolution | stored/detected image metadata | Deferred/runtime-dependent | Membutuhkan metadata image yang reliable. Jangan infer dari filename/path. |
| File Size | runtime file metadata | Deferred/runtime-dependent | Untuk gallery, definisi harus jelas: cover size, selected image size, atau total gallery size. |
| File Type | extension atau runtime verified type | Needs helper / runtime-dependent | Extension-derived harus diberi label jelas. Runtime verified type butuh batch terpisah. |

Gallery Count source priority:

1. `imageCount` jika reliable.
2. `galleryImagePathsJson` length jika parse aman dan sudah tersedia.

Rules:

- Jangan scan `folderPath`.
- Jangan read folder contents dari Image Detail.
- Jangan verify semua gallery image otomatis di Detail page.
- Untuk V1, jangan calculate total gallery file size.
- Jika `imageCount` dan `galleryImagePathsJson` tidak reliable, tampilkan honest unavailable state.

## 6. Performer System/Profile Asset Info Plan

Performer tidak memakai media Tech Info normal seperti Videos/Images.

Recommended V1 direction:

- Tidak ada media-style Tech Info untuk Performer.
- Gunakan System Info atau Profile Asset Info yang jujur jika section dibutuhkan.

Profile Asset Info yang aman:

| Field | Source | Classification | Notes |
| --- | --- | --- | --- |
| Profile image status | saved `coverPath` presence atau existing safe path status | Ready/Needs helper | Ringkas sebagai Set, Not set, Available, Missing, atau Unknown. Jangan tampilkan raw path. |
| Detail thumbnail status | existing performer thumbnail paths jika sudah didukung | Ready/Needs helper | Ringkas jumlah/status saved thumbnail, bukan raw path list. |
| Created | `createdAt` | Ready for 27.6 | Preserve timestamp display. |
| Last edited | `updatedAt` | Ready for 27.6 | Preserve timestamp display. |

Rules:

- Jangan tambahkan resolution/file size/file type media-style untuk Performer kecuali future batch secara eksplisit membahas profile asset metadata.
- Jangan fake performer metadata.
- Jangan implement Personal/Physical full integration di batch Tech Info.
- Jangan tambah storage fields atau schema/database changes.

## 7. Media Status / System Info Plan

V1 target adalah menyederhanakan Media File Status dan menggabungkan status sederhana ke System Info jika praktis.

System Info target:

- Created
- Last edited
- Cover path status
- Media path status untuk Videos
- Folder path atau Gallery path status untuk Images hanya jika aman
- Profile image / thumbnail status untuk Performers jika aman

Rules:

- Raw paths tidak tampil di normal metadata.
- Raw paths tidak tampil default di System Info. Status cukup ringkas.
- Raw JSON tidak tampil.
- Jangan trigger expensive scan.
- Jangan verify semua gallery image otomatis.
- Jangan scan `folderPath`.
- Jangan read folder contents dari Image Detail.

Jika existing separate Media File Status section sudah ada dan berisi informasi yang sama, Batch 27.6 dapat:

- menghapus section terpisah jika semua informasi penting sudah masuk System Info; atau
- mengurangi section tersebut menjadi status ringkas jika penggabungan penuh berisiko.

## 8. Status Label Definitions

Status label harus konsisten:

| Label | Meaning |
| --- | --- |
| Set | Value/path tersimpan, tetapi belum diverifikasi runtime. |
| Not set | Tidak ada value/path tersimpan. |
| Available | Value/path tersimpan dan runtime check mengonfirmasi accessible. |
| Missing | Value/path tersimpan tetapi runtime check menyatakan unavailable/missing. |
| Unknown | Check tidak tersedia, tidak dijalankan, atau hasil tidak bisa dipastikan. |

Rules:

- `Set` bukan berarti file pasti ada.
- `Available` hanya boleh dipakai jika ada runtime check yang benar-benar mengonfirmasi.
- `Missing` hanya boleh dipakai jika runtime check yang aman menyatakan path tidak tersedia.
- `Unknown` lebih aman daripada fake status ketika check tidak ada.

## 9. Runtime Metadata Detection Risk Classification

| Risk | Item | Notes |
| --- | --- | --- |
| Low | Display existing saved values | Contoh: `durationMinutes`, `imageCount`, `createdAt`, `updatedAt`. |
| Low | Count parsed `galleryImagePathsJson` entries | Aman jika memakai parser defensif dan tidak membaca file/folder. |
| Low | Show existing path status labels already available from current status commands | Hanya jika command sudah ada dan penggunaannya bounded. |
| Medium | Check existence/status of one saved path | Boleh dipertimbangkan jika current runtime command sudah aman dan tidak scan. |
| Medium | Derive extension label | Harus dilabeli extension-derived, bukan verified content type. |
| High | Read file size from disk | Membutuhkan runtime metadata access dan batasan yang jelas. |
| High | Detect media/image resolution | Membutuhkan metadata extraction yang belum direncanakan detail. |
| High | Detect actual file type/content type | Jangan disamakan dengan extension. |
| High | Calculate total gallery file size | Berpotensi membaca banyak file; bukan V1 safe scope. |
| High | Scan `folderPath` | Tidak boleh dari Detail page. |
| High | Recursive scan | Deferred/Post-V1 kecuali batch khusus disetujui. |
| High | Watch file changes | Deferred/Post-V1 kecuali batch khusus disetujui. |

## 10. Storage/Schema Decision

Tech Info dapat dipikirkan dalam tiga model:

1. Computed on demand.
2. Cached in local app state only.
3. Persisted in SQLite.

Recommended planning:

- Batch 27.6 tidak menambah schema/database fields.
- Batch 27.6 hanya memakai existing data dan existing safe runtime status jika tersedia.
- Jika persistent metadata diperlukan untuk resolution, file size, file type, atau Quality, buat batch storage/schema planning terpisah.
- Jangan silently add fields untuk resolution/file size/file type.
- Jangan ubah current record shape dari planning batch ini.

## 11. Quality Label Dependency

Resolution-derived Quality labels:

- SD
- HD
- FHD
- 2K
- 4K
- 8K

Rules:

- Quality label bergantung pada resolution yang reliable.
- Jangan tampilkan active Quality label tanpa data-backed resolution.
- Jangan infer Quality dari filename/path.
- 720p atau 720x1280 harus diklasifikasikan sebagai SD sesuai arah user sebelumnya.
- Karena portrait/landscape dapat berbeda, Quality membutuhkan helper khusus yang aman.
- Quality integration untuk Catalog filter hanya boleh diaktifkan setelah resolution data aman.

## 12. Recommended 27.6 Implementation Scope

Recommended safe scope untuk Batch 27.6:

- Refine Tech Info section memakai existing safe data only.
- Video:
  - tampilkan Duration dari `durationMinutes` jika valid;
  - Resolution dan File Size tetap unavailable/planned jika belum ada data aman;
  - File Type ditunda atau tampil sebagai extension-derived dengan label jelas jika helper aman.
- Image:
  - tampilkan Gallery Count dari `imageCount` atau parsed `galleryImagePathsJson` length jika safe;
  - Resolution/File Size/File Type tetap unavailable/planned kecuali safe source sudah ada.
- Performer:
  - gunakan System Info/Profile Asset Info only;
  - jangan tampilkan media-style Tech Info.
- Merge/simplify Media Status into System Info jika existing status data mendukung.
- Preserve raw path hiding dari Batch 27.2.
- Preserve Spider Chart dari Batch 27.4.
- Preserve Image Gallery behavior dan no-folder-scan rule.

Out of 27.6 scope unless explicitly approved:

- Runtime resolution detection.
- Runtime file size detection.
- Runtime verified file type detection.
- Total gallery size calculation.
- Folder scan.
- Recursive scan.
- Watcher.
- Schema/database changes.
- Metadata caching/persistence.
- Catalog Quality filter activation.

## 13. Deferred Items

- Runtime metadata extraction pipeline.
- Stored resolution/file size/file type fields.
- Quality helper + Catalog Quality filter activation.
- Total gallery file size.
- Verified file type/content type.
- Folder refresh/live sync.
- Recursive media scanner.
- File watcher.
- Advanced media player.
- Profile asset metadata extraction for Performer images.

## 14. Safety Rules

- No source code changes in 27.5.
- No tests edits in 27.5.
- No database/schema changes.
- No Tauri/runtime changes.
- No package/config changes.
- No file scanning.
- No folder live scan.
- No recursive scan.
- No watcher.
- No file copy/import/move/rename/delete/write.
- No thumbnail generation.
- No metadata extraction implementation.
- No active Quality label without reliable resolution.
- No fake Tech Info values.
- Preserve Detail Hero/Metadata cleanup from Batch 27.2.
- Preserve Spider Chart from Batch 27.4.
- Preserve Image Gallery no-folder-scan rule.
- Preserve `galleryImagePathsJson` as saved explicit gallery paths.
- Preserve `categoriesJson` behavior.
- Preserve `ratingJson` behavior.
- Do not auto-commit, push, or create PR.

## 15. Non-goals

- No Tech Info UI implementation.
- No Media Status implementation.
- No source code changes.
- No tests edits.
- No runtime/Tauri command changes.
- No database/schema changes.
- No package/config changes.
- No metadata extraction.
- No file size detection.
- No resolution detection.
- No verified file type detection.
- No Quality detection implementation.
- No Catalog Quality filter activation.
- No folder scan from Image Detail.
- No Image Gallery placement/load-count change.
- No Detail Hero/Metadata redesign.
- No Spider Chart changes.
- No Related Cards implementation.
- No Form changes.
- No Settings changes.
- No Category Management changes.

## 16. Acceptance Criteria

- Docs clearly define Video Tech Info target fields.
- Docs clearly define Image Tech Info target fields.
- Docs clearly state Performer does not use normal media Tech Info.
- Docs clearly define Media Status/System Info consolidation.
- Docs clearly define Set, Not set, Available, Missing, and Unknown.
- Docs clearly state raw paths do not appear in normal metadata.
- Docs clearly state no folder scan from Image Detail.
- Docs clearly classify runtime metadata risks.
- Docs clearly state Quality label depends on reliable resolution.
- Docs clearly recommend safe 27.6 implementation scope.
- Git diff shows documentation changes only.

## 17. Future Smoke Test Checklist

Use checklist ini untuk Batch 27.6 implementation:

- Video Detail Tech Info shows Duration only when `durationMinutes` is valid.
- Video Detail does not show fake Resolution, File Size, File Type, or Quality.
- Image Detail Tech Info shows Gallery Count only from safe existing source.
- Image Detail Gallery Count means gallery image count, not single image count.
- Image Detail does not scan `folderPath`.
- Image Detail does not read folder contents from Detail.
- Performer Detail does not show media-style Tech Info.
- Performer System/Profile Asset Info uses honest path/asset status if shown.
- System Info still shows Created and Last edited.
- Path statuses use Set, Not set, Available, Missing, or Unknown correctly.
- Raw paths are not shown in normal metadata.
- Raw JSON is not shown.
- Existing Video Play/Open behavior is preserved.
- Existing Image Gallery grid/viewer behavior is preserved.
- Detail Hero/Metadata cleanup from Batch 27.2 remains unchanged.
- Spider Chart from Batch 27.4 remains unchanged.
- Catalog Quality filter remains inactive unless a later batch explicitly enables it.

## 18. Expected Checkpoint Tag

Expected checkpoint tag after merge:

```text
post-mvp-27-5-tech-info-media-status-planning-v1
```
