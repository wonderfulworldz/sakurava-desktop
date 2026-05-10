# 01 — Clean Planning Sakurava

## 1. Product Goal

**Sakurava** adalah aplikasi desktop lokal/offline untuk mengelola katalog pribadi berisi **Videos**, **Images**, dan **Performers** secara rapi, mudah dicari, mudah diedit, dan tetap stabil setelah aplikasi ditutup atau direstart.

Tujuan utama MVP:

```text
Add → Save → List → Detail → Edit → Restart → Data tetap ada
```

MVP belum mengejar fitur kompleks. MVP hanya perlu membuktikan bahwa data dapat dibuat, disimpan, ditampilkan, diedit, dan tetap ada setelah restart.

## 2. MVP Scope

### Entity utama

- Videos
- Images
- Performers

### Halaman MVP

- Home
- Video Collection
- Video Detail
- Video Add/Edit Form
- Image Collection
- Image Detail
- Image Add/Edit Form
- Performer Collection
- Performer Detail
- Performer Add/Edit Form
- Settings Minimal

### Fitur MVP

| Area | Scope MVP |
|---|---|
| Videos | Add, Save, List, Detail, Edit, Restart persistence |
| Images | Add, Save, List, Detail, Edit, Restart persistence |
| Performers | Add, Save, List, Detail, Edit, Restart persistence |
| Categories | Simple text labels stored as `categoriesJson` |
| Ratings | Simple JSON stored as `ratingJson` |
| Favorite | Boolean true/false |
| File paths | Manual text input |
| Image fallback | Placeholder jika kosong/rusak |
| Settings | Minimal information page |

### Scope yang harus tetap sederhana

Categories MVP harus berupa text labels.

Contoh:

```json
["Favorite", "High Replay", "Soft Tone"]
```

Tidak boleh menggunakan `categoryIds` pada MVP.

## 3. Out of Scope

Fitur berikut ditunda sampai core CRUD stabil:

| Fitur | Status | Alasan |
|---|---|---|
| Advanced Categories Manager | Post-MVP | Bisa membuat category berubah menjadi UUID/raw ID |
| Related Performer picker | Post-MVP | Menambah relasi dan state form kompleks |
| Related Video/Image relations | Post-MVP | Risiko raw ID muncul di detail page |
| Native file picker | Post-MVP | Perlu Tauri permission/capability |
| Backup/Restore | Post-MVP | Menyentuh database lifecycle |
| Missing files scanner | Post-MVP | Butuh file system traversal |
| Bulk add | Post-MVP | Risiko validasi dan rollback besar |
| Scraping | Post-MVP | Kompleks dan mudah rusak |
| Media player | Post-MVP | Tidak perlu untuk CRUD MVP |
| Advanced Settings | Post-MVP | Bisa melebar ke config management |
| Complex dashboard | Post-MVP | Belum perlu sebelum data stabil |
| Advanced analytics | Post-MVP | Butuh data matang |

## 4. Entity & Naming Decision

### Project identity

| Item | Decision |
|---|---|
| App Name | Sakurava |
| Repo/Folder | `sakurava-desktop` |
| Package name | `sakurava` |
| Database file | `sakurava.sqlite` |
| App data folder | `app.sakurava.desktop` |

### Locked terminology

| Gunakan | Jangan diganti menjadi |
|---|---|
| Video | Movie, Film, Item |
| Image | Album, Gallery Item |
| Performer | Actress, Model, Idol |
| Original Title | Japan Title, JP Title |
| Original Name | Japanese Name |
| Censorship | Type, Version |
| Publisher / Label | Studio-only |
| Filmography | Works, Movie Count |
| Pictorials | Album Count |
| Categories | Tags, Genres, Labels campur |
| Related Performer | Cast Relation |
| Favorite | Like, Bookmark |

### Entity naming

| Entity | Collection | Detail | Form |
|---|---|---|---|
| Video | Videos | Video Detail | Video Add/Edit |
| Image | Images | Image Detail | Image Add/Edit |
| Performer | Performers | Performer Detail | Performer Add/Edit |

## 5. Page Hierarchy

```text
Sakurava App Shell
├─ Home
├─ Videos
│  ├─ /videos
│  ├─ /videos/new
│  ├─ /videos/:id
│  └─ /videos/:id/edit
├─ Images
│  ├─ /images
│  ├─ /images/new
│  ├─ /images/:id
│  └─ /images/:id/edit
├─ Performers
│  ├─ /performers
│  ├─ /performers/new
│  ├─ /performers/:id
│  └─ /performers/:id/edit
└─ Settings
   └─ /settings
```

### Sidebar MVP

- Home
- Videos
- Images
- Performers
- Settings

Fitur teknis dan advanced tidak masuk sidebar utama pada MVP.

## 6. Simplified Data Model

### Video

| Field | Required | Catatan |
|---|---:|---|
| id | Yes | Internal only, jangan tampilkan ke user |
| title | Yes | Field utama |
| originalTitle | No | Original Title |
| code | No | Kode katalog |
| censorship | No | Simple text/dropdown |
| availability | No | Owned/Wishlist/Archived, bisa dikunci nanti |
| releaseDate | No | Date/text |
| durationMinutes | No | Number |
| publisherLabel | No | Publisher / Label |
| coverPath | No | Manual text input |
| mediaPath | No | Manual text input |
| categoriesJson | No | JSON text labels |
| ratingJson | No | JSON sederhana |
| notes | No | Catatan pribadi |
| favorite | Yes | Default false |
| createdAt | Yes | Auto |
| updatedAt | Yes | Auto |

### Image

| Field | Required | Catatan |
|---|---:|---|
| id | Yes | Internal only |
| title | Yes | Field utama |
| originalTitle | No | Original Title |
| code | No | Kode image/pictorial |
| censorship | No | Simple text/dropdown |
| availability | No | Owned/Wishlist/Archived |
| releaseDate | No | Date/text |
| publisherLabel | No | Publisher / Label |
| coverPath | No | Manual text input |
| folderPath | No | Manual text input |
| imageCount | No | Manual number |
| categoriesJson | No | JSON text labels |
| ratingJson | No | JSON sederhana |
| notes | No | Catatan pribadi |
| favorite | Yes | Default false |
| createdAt | Yes | Auto |
| updatedAt | Yes | Auto |

### Performer

| Field | Required | Catatan |
|---|---:|---|
| id | Yes | Internal only |
| name | Yes | Field utama |
| originalName | No | Original Name |
| aliasesJson | No | JSON text array |
| status | No | Active/Retired/Unknown |
| birthDate | No | Date/text |
| coverPath | No | Manual text input |
| filmographyCount | No | Manual/derived later |
| pictorialsCount | No | Manual/derived later |
| categoriesJson | No | JSON text labels |
| ratingJson | No | JSON sederhana |
| notes | No | Catatan pribadi |
| favorite | Yes | Default false |
| createdAt | Yes | Auto |
| updatedAt | Yes | Auto |

## 7. Workflow per Phase

### Phase 1 — Planning Only

Tujuan:

- Mengunci scope.
- Mengunci terminology.
- Mengunci risiko.
- Mengunci urutan kerja.

Tidak boleh:

- Coding.
- UI implementation.
- Database implementation.

### Phase 2 — PRD Only

Tujuan:

- Menulis requirement MVP.
- Menentukan acceptance criteria.
- Menentukan risk control.

Tidak boleh:

- Coding.
- Visual mockup.
- Database schema final.

### Phase 3 — UI Wireframe Only

Tujuan:

- Menentukan struktur halaman.
- Menentukan section, field, action, empty state, dan flow.

Tidak boleh:

- Coding.
- Database.
- Visual polish.

### Phase 4 — Visual UI Mockup Image

Tujuan:

- Membuat desain gambar UI sebelum frontend.
- Mengunci style visual.

Tidak boleh:

- Coding.
- Database.
- Integration.

### Phase 5 — Frontend Static Only

Tujuan:

- React UI dengan mock data.
- Tidak ada persistence.

Tidak boleh:

- SQLite.
- Tauri invoke.
- Native file picker.

### Phase 6 — Backend Only

Tujuan:

- SQLite schema.
- Repository layer.
- Service layer.
- Validation.
- Tests.

Tidak boleh:

- Ubah UI.
- Integration frontend.

### Phase 7 — Integration Only

Tujuan:

- Menghubungkan UI ke backend per entity.

Urutan wajib:

1. Video CRUD basic.
2. Image CRUD basic.
3. Performer CRUD basic.

Tidak boleh:

- Redesign.
- Native file picker.
- Relation picker.
- Advanced categories.

### Phase 8 — Testing Only

Tujuan:

- Manual CRUD smoke test.
- Route smoke test.
- Restart persistence test.
- Browser/native mode check.

Tidak boleh:

- Tambah fitur.
- Redesign.

### Phase 9 — Deploy Only

Tujuan:

- Build Tauri Windows.
- Installed app smoke test.

Tidak boleh:

- Tambah fitur.
- Refactor besar.
- Redesign.

## 8. Risk Register Awal

| Risiko | Penyebab | Dampak | Pencegahan | Early Check |
|---|---|---|---|---|
| `/new` dianggap id | Route order salah | New page gagal | Static route sebelum dynamic route | Buka `/videos/new` |
| Browser mode crash | Tauri invoke dipanggil di browser | Dev UI gagal dibuka | Runtime guard/mock adapter | Buka di browser dev |
| Database unavailable | DB path/plugin belum siap | CRUD gagal | Backend diuji sebelum integration | Native smoke test |
| UUID tampil ke user | ID dirender langsung | UI membingungkan | No relation MVP | Scan detail/form |
| Category jadi ID acak | Simpan category sebagai ID | Data rusak saat reopen | `categoriesJson` labels | Save/reopen category |
| Broken image icon | Path kosong/rusak | UI tidak rapi | Placeholder fallback | Kosongkan coverPath |
| Form white screen | State/input handler error | Input gagal | Manual typing test | Ketik category |
| Test pass tapi UI gagal | Test terlalu terbatas | Bug terlambat | Manual smoke test | Checklist manual |
| File picker error | Permission Tauri belum siap | Form terganggu | Manual path only | Browse disabled |
| Batch terlalu besar | Banyak area diedit | Bug sulit dilacak | One task, one goal | Scope review |

## 9. Definition of Done per Phase

### Planning DoD

- Product goal jelas.
- MVP scope terkunci.
- Out of scope jelas.
- Naming terkunci.
- Page hierarchy jelas.
- Risk register dibuat.
- Tidak ada coding.

### PRD DoD

- Requirement MVP jelas.
- Acceptance criteria jelas.
- Risk controls jelas.
- Tidak ada implementasi teknis berlebihan.
- Tidak ada fitur post-MVP masuk MVP.

### UI Wireframe DoD

- Semua halaman MVP punya struktur.
- Field form sesuai data model.
- Empty state ada.
- Error/fallback state ada.
- Tidak ada coding.

### Visual Mockup DoD

- Visual style konsisten.
- Light mode first.
- Sakura accent tidak berlebihan.
- Placeholder behavior jelas.
- Tidak ada coding.

### Frontend Static DoD

- Semua route MVP bisa dibuka.
- Semua page memakai mock data.
- Form bisa diketik.
- Placeholder image fallback bekerja.
- Tidak ada Tauri invoke/SQLite.

### Backend DoD

- Schema/repository/service/validation tersedia.
- CRUD backend pass.
- JSON save/read pass.
- Tidak ada UI changes.

### Integration DoD

- CRUD per entity pass.
- Data tetap ada setelah restart.
- Tidak ada raw ID/UUID di UI.
- Browser mode aman.
- Native mode aman.

### Testing DoD

- Manual smoke test pass.
- Route test pass.
- Restart persistence pass.
- Category save/reopen pass.
- Image fallback pass.
- Known bug list jelas.

### Deploy DoD

- Windows build berhasil.
- Installed app bisa dibuka.
- CRUD smoke test pass di installed app.
- Stable checkpoint dibuat.

## 10. Recommended Next Document Order

1. `01-clean-planning.md`
2. `02-mvp-prd.md`
3. `03-ui-wireframe.md`
4. `04-visual-design-guide.md`
5. `05-frontend-static-task-plan.md`
6. `06-backend-task-plan.md`
7. `07-integration-task-plan.md`
8. `08-testing-and-release-checklist.md`

## 11. Recommended First Git/Codex Workflow

### Untuk dokumen awal

Tidak perlu Codex.

Dokumen awal dibuat dan direvisi di ChatGPT:

- Planning.
- PRD.
- Wireframe.
- Visual design guide.

### Codex baru digunakan untuk

- Frontend Static Only.
- Backend Only.
- Integration Only.
- Testing task.
- Bug fix kecil dengan scope jelas.

### Branch awal nanti

Setelah dokumen disetujui, gunakan branch kecil:

```text
docs/initial-docs
frontend/static-shell
backend/sqlite-foundation
integration/video-crud
integration/image-crud
integration/performer-crud
testing/mvp-smoke
release/windows-build
```

### Aturan commit

- Jangan commit jika manual check gagal.
- Jangan merge ke main jika ada bug MVP.
- Jangan lanjut batch berikutnya sebelum smoke test pass.
