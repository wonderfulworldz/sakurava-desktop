# 27 - Image Gallery QA and Safety Review

## 1. Purpose

Batch 25.7 menutup review QA dan safety untuk Image Gallery setelah Batch 25.1 sampai 25.6.

Tujuannya adalah memastikan Image Gallery tetap menjadi fitur path eksplisit lokal, bukan folder scanner, file manager, importer, thumbnail generator, watcher, atau live sync.

Batch ini adalah QA, safety review, dan dokumentasi alignment. Tidak ada product feature baru yang perlu ditambahkan dari review ini.

## 2. Current Image Gallery Capability Summary

Image Gallery saat ini mendukung:

- storage `galleryImagePathsJson` pada Image record;
- Image Create/Edit `Gallery Images` path rows;
- `Browse Gallery Folder` pada Image Create/Edit;
- folder read direct-files-only dari satu folder yang dipilih user;
- filtering direct file dengan ekstensi `.jpg`, `.jpeg`, `.png`, `.webp`, dan `.gif` secara case-insensitive;
- Image Detail `Gallery` grid dari saved `galleryImagePathsJson`;
- thumbnail gallery rasio 1:1;
- `Load More` dengan 24 initial images dan +24 per click;
- full-size viewer dari thumbnail Image Detail gallery;
- Previous/Next controls;
- overlay counter/status dan close control;
- Fit, 100%, Zoom In, dan Zoom Out controls;
- fullscreen control dengan browser fullscreen dan fallback in-app;
- safe missing-image fallback.

Image Gallery saat ini tidak melakukan folder live scan, tidak membaca child folders/subfolders, dan tidak memiliki multi-image picker.

## 3. Confirmed Source of Truth

Source of truth Image Gallery adalah:

```text
galleryImagePathsJson
```

`galleryImagePathsJson` menyimpan JSON array string berisi explicit saved local image paths.

`folderPath` tetap optional metadata/reference only. Image Detail tidak memakai `folderPath` sebagai gallery source dan tidak melakukan live scan folder ketika Image Detail dibuka.

## 4. Workflow Checklist

Hasil review workflow:

- Image Create/Edit dapat mengelola `Gallery Images` path rows.
- User dapat add/edit/remove/clear path rows.
- `Browse Gallery Folder` mengganti path rows dengan hasil direct-files-only dari folder terpilih.
- Save menulis daftar path yang sudah dinormalisasi ke `galleryImagePathsJson`.
- Normalisasi save trim path, menghapus empty rows, dedupe duplicate path, dan mempertahankan first occurrence order.
- Reopen edit form membaca saved gallery paths dari `galleryImagePathsJson`.
- Restart app mempertahankan gallery paths karena data tersimpan di SQLite.
- Image Detail menampilkan `Gallery` grid dari saved paths.
- `Load More` menambah 24 visible items.
- Missing atau bad paths menampilkan fallback dan tidak crash.
- Full-size viewer dibuka dari gallery thumbnail.
- Previous/Next bekerja dalam list saved paths.
- Zoom beyond 100%, Fit, dan 100% tersedia.
- Fullscreen control memakai browser fullscreen jika tersedia dan fallback in-app jika tidak.
- Close/Escape behavior scoped ke viewer dan aman.

## 5. Safety Checklist

Hasil review safety:

- Tidak ada folder live scan.
- Image Detail tidak membaca `folderPath`.
- Image Detail tidak membaca folder.
- Folder read hanya ada pada `Browse Gallery Folder` di Image Create/Edit.
- Folder read memakai direct files only.
- Child folders/subfolders tidak discan.
- Tidak ada multi-image picker.
- Tidak ada file copy/import/move/rename/delete/write behavior untuk Image Gallery.
- Tidak ada thumbnail generation.
- Tidak ada relational gallery table.
- Tidak ada watcher/live sync behavior.
- Tidak ada broad scanner behavior.
- Tidak ada category, related, Backup/Restore, Settings, Video Play, atau Performer mini thumbnail behavior change dari batch ini.
- Tidak ada schema/database change baru setelah Batch 25.3 yang diperlukan dari review ini.

## 6. Manual QA Checklist

Manual smoke test yang harus dipakai saat runtime QA:

1. Jalankan `npm.cmd run tauri dev`.
2. Create atau edit satu Image record.
3. Gunakan `Browse Gallery Folder` dengan folder yang berisi direct image files, non-image files, dan child folder yang berisi image files.
4. Verifikasi direct supported image files masuk ke `Gallery Images` rows.
5. Verifikasi non-image files diabaikan.
6. Verifikasi image files di child folder diabaikan.
7. Verifikasi `Gallery Images` rows masih bisa diedit manual.
8. Save record.
9. Reopen Image edit form.
10. Verifikasi saved gallery paths persist.
11. Verifikasi empty rows tidak tersimpan.
12. Verifikasi duplicates didedupe.
13. Verifikasi unrelated Image fields tetap preserved.
14. Verifikasi `categoriesJson` behavior tidak berubah.
15. Restart app.
16. Reopen Image record yang sama.
17. Verifikasi gallery paths masih persist.
18. Buka Image Detail.
19. Verifikasi section `Gallery` muncul.
20. Verifikasi thumbnails tetap 1:1.
21. Verifikasi `Load More` bekerja jika path lebih dari 24.
22. Verifikasi missing/bad paths tidak crash.
23. Verifikasi Image Detail tidak scan `folderPath`.
24. Buka full-size viewer.
25. Verifikasi Previous/Next bekerja.
26. Verifikasi counter/status adalah overlay.
27. Verifikasi close control adalah overlay.
28. Verifikasi zoom beyond 100% bekerja.
29. Verifikasi Fit dan 100% bekerja.
30. Verifikasi fullscreen control bekerja atau fallback aman.
31. Verifikasi Escape behavior aman.
32. Jika praktis, verifikasi Video Play behavior tidak berubah.
33. Jika praktis, verifikasi Performer mini thumbnail behavior tidak berubah.

## 7. Automated Verification Checklist

Automated verification untuk batch ini:

- `npm.cmd run test`
- `npm.cmd run build`

Existing test coverage sudah mencakup:

- save `galleryImagePathsJson` dari Image form;
- trim/remove empty/dedupe gallery path rows;
- reopen edit form dari saved gallery paths;
- `Browse Gallery Folder` dialog configuration;
- replace confirmation sebelum folder result mengganti rows;
- direct supported folder results masuk rows;
- Image Detail `Gallery` grid dari saved paths;
- `Load More`;
- full-size viewer Previous/Next;
- overlay controls/status;
- Fit/100%/Zoom controls;
- fullscreen dan fallback behavior;
- missing/bad path fallback;
- invalid `galleryImagePathsJson` fallback.

Rust tests sudah mencakup:

- `gallery_folder_images_list` membaca direct supported images only;
- non-image direct files diabaikan;
- child folder image diabaikan;
- missing folder fail secara aman;
- `galleryImagePathsJson` dinormalisasi pada create/update.

## 8. Known Non-Goals

Batch 25.7 tidak menambahkan:

- multi-image picker kecuali diminta eksplisit di batch terpisah;
- recursive folder scan;
- child folder scan;
- folder watcher;
- live sync;
- thumbnail generation;
- image file copy/import;
- internal image editor;
- relational gallery table;
- broad media scanner;
- category changes;
- related picker changes;
- Backup/Restore changes;
- Settings changes;
- Video Play changes;
- Performer mini thumbnail changes.

## 9. Risks and Mitigations

### Risk: `folderPath` menjadi hidden gallery scanner

Mitigation:

- Source of truth dikunci ke `galleryImagePathsJson`.
- Image Detail memakai parsed `galleryImagePathsJson` only.
- `folderPath` hanya metadata/reference.

### Risk: folder browse berubah menjadi recursive scanner

Mitigation:

- Runtime command memakai `fs::read_dir` pada folder terpilih.
- Entry diproses hanya jika `file_type().is_file()`.
- Child folders/subfolders diabaikan.

### Risk: file mutation creep

Mitigation:

- Image Gallery hanya menyimpan path string.
- Tidak ada copy/import/move/rename/delete/write media file.
- Tidak ada generated thumbnail files.

### Risk: gallery besar memperlambat Image Detail

Mitigation:

- Gallery grid render 24 item awal.
- `Load More` menambah 24 item per click.
- Thumbnail memakai lazy image loading.

### Risk: missing atau inaccessible image path

Mitigation:

- Thumbnail dan viewer menampilkan fallback `Image unavailable`.
- Bad path tidak crash Image Detail.

## 10. Follow-up Recommendations

Jika QA tetap clean, Image Gallery dapat diperlakukan sebagai post-MVP initial complete.

Next roadmap item harus dipilih terpisah. Kandidat follow-up:

- Related picker refinement;
- Media File Missing Scanner Planning;
- Export Data Preview;
- Backup/Restore UX safety follow-up;
- Image Gallery minor polish hanya jika ada usability issue nyata.

## 11. Checkpoint

Expected checkpoint tag setelah merge:

```text
post-mvp-25-7-image-gallery-qa-safety-review-v1
```
