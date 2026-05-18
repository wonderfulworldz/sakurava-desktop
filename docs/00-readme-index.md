# Sakurava PRD Documentation Pack

## Status

Dokumen ini adalah paket dokumentasi project **Sakurava** setelah **Visual UI Mockup v1** disetujui sebagai baseline desain.

Tujuan paket ini adalah mengunci arah produk sebelum coding, supaya development tidak mencampur planning, UI, backend, database, integration, testing, dan deploy dalam satu task.

## Prinsip utama

Sakurava harus dikembangkan bertahap:

1. Planning Only
2. PRD Only
3. UI Wireframe Only
4. Visual UI Mockup Image
5. Frontend Static Only
6. Backend Only
7. Integration Only
8. Testing Only
9. Deploy Only

## Source of Truth

Urutan acuan dokumen:

1. `01-clean-planning.md` — scope dan keputusan awal.
2. `02-mvp-prd.md` — PRD utama MVP.
3. `03-ui-wireframe.md` — struktur halaman mengikuti visual mockup v1.
4. `03a-mvp-form-specification.md` — field form, jenis field, status input, dan aturan save.
5. `04-visual-design-guide.md` — gaya visual dan baseline mockup v1.
6. `05-frontend-static-task-plan.md` — urutan implementasi frontend static yang aman.
7. `06-backend-task-plan.md` — rencana backend only.
8. `07-integration-task-plan.md` — rencana integration only.
9. `08-testing-and-release-checklist.md` — manual testing dan release checklist.
10. `PROJECT_STATUS.md` — ringkasan status post-MVP saat ini.
11. `ROADMAP_LOCKED.md` — urutan roadmap post-MVP yang terkunci.
12. `10-category-management-safety.md` — batas aman Category Management.
13. `11-prd-alignment-and-development-plan.md` — cara membaca PRD MVP bersama standar post-MVP saat ini.
14. `12-backup-restore-ux-safety.md` — aturan aman UX Backup/Restore.
15. `13-settings-persistence-planning.md` - rencana aman persistensi Settings.
16. `14-category-management-dedicated-page-planning.md` - rencana halaman khusus Category Management.
17. `15-form-category-picker-lockdown-planning.md` - rencana lockdown picker kategori form ke Managed Categories.
18. `16-categories-sidebar-page-planning.md` - rencana halaman sidebar Categories sebagai browsing/discovery, bukan management.
19. `17-related-performer-picker-structure-planning.md` - rencana struktur picker Related Performer dari record Performer yang sudah ada.
20. `18-related-performer-storage-planning.md` - rencana storage Related Performer sebelum implementasi picker.
21. `19-related-video-image-picker-structure-planning.md` - rencana struktur picker Related Video/Image dari record Video/Image yang sudah ada.
22. `20-related-video-image-storage-planning.md` - rencana storage Related Video/Image sebelum implementasi picker.
23. `21-media-file-status-open-file-planning.md` - rencana aman status path media lokal dan aksi open/reveal desktop.
24. `22-external-media-open-planning.md` - rencana aman membuka media eksternal memakai aplikasi default OS.
25. `23-cover-thumbnail-full-size-preview-planning.md` - rencana aman preview full-size cover dan thumbnail dari path eksplisit.
26. `24-performer-mini-thumbnail-storage-form-planning.md` - rencana storage/form aman untuk 4 mini thumbnail Performer.
27. `25-image-gallery-planning.md` - rencana aman Image Gallery dari daftar path gambar eksplisit.
28. `26-image-gallery-storage-form-planning.md` - rencana storage/form aman untuk daftar path Image Gallery.
29. `27-image-gallery-qa-safety-review.md` - QA dan safety review Image Gallery setelah viewer controls.
30. `28-ui-ux-v1-audit-prioritization-plan.md` - audit dan prioritas roadmap UI/UX V1 setelah Image Gallery initial complete.
31. `29-catalog-toolbar-v1-planning.md` - rencana Catalog Toolbar V1 untuk Videos, Images, dan Performers sebelum implementasi.
32. `30-detail-page-v1-layout-planning.md` - rencana Detail Page V1 untuk Video Detail, Image Detail, dan Performer Detail sebelum implementasi.
33. `31-functional-spider-chart-rating-planning.md` - rencana Functional Spider Chart Rating sebelum implementasi.
34. `32-tech-info-media-status-planning.md` - rencana Tech Info + Media Status sebelum implementasi.
35. `33-form-field-ux-v1-planning.md` - rencana Form Field UX V1 sebelum implementasi.

## Current Post-MVP Reading Order

Untuk agent baru yang melanjutkan project sekarang, baca:

1. `../AGENTS.md`
2. `PROJECT_STATUS.md`
3. `ROADMAP_LOCKED.md`
4. `11-prd-alignment-and-development-plan.md`
5. `10-category-management-safety.md`
6. `12-backup-restore-ux-safety.md`
7. `13-settings-persistence-planning.md`
8. `14-category-management-dedicated-page-planning.md`
9. `15-form-category-picker-lockdown-planning.md`
10. `16-categories-sidebar-page-planning.md`
11. `17-related-performer-picker-structure-planning.md`
12. `18-related-performer-storage-planning.md`
13. `19-related-video-image-picker-structure-planning.md`
14. `20-related-video-image-storage-planning.md`
15. `21-media-file-status-open-file-planning.md`
16. `22-external-media-open-planning.md`
17. `23-cover-thumbnail-full-size-preview-planning.md`
18. `24-performer-mini-thumbnail-storage-form-planning.md`
19. `25-image-gallery-planning.md`
20. `26-image-gallery-storage-form-planning.md`
21. `27-image-gallery-qa-safety-review.md`
22. `28-ui-ux-v1-audit-prioritization-plan.md`
23. `29-catalog-toolbar-v1-planning.md`
24. `30-detail-page-v1-layout-planning.md`
25. `31-functional-spider-chart-rating-planning.md`
26. `32-tech-info-media-status-planning.md`
27. `33-form-field-ux-v1-planning.md`
28. `AGENT_CODE_HANDOFF.md`
29. `WORKFLOW_GIT.md`

`02-mvp-prd.md` tetap baseline MVP, tetapi bukan satu-satunya sumber status project saat ini.

## Approved Visual Mockup v1

Visual mockup v1 sudah disetujui sebagai baseline layout dan style untuk frontend static.

Halaman yang sudah ada di visual baseline:

- App Shell
- Home
- Videos
- Video Detail
- Video Edit
- Images
- Image Detail
- Image Edit
- Performers
- Performer Detail
- Performer Edit
- Settings

## Keputusan setelah visual mockup v1

- Minor text changes diperbolehkan.
- Performers search placeholder harus menjadi `Search performers...`.
- Images collection count harus menggunakan `24 images`, bukan `24 videos`.
- Video rating term dikunci sebagai `Rewatch`.
- Related Content hanya read-only placeholder.
- Tech Info hanya read-only placeholder.
- Browse button disabled.
- Performer advanced fields tetap boleh tampil secara visual, tetapi inactive/placeholder untuk MVP.
- Frontend Static Only tidak boleh memakai SQLite.
- Frontend Static Only tidak boleh memakai Tauri invoke.
- Frontend Static Only tidak boleh memakai native file picker.
- Frontend Static Only tidak boleh memakai relation picker.

## Folder placement

Semua file ini sebaiknya ditaruh di:

```text
sakurava-desktop/docs/
```

Struktur:

```text
sakurava-desktop/
└─ docs/
   ├─ 00-readme-index.md
   ├─ 01-clean-planning.md
   ├─ 02-mvp-prd.md
   ├─ 03-ui-wireframe.md
   ├─ 03a-mvp-form-specification.md
   ├─ 04-visual-design-guide.md
   ├─ 05-frontend-static-task-plan.md
   ├─ 06-backend-task-plan.md
   ├─ 07-integration-task-plan.md
   └─ 08-testing-and-release-checklist.md
```

## Rule sebelum coding

Jangan mulai Codex implementasi sebelum dokumen berikut direview:

- `02-mvp-prd.md`
- `03-ui-wireframe.md`
- `03a-mvp-form-specification.md`
- `04-visual-design-guide.md`
- `05-frontend-static-task-plan.md`

## Rule saat masuk Codex

Codex baru digunakan untuk implementation-oriented task:

- Frontend Static Only
- Backend Only
- Integration Only
- Testing Only
- Deploy Only

PRD dan planning tetap dibuat/review di ChatGPT, bukan Codex.
