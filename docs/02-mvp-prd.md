# 02 — Sakurava MVP PRD

## 1. Product Summary

**Sakurava** adalah aplikasi desktop lokal/offline untuk mengelola katalog pribadi yang terdiri dari **Videos**, **Images**, dan **Performers**.

Aplikasi ini dibuat untuk user yang ingin menyimpan metadata koleksi secara lokal, mengelola data dengan rapi, mencari item dengan mudah, mengedit data kapan saja, dan menjaga agar data tetap ada setelah aplikasi ditutup atau direstart.

## 2. Problem Statement

User memiliki koleksi lokal yang sulit dikelola jika hanya mengandalkan folder, nama file, spreadsheet, atau catatan manual.

Masalah utama:

- Metadata tersebar.
- Sulit mencari item tertentu.
- Sulit menandai favorite.
- Sulit mengelompokkan item dengan categories.
- Sulit melihat detail item secara konsisten.
- Spreadsheet tidak nyaman untuk katalog visual.
- Folder tidak cukup untuk menyimpan notes, rating, dan metadata.
- Project lama rawan bug karena terlalu banyak fitur dikerjakan sekaligus.

## 3. Target User

Target user Sakurava:

- Pemilik koleksi pribadi lokal.
- Menggunakan Windows desktop.
- Ingin aplikasi private/offline.
- Tidak ingin bergantung pada web service.
- Membutuhkan katalog yang mudah dicari, diedit, dan dikembangkan bertahap.
- Masih awam dalam development, sehingga workflow harus aman, kecil, dan mudah diaudit.

## 4. MVP Goal

MVP hanya dianggap berhasil jika alur ini stabil:

```text
Add → Save → List → Detail → Edit → Restart → Data tetap ada
```

Alur ini harus berlaku untuk:

- Videos
- Images
- Performers

## 5. Success Criteria

MVP sukses jika:

- User bisa menambahkan Video baru.
- User bisa menambahkan Image baru.
- User bisa menambahkan Performer baru.
- Data muncul di collection page.
- Data bisa dibuka di detail page.
- Data bisa diedit.
- Data tetap ada setelah app ditutup dan dibuka ulang.
- Categories tetap berupa text labels.
- Tidak ada UUID/raw ID tampil di UI.
- Gambar kosong/rusak tidak menampilkan broken image icon.
- Browser dev mode tidak crash karena Tauri invoke.
- Native Tauri mode tidak mengalami `Database unavailable`.

## 6. MVP Scope

### 6.1 App Shell

App Shell MVP terdiri dari:

- Sidebar.
- Main content area.
- Top/content header sederhana.
- Route outlet.
- Light mode first.
- Sakura accent secukupnya.

Sidebar MVP:

- Home
- Videos
- Images
- Performers
- Settings

### 6.2 Home

Home MVP menampilkan ringkasan sederhana:

- Total Videos.
- Total Images.
- Total Performers.
- Favorite count placeholder/simple count.
- Recent items placeholder.

Home tidak boleh menjadi complex dashboard pada MVP.

### 6.3 Videos

Video MVP mencakup:

- Video Collection.
- Video Detail.
- Video Add/Edit Form.

User harus bisa:

- Membuat Video baru.
- Menyimpan Video.
- Melihat Video di list.
- Membuka detail Video.
- Mengedit Video.
- Menutup dan membuka app ulang tanpa data hilang.

### 6.4 Images

Image MVP mencakup:

- Image Collection.
- Image Detail.
- Image Add/Edit Form.

User harus bisa:

- Membuat Image baru.
- Menyimpan Image.
- Melihat Image di list.
- Membuka detail Image.
- Mengedit Image.
- Menutup dan membuka app ulang tanpa data hilang.

### 6.5 Performers

Performer MVP mencakup:

- Performer Collection.
- Performer Detail.
- Performer Add/Edit Form.

User harus bisa:

- Membuat Performer baru.
- Menyimpan Performer.
- Melihat Performer di list.
- Membuka detail Performer.
- Mengedit Performer.
- Menutup dan membuka app ulang tanpa data hilang.

### 6.6 Settings Minimal

Settings MVP hanya berisi informasi minimal:

- App name.
- App version placeholder.
- Database file placeholder.
- App data folder placeholder.
- Disabled/future feature notes.

Settings tidak boleh menjadi advanced configuration manager di MVP.

## 7. Functional Requirements

### FR-001 — Navigation

User dapat berpindah ke:

- Home
- Videos
- Images
- Performers
- Settings

Acceptance criteria:

- Semua menu sidebar bisa diklik.
- Route tidak menyebabkan blank page.
- `/videos/new`, `/images/new`, dan `/performers/new` tidak dianggap sebagai dynamic id.

### FR-002 — Video CRUD Basic

User dapat membuat, melihat, dan mengedit Video.

Required field:

- `title`

Optional fields:

- `originalTitle`
- `code`
- `censorship`
- `availability`
- `releaseDate`
- `durationMinutes`
- `publisherLabel`
- `coverPath`
- `mediaPath`
- `categoriesJson`
- `ratingJson`
- `notes`
- `favorite`

Acceptance criteria:

- Save gagal jika `title` kosong.
- Save berhasil jika `title` valid.
- Data muncul di Video Collection.
- Data bisa dibuka di Video Detail.
- Data bisa diedit.
- Data tetap ada setelah restart.
- Categories tampil sebagai label, bukan raw JSON/UUID.

### FR-003 — Image CRUD Basic

User dapat membuat, melihat, dan mengedit Image.

Required field:

- `title`

Optional fields:

- `originalTitle`
- `code`
- `censorship`
- `availability`
- `releaseDate`
- `publisherLabel`
- `coverPath`
- `folderPath`
- `imageCount`
- `categoriesJson`
- `ratingJson`
- `notes`
- `favorite`

Acceptance criteria:

- Save gagal jika `title` kosong.
- Save berhasil jika `title` valid.
- Data muncul di Image Collection.
- Data bisa dibuka di Image Detail.
- Data bisa diedit.
- Data tetap ada setelah restart.
- Broken cover path memakai placeholder.

### FR-004 — Performer CRUD Basic

User dapat membuat, melihat, dan mengedit Performer.

Required field:

- `name`

Optional fields:

- `originalName`
- `aliasesJson`
- `status`
- `birthDate`
- `coverPath`
- `filmographyCount`
- `pictorialsCount`
- `categoriesJson`
- `ratingJson`
- `notes`
- `favorite`

Acceptance criteria:

- Save gagal jika `name` kosong.
- Save berhasil jika `name` valid.
- Data muncul di Performer Collection.
- Data bisa dibuka di Performer Detail.
- Data bisa diedit.
- Data tetap ada setelah restart.
- Aliases tampil sebagai text/chips, bukan raw JSON.

### FR-005 — Categories MVP

User dapat menambah, melihat, menghapus, menyimpan, dan membuka ulang categories sebagai text labels.

Acceptance criteria:

- Category input bisa diketik.
- Category bisa ditambah.
- Category bisa dihapus.
- Category tersimpan.
- Category muncul ulang saat form/detail dibuka.
- Category tidak berubah menjadi UUID.
- Category tidak tampil sebagai raw JSON.

### FR-006 — Rating MVP

User dapat menyimpan rating sederhana sebagai structured data.

Acceptance criteria:

- Rating bisa diisi.
- Rating tersimpan.
- Rating tampil di detail.
- Rating tidak menyebabkan crash jika kosong.
- Rating tidak tampil sebagai raw JSON.

### FR-007 — Favorite

User dapat menandai item sebagai Favorite.

Acceptance criteria:

- Favorite bisa aktif/nonaktif.
- Status Favorite tersimpan.
- Status Favorite muncul ulang setelah restart.

### FR-008 — Manual File Path

User dapat mengisi path secara manual.

Fields:

- Video: `coverPath`, `mediaPath`
- Image: `coverPath`, `folderPath`
- Performer: `coverPath`

Acceptance criteria:

- Path bisa diketik manual.
- Path kosong tidak menyebabkan broken UI.
- Path rusak memakai placeholder.
- Browse button tidak aktif atau diberi label future placeholder.
- Tidak ada native file picker pada MVP.

### FR-009 — Placeholder Image Fallback

Jika image path kosong/rusak, UI harus menampilkan placeholder.

Acceptance criteria:

- Tidak ada broken image icon.
- Collection card tetap rapi.
- Detail page tetap rapi.
- Form preview tetap rapi.

## 8. Non-Functional Requirements

### NFR-001 — Local/offline

Aplikasi harus berjalan lokal/offline.

Tidak boleh bergantung pada:

- Cloud service.
- Online account.
- Remote database.
- External metadata API untuk MVP.

### NFR-002 — Windows-first

Aplikasi ditargetkan untuk Windows desktop.

### NFR-003 — Stability over speed

Keputusan arsitektur harus mengutamakan:

- Stabil.
- Mudah diaudit.
- Mudah di-debug.
- Tidak terlalu banyak magic.
- Tidak over-engineered.

### NFR-004 — Beginner-friendly workflow

Task harus kecil dan jelas.

Setiap task coding nanti harus punya:

- Scope.
- Do not touch.
- Acceptance criteria.
- Expected changed files.
- Test command.
- Manual check.
- Rollback plan.
- Remaining risks.

### NFR-005 — Browser mode safety

Frontend static/dev browser tidak boleh crash hanya karena Tauri API tidak tersedia.

### NFR-006 — Native mode safety

Native Tauri mode harus bisa membuka database lokal dengan benar.

## 9. Data Requirements

### Video

Lihat data model di `01-clean-planning.md`.

### Image

Lihat data model di `01-clean-planning.md`.

### Performer

Lihat data model di `01-clean-planning.md`.

### JSON fields

JSON fields wajib punya safe parse/fallback.

Jika JSON invalid/kosong:

- categories menjadi `[]`.
- aliases menjadi `[]`.
- rating menjadi default object kosong/safe.

## 10. Route Requirements

Routes MVP:

```text
/
 /videos
 /videos/new
 /videos/:id
 /videos/:id/edit
 /images
 /images/new
 /images/:id
 /images/:id/edit
 /performers
 /performers/new
 /performers/:id
 /performers/:id/edit
 /settings
```

Route risk rule:

- Static route `/new` harus didaftarkan sebelum dynamic `/:id`.
- Jika id tidak ditemukan, tampilkan friendly not found state.
- Jangan tampilkan raw id ke user.

## 11. UI Requirements

Style MVP:

- Flat minimal.
- Apple-inspired.
- Sakura accent.
- Light mode first.
- Compact cards.
- Clean spacing.
- Tidak ramai.
- Responsive HD sampai 4K.
- Placeholder untuk gambar kosong/rusak.

UI tidak boleh:

- Menampilkan raw UUID.
- Menampilkan raw JSON.
- Menampilkan broken image icon.
- Menampilkan fitur post-MVP sebagai fitur aktif.

## 12. Out of Scope

Tidak dikerjakan di MVP:

- Advanced Categories Manager.
- Related Performer picker.
- Related Video/Image relations.
- Native file picker.
- Backup/Restore.
- Missing files scanner.
- Bulk add.
- Scraping.
- Media player.
- Advanced Settings.
- Complex dashboard.
- Advanced analytics.

## 13. MVP User Journey

### Video journey

1. User membuka Videos.
2. User klik Add Video.
3. User mengisi title.
4. User mengisi metadata opsional.
5. User menambah categories sederhana.
6. User klik Save.
7. User kembali ke Video Collection.
8. User membuka Video Detail.
9. User klik Edit.
10. User mengubah data.
11. User Save.
12. User restart app.
13. Data tetap ada.

### Image journey

Sama seperti Video, tetapi memakai Image fields.

### Performer journey

Sama seperti Video, tetapi field utama adalah `name`.

## 14. Risk Controls

| Risk | Control |
|---|---|
| `/new` route bug | Static route before dynamic route |
| Tauri invoke crash | Runtime guard and adapter |
| Database unavailable | Backend test before integration |
| Category UUID | Use text labels in `categoriesJson` |
| Raw ID visible | UI mapping layer, no relation MVP |
| Broken image | Placeholder fallback |
| Form typing crash | Manual typing test |
| Persistence failure | Restart test before next phase |
| Over-scoping | One task, one goal |
| Test pass but UI fail | Manual smoke checklist mandatory |

## 15. MVP Acceptance Criteria

MVP diterima jika:

- Video CRUD basic pass.
- Image CRUD basic pass.
- Performer CRUD basic pass.
- Restart persistence pass.
- No raw UUID/id visible.
- No raw JSON visible.
- No broken image icon.
- Browser mode safe.
- Native mode database available.
- Manual form typing pass.
- Categories save/reopen pass.
- Favorite save/reopen pass.

## 16. PRD Decision

PRD dibuat di ChatGPT/planning discussion.

Codex tidak digunakan untuk membuat PRD.

Codex baru dipakai setelah dokumen berikut disetujui:

- Clean Planning.
- MVP PRD.
- UI Wireframe.
- Visual Design Guide.
## Approved Visual Baseline v1

Visual UI Mockup v1 sudah disetujui sebagai baseline untuk fase **Frontend Static Only**.

Halaman baseline:

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

Keputusan visual baseline:

- Light mode first.
- Sakura pink accent.
- Apple-inspired flat minimal style.
- Sidebar kiri dengan menu Home, Videos, Images, Performers, Settings.
- Top window bar placeholder.
- Bottom status bar konsisten.
- Rounded cards dan subtle border.
- Placeholder image wajib, tidak boleh broken image icon.
- Minor text changes diperbolehkan.

Koreksi teks yang wajib diterapkan saat implementasi:

- Performers search placeholder: `Search performers...`.
- Images collection count: `24 images`.
- Video rating term: `Rewatch`.

Constraint implementasi:

- Frontend static terlebih dahulu.
- Tidak ada SQLite pada fase frontend static.
- Tidak ada Tauri invoke pada fase frontend static.
- Tidak ada native file picker.
- Tidak ada relation picker.
- Tidak ada real CRUD.
- Tidak ada persistence.
- Tech Info hanya read-only placeholder.
- Related Content hanya read-only placeholder.
- Browse button disabled.
- Performer advanced fields boleh tampil secara visual, tetapi inactive/placeholder untuk MVP.

Visual baseline tidak mengubah core MVP:

```text
Add → Save → List → Detail → Edit → Restart → Data tetap ada
```

Namun pembuktian core MVP baru dilakukan setelah fase Backend Only dan Integration Only, bukan pada Frontend Static Only.
