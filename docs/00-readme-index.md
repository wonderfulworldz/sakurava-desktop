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
