# 04 — Sakurava Visual Design Guide

## Status

Dokumen ini sudah disesuaikan dengan **Visual UI Mockup v1** yang telah disetujui sebagai baseline desain frontend static.

Visual mockup v1 menjadi acuan utama untuk:

- Layout umum.
- Sidebar.
- Top window bar.
- Bottom status bar.
- Card style.
- Form style.
- Sakura accent.
- Placeholder image.
- Page hierarchy.

Minor text changes diperbolehkan selama tidak mengubah scope MVP.

---

## 1. Approved Visual UI Mockup v1

Halaman baseline:

1. App Shell
2. Home
3. Videos
4. Video Detail
5. Video Edit
6. Images
7. Image Detail
8. Image Edit
9. Performers
10. Performer Detail
11. Performer Edit
12. Settings

Keputusan:

```text
Visual UI Mockup v1: Approved with implementation constraints
```

---

## 2. Visual Direction

Sakurava menggunakan gaya:

- Flat minimal.
- Apple-inspired.
- Sakura accent.
- Light mode first.
- Clean spacing.
- Compact cards.
- Calm visual hierarchy.
- Rounded cards.
- Subtle borders.
- Neutral placeholders.
- Tidak ramai.
- Tidak menampilkan broken image icon.

Tujuan visual bukan untuk terlihat kompleks, tetapi membuat data mudah dibaca dan nyaman dikelola.

---

## 3. Color Direction

### Primary Accent

Sakura pink digunakan untuk:

- Primary action button.
- Active sidebar menu.
- Favorite icon.
- Important chips.
- Small accent icon.

Jangan gunakan pink terlalu banyak pada konten besar.

### Background

Gunakan light background:

- Main background putih/off-white.
- Sidebar sangat soft pink gradient.
- Card background putih.
- Placeholder image abu-abu lembut.

### Borders

Gunakan border lembut:

- Thin border.
- Low contrast.
- Rounded corners.

---

## 4. App Shell Rules

### Sidebar

Sidebar berisi hanya:

- Home
- Videos
- Images
- Performers
- Settings

Rules:

- Menu aktif memakai sakura pink soft background.
- Icon solid/clean.
- Logo Sakurava di bagian atas.
- Sakura decoration boleh ada, tetapi jangan mengganggu navigasi.

### Top Window Bar

Top window bar menampilkan:

- Title: `Sakurava`.
- Window controls placeholder.

Pada frontend static, window control tidak perlu native behavior.

### Bottom Status Bar

Bottom status bar menampilkan:

- Local mode.
- Database status placeholder.
- Last update placeholder.

Pada frontend static, status tetap placeholder.

---

## 5. Page Header Rules

Setiap halaman utama memiliki:

- Page title.
- Page subtitle.
- Primary action bila relevan.

Contoh:

| Page | Title | Primary Action |
|---|---|---|
| Home | Home | Get Started / Quick Action |
| Videos | Videos | Add Video |
| Images | Images | Add Image |
| Performers | Performers | Add Performer |
| Settings | Settings | None |

---

## 6. Collection Page Rules

Collection pages menggunakan pola sama:

- Header.
- Count label.
- Primary action button.
- Search.
- Filter.
- Sort.
- Grid/list toggle.
- Card grid.

### Text Corrections

- Performers search placeholder: `Search performers...`.
- Images count label: `24 images`.
- Videos count label: `24 videos`.
- Performers count label: `24 performers`.

### Card Rules

Card harus menampilkan:

- Placeholder image.
- Favorite icon.
- Primary title/name.
- Secondary original title/name.
- Metadata singkat.
- Chips.

No raw ID or UUID.

---

## 7. Detail Page Rules

Detail pages menggunakan pola:

- Back button.
- Page title.
- Page subtitle.
- Edit button.
- Hero / identity card.
- Metadata cards.
- Rating summary.
- Tech info placeholder.
- Notes.
- Related content placeholder.

### Rating Visualization

Spider/radar chart boleh muncul di detail page sebagai visual summary.

Do not use spider chart as form input.

### Tech Info

Tech Info wajib read-only placeholder pada MVP.

Do not calculate:

- Video resolution.
- File size.
- Codec.
- Bitrate.
- Frame rate.
- Folder size.
- Detected image count.
- File types.

### Related Content

Related Content wajib read-only placeholder pada MVP.

Do not implement:

- Picker.
- Relation select.
- Clickable related item.
- Raw ID display.

---

## 8. Form Page Rules

Form pages menggunakan single scroll layout.

Rules:

- Save and Cancel visible near bottom.
- Required field marker minimal.
- Section title jelas.
- Input compact.
- Large visual decoration tidak perlu.
- Disabled buttons harus terlihat disabled.
- Inactive placeholder fields tidak boleh terlihat seperti required field.

### Browse Buttons

Browse buttons boleh tampil, tetapi disabled.

Tidak boleh implement native file picker pada MVP frontend static.

### Tech Info in Forms

Tech Info di form tidak editable.

Gunakan read-only placeholder.

### Related Content in Forms

Related Content di form tidak aktif.

Gunakan read-only placeholder.

---

## 9. Performer Advanced Field Rule

Performer Edit pada visual mockup v1 tidak disederhanakan secara tampilan.

Namun untuk MVP:

- Advanced fields boleh terlihat.
- Advanced fields harus inactive/placeholder.
- Advanced fields tidak wajib disimpan.
- Advanced fields tidak wajib divalidasi.
- Advanced fields tidak boleh membuat Save gagal.

Advanced performer fields meliputi:

- Thumbnail 1–4.
- Years Active.
- Filmography.
- Pictorials.
- Birthplace.
- Nationality.
- Astrological Sign.
- Blood Type.
- Height.
- Weight.
- Measurement.
- Cup Size.
- Related Videos.
- Related Images.

---

## 10. Rating Terms

### Video

Video rating term final:

- Rewatch.
- Performance.
- Visual.
- Intensity.
- Story.
- Chemistry.

Do not use `Replay Value` in implementation unless a later decision changes it.

### Image

Image rating term final:

- Memorability.
- Visual.
- Posing.
- Atmosphere.
- Flow.
- Signature.

### Performer

Performer visual mockup v1 uses:

- Attraction.
- Visual.
- Performance.
- Popularity.
- Exceptional.
- Versatility.

For MVP static, these may be displayed as inactive/mock rating fields unless schema activation is approved later.

---

## 11. Placeholder Image Rules

Never show broken image icon.

If image path is empty or invalid, show:

- Neutral placeholder background.
- Simple icon.
- Optional label such as `Cover Placeholder`.

Use consistent aspect ratio:

- Video cover: 16:9.
- Image cover: wide image placeholder.
- Performer cover: profile/avatar placeholder.
- Performer mini thumbnails: small square placeholders.

---

## 12. Responsive Rules

Frontend static should be prepared for:

- HD.
- Full HD.
- 2K.
- 4K.

Initial static implementation may focus on desktop width first, but layout should not rely on fixed pixel-only assumptions.

Use:

- Flexible grid.
- Responsive columns.
- Scrollable main content.
- Stable sidebar width.

---

## 13. Do Not Add to Visual MVP

Do not add:

- Native file picker behavior.
- Backup/restore UI.
- Scraping UI.
- Media player.
- Advanced analytics.
- Advanced category manager.
- Relation picker.
- Raw technical IDs.
- UUID display.

---

## 14. Frontend Static Acceptance Criteria

Visual implementation is acceptable if:

- App shell matches approved direction.
- Sidebar menu is correct.
- Bottom status bar is visible.
- Home, collection, detail, form, and settings pages match visual baseline.
- Minor text corrections are applied.
- Tech Info is read-only placeholder.
- Related Content is read-only placeholder.
- Browse buttons are disabled.
- Performer advanced fields are visible but inactive/placeholder.
- No SQLite.
- No Tauri invoke.
- No native file picker.
- No relation picker.
- No broken image icon.
- No raw ID/UUID visible.
