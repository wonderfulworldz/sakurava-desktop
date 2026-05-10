# Sakurava — Visual Approval Notes

## 1. Purpose

Dokumen ini menjadi checkpoint setelah semua visual UI mockup Sakurava selesai dibuat.

Fungsi dokumen:

- Mengunci visual direction sebelum masuk frontend.
- Menentukan page visual yang sudah disetujui.
- Menentukan pola UI final yang harus diikuti saat Frontend Static Only.
- Menandai elemen yang hanya placeholder dan belum boleh diimplementasikan sebagai fitur aktif.
- Mencegah scope MVP melebar saat mulai coding.

Dokumen ini berada di akhir:

```text
Phase 2B — Visual UI Mockup Image
```

Setelah dokumen ini disetujui, project boleh masuk ke:

```text
Phase 3 — Frontend Static Only
```

---

## 2. Approved Visual Pages

Centang hanya jika gambar sudah disetujui.

```text
[ ] App Shell
[ ] Home
[ ] Video Collection
[ ] Video Detail
[ ] Video Add/Edit Form
[ ] Image Collection
[ ] Image Detail
[ ] Image Add/Edit Form
[ ] Performer Collection
[ ] Performer Detail
[ ] Performer Add/Edit Form
[ ] Settings Minimal
```

Jika ada halaman belum final, jangan masuk full frontend. Maksimal lanjut ke App Shell + Routing placeholder.

---

## 3. Final UI Direction

Visual style final Sakurava:

```text
Flat minimal desktop app UI.
Apple-inspired layout and spacing.
Light mode first.
Soft Sakura accent.
Clean white/off-white background.
Compact but readable cards.
Rounded corners.
Subtle borders.
No heavy shadows.
Neutral placeholder images.
No explicit imagery.
```

| Principle | Decision |
|---|---|
| Theme | Light mode first |
| Accent | Soft Sakura accent |
| Density | Compact but readable |
| Card style | Rounded, subtle border, low shadow |
| Image handling | Placeholder fallback required |
| Layout | Desktop-first, responsive HD–4K |
| Complexity | MVP-only, no advanced dashboard |

---

## 4. Final App Shell Pattern

Sidebar MVP hanya berisi:

```text
Home
Videos
Images
Performers
Settings
```

Tidak boleh menambahkan ke sidebar MVP:

```text
Advanced Categories
Backup / Restore
Scraping
Media Player
Analytics
File Scanner
Developer Tools
```

App Shell structure:

```text
App Shell
├─ Sidebar
├─ Page Header
├─ Main Content
└─ Optional Compact Bottom Status
```

Rules:

- Sidebar harus konsisten di semua page.
- Page header harus menampilkan title dan subtitle/action secara jelas.
- Main content harus nyaman untuk HD sampai 4K.
- Jangan tampilkan debug log atau internal technical info ke user.

---

## 5. Final Page Patterns

### 5.1 Collection Page Pattern

Dipakai untuk:

- Video Collection
- Image Collection
- Performer Collection

Struktur final:

```text
Page Header
Top Action Row
Optional View Controls
Card Grid / List Area
Empty State
```

Required elements:

| Element | Required |
|---|---|
| Search input | Yes |
| Simple filter | Yes |
| Sort select | Yes |
| Add button | Yes |
| Card grid | Yes |
| Empty state | Yes |
| Placeholder image fallback | Yes |

Rules:

- Card compact.
- Jangan tampilkan raw ID.
- Jangan tampilkan UUID.
- Jangan tampilkan raw JSON.
- Jangan tampilkan broken image icon.
- Add button menuju route `/new`.

---

### 5.2 Detail Page Pattern

Dipakai untuk:

- Video Detail
- Image Detail
- Performer Detail

Struktur final:

```text
Header / Back / Edit
Hero / Main Info
Metadata
Rating Summary
Tech Info Placeholder
Notes
Related Content Placeholder
```

Rules:

- Edit button jelas.
- Cover/profile image punya fallback placeholder.
- Metadata utama mudah dibaca.
- Rating summary boleh memakai spider chart placeholder.
- Spider chart hanya boleh muncul di Detail Page.
- Tech Info tetap read-only placeholder.
- Related Content tetap read-only placeholder.
- Tidak boleh ada active relation picker.
- Tidak boleh ada media player MVP.

---

### 5.3 Add/Edit Form Pattern

Dipakai untuk:

- Video Add/Edit Form
- Image Add/Edit Form
- Performer Add/Edit Form

Struktur final:

```text
Header
Save / Cancel Actions
Basic Identity
Classification
Path / Image
Metadata
Tech Info Placeholder
Rating
Notes
Related Content Placeholder
```

Rules:

- Form menggunakan single scroll.
- Jangan gunakan tabs untuk MVP.
- Save dan Cancel harus mudah terlihat.
- Field wajib minimal:
  - Video: Title
  - Image: Title
  - Performer: Name
- Browse button harus disabled placeholder.
- Tech Info harus read-only placeholder.
- Related Content harus read-only placeholder.
- Rating menggunakan slider / number / segmented 1–5.
- Spider chart tidak boleh muncul di form.
- Categories harus text labels only.
- Aliases harus text labels only.
- Publisher / Label adalah text input untuk MVP.

---

## 6. Reusable Components for Frontend Static

### Layout Components

```text
AppShell
Sidebar
PageHeader
MainContent
BottomStatusBar optional
```

### Collection Components

```text
CollectionToolbar
SearchInput
FilterSelect
SortSelect
ViewTogglePlaceholder
EntityCard
EmptyState
```

### Form Components

```text
FormShell
FormSection
TextField
NumberField
DateField
SelectField
ToggleField
TextareaField
TagChipInputStatic
RatingControl
DisabledBrowseButton
ReadOnlyPlaceholderPanel
SaveCancelActions
```

### Detail Components

```text
DetailHero
MetadataCard
RatingSummary
SpiderChartPlaceholder
TechInfoPlaceholder
RelatedContentPlaceholder
NotesPanel
ImageFallback
```

### Shared Utility UI

```text
Chip
Badge
Button
Card
PlaceholderImage
StatusPill
FavoriteIndicator
```

---

## 7. Placeholder Rules

### 7.1 Image Placeholder

```text
If coverPath is empty or invalid, show neutral placeholder.
Never show broken image icon.
```

### 7.2 Browse Buttons

Browse buttons must appear disabled:

```text
Browse Cover — disabled
Browse Media — disabled
Browse Folder — disabled
```

They must not trigger:

```text
Native file picker
Tauri file system permission
File scanning
Path validation
```

### 7.3 Tech Info

Tech Info is read-only placeholder only.

Video examples:

```text
Resolution: Not detected yet
File Size: Not detected yet
Codec: Not detected yet
Bitrate: Not detected yet
Frame Rate: Not detected yet
```

Image examples:

```text
Folder Size: Folder analysis is not available in MVP
Detected Image Count: Folder analysis is not available in MVP
Main Resolution: Folder analysis is not available in MVP
File Types: Folder analysis is not available in MVP
```

Performer examples:

```text
Linked Videos Count: Not available in MVP
Linked Images Count: Not available in MVP
Last Updated: System generated later
```

### 7.4 Related Content

Related Content is read-only placeholder only.

Examples:

```text
Related Images: Available after relation features are added.
Related Performer: Available after relation features are added.
Related Video: Available after relation features are added.
```

Related Content must not be:

```text
Clickable
Editable
Searchable
Picker-based
Relation-backed
```

---

## 8. Do Not Implement Yet

The following features remain post-MVP:

```text
Advanced Categories Manager
Related Performer picker
Related Video/Image relations
Native file picker
Backup/Restore
Missing files scanner
Bulk add
Scraping
Media player
Advanced Settings
Complex dashboard
Advanced analytics
```

Why delayed:

| Feature | Reason |
|---|---|
| Advanced Categories Manager | Risiko category berubah menjadi ID/UUID |
| Relation picker | Risiko raw ID tampil di UI |
| Native file picker | Butuh Tauri permission/capability |
| Backup/Restore | Menyentuh database lifecycle |
| Missing files scanner | Membutuhkan file system scan |
| Scraping | Kompleks dan rawan mapping metadata salah |
| Media player | Bukan kebutuhan CRUD MVP |
| Analytics | Tidak dibutuhkan sebelum data stabil |

---

## 9. Frontend Static Readiness Checklist

Sebelum masuk Phase 3:

```text
[ ] Semua visual page utama disetujui.
[ ] App Shell final.
[ ] Sidebar final.
[ ] Collection pattern final.
[ ] Detail pattern final.
[ ] Form pattern final.
[ ] Color/accent final.
[ ] Placeholder image style final.
[ ] Disabled Browse button style final.
[ ] Tech Info placeholder style final.
[ ] Related Content placeholder style final.
[ ] Rating control style final.
[ ] Category chip input style final.
[ ] Tidak ada post-MVP feature aktif di mockup.
[ ] Tidak ada raw ID/UUID di mockup.
[ ] Tidak ada broken image icon di mockup.
```

Jika belum semua selesai, hanya boleh lanjut ke:

```text
App Shell + Routing + Empty Placeholder Pages
```

---

## 10. Remaining Visual Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Mockup terlalu kompleks | Frontend static terlalu besar | Pecah implementasi per page |
| Form terlalu panjang | User overwhelmed | Gunakan compact sections dan scroll |
| Placeholder terlihat aktif | User mengira fitur sudah jalan | Disabled/read-only styling harus jelas |
| Card style tidak konsisten | Komponen sulit reusable | Gunakan shared card component |
| Detail terlalu ramai | Informasi sulit dibaca | Prioritaskan hero + metadata + rating |
| Rating UI terlalu berat | Form sulit dibuat | Gunakan segmented/number 1–5 |
| Visual tidak responsive | Layout rusak di HD/4K | Definisikan grid responsive di frontend phase |
| Sakura accent berlebihan | UI terlihat ramai | Accent hanya untuk action, active nav, selected chip |

---

## 11. Phase 3 Entry Rule

Phase 3 boleh dimulai hanya jika dokumen berikut cukup:

```text
01-clean-planning.md
02-mvp-prd.md
03a-mvp-form-specification.md
03-ui-wireframe-revised.md
04-visual-design-guide.md
04a-visual-mockup-prompt-pack.md
04b-visual-approval-notes.md
```

Phase 3 tidak boleh langsung membuat semua fitur.

---

## 12. Recommended Phase 3 Task Order

### Task 1 — App Shell + Routing Only

Scope:

```text
Create static React app shell and MVP routes.
No entity UI details yet.
No backend.
No SQLite.
No Tauri invoke.
```

Routes:

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

Risk controls:

```text
/videos/new must not be treated as /videos/:id
/images/new must not be treated as /images/:id
/performers/new must not be treated as /performers/:id
```

### Task 2 — Shared UI Components Only

Scope:

```text
Create reusable static components.
No full page implementation yet.
No persistence.
```

### Task 3 — Static Video Pages Only

Scope:

```text
Create Video Collection, Detail, and Form with mock data only.
No backend.
No SQLite.
No Tauri invoke.
```

### Task 4 — Static Image Pages Only

Scope:

```text
Create Image Collection, Detail, and Form with mock data only.
Reuse existing patterns.
```

### Task 5 — Static Performer Pages Only

Scope:

```text
Create Performer Collection, Detail, and Form with mock data only.
Reuse existing patterns.
```

### Task 6 — Static Settings + Home Polish

Scope:

```text
Create Home and Settings Minimal static pages.
No advanced settings.
```

---

## 13. First Codex Task Recommendation

When ready to use Codex, start with this task only:

```text
Create frontend static app shell and routing only.
```

Do not start with:

```text
Create full frontend from all mockups.
```

That is too large and too risky.

---

## 14. Codex Prompt — Task 1 Draft

```text
You are working on Sakurava, a local offline desktop catalog app.

Task:
Create frontend static App Shell + Routing only.

Scope:
- Set up the static React app shell structure.
- Add MVP routes.
- Add sidebar navigation.
- Add placeholder pages for each route.
- Do not implement full page UI yet.
- Do not implement forms yet.
- Do not implement backend, SQLite, Tauri invoke, or persistence.

Required routes:
- /
- /videos
- /videos/new
- /videos/:id
- /videos/:id/edit
- /images
- /images/new
- /images/:id
- /images/:id/edit
- /performers
- /performers/new
- /performers/:id
- /performers/:id/edit
- /settings

Critical routing rule:
- /videos/new must not be treated as /videos/:id
- /images/new must not be treated as /images/:id
- /performers/new must not be treated as /performers/:id

UI requirements:
- Light mode first.
- Flat minimal.
- Apple-inspired spacing.
- Soft Sakura accent.
- Sidebar items only: Home, Videos, Images, Performers, Settings.
- Placeholder pages should show page title and route purpose.

Do not touch:
- No SQLite.
- No Tauri invoke.
- No backend.
- No repository/service layer.
- No native file picker.
- No relation picker.
- No scraping.
- No backup/restore.
- No media player.
- No advanced analytics.
- No database file.

Expected changed files:
- Only frontend routing/app shell related files.
- List expected files before editing.

Before editing:
1. Inspect current state.
2. Give a short plan.
3. List expected changed files.
4. Mention risks before editing.

Acceptance criteria:
- App opens in browser mode without Database unavailable.
- Sidebar navigation works.
- All routes render placeholder pages.
- /videos/new opens Add Video placeholder, not Video Detail.
- /images/new opens Add Image placeholder, not Image Detail.
- /performers/new opens Add Performer placeholder, not Performer Detail.
- No Tauri invoke is used.
- No backend or SQLite is added.

Verification:
- Run typecheck if available.
- Run tests if available.
- Run build if available.
- Manual route check is required.

After finishing:
1. List files changed.
2. List verification commands.
3. Report test/build result.
4. List manual checks required.
5. Mention remaining risks.
```

---

## 15. Approval

Visual approval status:

```text
Status: Pending user review
```

Next recommended action:

```text
Review this document.
If approved, begin Phase 3 with Task 1: App Shell + Routing Only.
```
