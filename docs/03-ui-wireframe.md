# 03 — Sakurava UI Wireframe

## Status

Dokumen ini sudah disesuaikan dengan **Visual UI Mockup v1** yang telah disetujui sebagai baseline desain.

Visual mockup v1 mencakup:

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

Minor text changes diperbolehkan selama tidak mengubah scope MVP.

---

## 1. Wireframe Principles

Wireframe ini mengunci struktur halaman, section, field, action, dan constraint UX.

Tidak boleh:

- Coding.
- Database.
- Tauri invoke.
- SQLite.
- Native file picker.
- Relation picker.
- Real CRUD.
- Persistence.

Pada fase Frontend Static Only, semua data menggunakan mock data.

---

## 2. App Shell

### 2.1 Layout

```text
┌─────────────────────────────────────────────────────────────┐
│ Top Window Bar: Sakurava                                    │
├───────────────┬─────────────────────────────────────────────┤
│ Sidebar       │ Main Content                                │
│               │                                             │
│ Home          │ Page content                                │
│ Videos        │                                             │
│ Images        │                                             │
│ Performers    │                                             │
│ Settings      │                                             │
│               │                                             │
│ Sakura art    │                                             │
├───────────────┴─────────────────────────────────────────────┤
│ Bottom Status Bar                                           │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Sidebar MVP

Menu:

- Home
- Videos
- Images
- Performers
- Settings

Rules:

- Active menu mengikuti route saat ini.
- Sidebar tidak berisi fitur teknis/advanced.
- Tidak ada Backup, Scraping, Analytics, atau Category Manager di sidebar MVP.

### 2.3 Bottom Status Bar

Isi minimal:

- Local mode
- Database status placeholder
- Last update placeholder

Pada Frontend Static Only, semua status adalah placeholder.

---

## 3. Home Page

### Purpose

Memberi ringkasan lokal dan shortcut untuk mulai katalog.

### Sections

1. Page Header
   - Title: `Home`
   - Subtitle: `Local private catalog for Videos, Images, and Performers`
   - Search global visual placeholder.

2. Welcome Hero
   - Welcome text.
   - Sakura visual accent.
   - Get Started button.

3. Summary Cards
   - Videos count.
   - Images count.
   - Performers count.

4. Quick Actions
   - Add Video.
   - Add Image.
   - Add Performer.

5. Continue Cataloging
   - Recent Videos placeholder.
   - Recent Images placeholder.
   - Recent Performers placeholder.

6. Recently Added
   - Mixed placeholder cards.

### Frontend Static Constraint

- All counts are mock values.
- Buttons may navigate to static routes.
- No persistence.

---

## 4. Video Collection Page

### Header

- Title: `Videos`
- Subtitle: `Manage your local video catalog`
- Count text example: `24 videos`
- Primary action: `Add Video`

### Controls

- Search input: `Search videos...`
- Availability filter.
- Sort select.
- Grid/list toggle visual.

### Card Content

Each Video card shows:

- Cover placeholder.
- Favorite icon.
- Title.
- Original Title.
- Duration.
- Availability chip.
- Censorship chip.
- Categories chips.

### Rules

- No broken image icon.
- No raw ID/UUID.
- Cards can link to `/videos/sample-id` in static phase.

---

## 5. Video Detail Page

### Header

- Back to Videos.
- Title: `Video Detail`.
- Subtitle: `View saved video catalog information`.
- Edit button.

### Hero / Identity

- Cover placeholder 16:9.
- Title.
- Original Title.
- Code.
- Favorite chip.
- Availability chip.
- Censorship chip.
- Categories chips.

### Metadata Card

- Release Date.
- Duration.
- Publisher / Label.

### Rating Summary

Rating axes:

- Rewatch
- Performance
- Visual
- Intensity
- Story
- Chemistry

Detail may show rating list and spider/radar visualization.

### Tech Info

Read-only placeholder only:

- Resolution.
- File Size.
- File Type / Codec.
- Bitrate.
- Frame Rate.

Do not calculate file metadata in MVP frontend static.

### Notes

- Read-only notes display.

### Related Content

Read-only placeholder only:

- Related Performer.
- Related Images.

No picker and no relation links in MVP static.

---

## 6. Video Add/Edit Form

Use the form rules from `03a-mvp-form-specification.md`.

### Section Order

1. Basic Identity
2. Quick Classification
3. Cover & File Path
4. Release Metadata
5. Tech Info
6. Rating
7. Notes
8. Related Content

### Important Rules

- Title is required.
- Rewatch is the locked Video rating term.
- Tech Info is read-only placeholder.
- Related Content is read-only placeholder.
- Browse Cover and Browse Media are disabled.
- No relation picker.
- No native file picker.

---

## 7. Image Collection Page

### Header

- Title: `Images`
- Subtitle: `Manage your local image catalog`
- Count text example: `24 images`
- Primary action: `Add Image`

### Controls

- Search input: `Search images...`
- Availability filter.
- Sort select.
- Grid/list toggle visual.

### Card Content

Each Image card shows:

- Cover placeholder.
- Favorite icon.
- Title.
- Original Title.
- Code.
- Image count.
- Availability chip.
- Censorship chip.
- Categories chips.

### Rules

- Use `24 images`, not `24 videos`.
- No broken image icon.
- No raw ID/UUID.

---

## 8. Image Detail Page

### Header

- Back to Images.
- Title: `Image Detail`.
- Subtitle: `View a local image catalog item`.
- Edit button.

### Hero / Identity

- Cover placeholder.
- Title.
- Original Title.
- Code.
- Favorite chip.
- Availability chip.
- Censorship chip.
- Categories chips.

### Metadata Card

- Release Date.
- Image Count.
- Publisher / Label.
- Cover Path.
- Folder Path.

### Rating Summary

Rating axes:

- Memorability
- Visual
- Posing
- Atmosphere
- Flow
- Signature

### Tech Info

Read-only placeholder only:

- Folder Size.
- Detected Image Count.
- Main Resolution.
- File Types.

### Notes

- Read-only notes display.

### Related Content

Read-only placeholder only:

- Related Performer.
- Related Video.

### Gallery Grid

Static placeholder gallery grid may appear visually.

No folder scan in MVP static.

---

## 9. Image Add/Edit Form

Use the form rules from `03a-mvp-form-specification.md`.

### Section Order

1. Basic Identity
2. Quick Classification
3. Cover & Folder Path
4. Release Metadata
5. Tech Info
6. Rating
7. Notes
8. Related Content

### Important Rules

- Title is required.
- Tech Info is read-only placeholder.
- Related Content is read-only placeholder.
- Browse Cover and Browse Folder are disabled.
- No relation picker.
- No native file picker.

---

## 10. Performer Collection Page

### Header

- Title: `Performers`
- Subtitle: `Manage your local performer catalog`
- Count text example: `24 performers`
- Primary action: `Add Performer`

### Controls

- Search input: `Search performers...`
- Status or availability-style filter.
- Sort select.
- Grid/list toggle visual.

### Card Content

Each Performer card shows:

- Profile placeholder.
- Favorite icon.
- Name.
- Original Name.
- Status chip.
- Filmography placeholder count.
- Pictorials placeholder count.
- Categories chips.

### Rules

- Search placeholder must be `Search performers...`.
- No broken image icon.
- No raw ID/UUID.

---

## 11. Performer Detail Page

### Header

- Back to Performers.
- Title: `Performer Detail`.
- Subtitle: `View profile, catalog summary, and personal notes`.
- Edit button.

### Profile Identity

- Main profile image placeholder.
- Four mini thumbnail placeholders.
- Name.
- Original Name.
- Status chip.
- Favorite chip.
- Aliases chips.
- Categories chips.

### Summary Cards

- Years Active placeholder.
- Filmography placeholder.
- Pictorials placeholder.

### Rating Summary

Visual mockup v1 uses six axes:

- Attraction
- Visual
- Performance
- Popularity
- Exceptional
- Versatility

For MVP implementation, these may be displayed as mock/static visual placeholder unless explicitly integrated later.

### Personal Card

Visual mockup includes:

- Birth Date.
- Birthplace.
- Nationality.
- Astrological Sign.
- Blood Type.

MVP saved field requirement remains only `birthDate`. Other personal fields may appear as inactive/placeholder unless the data model is updated in a later approved phase.

### Physical Card

Visual mockup includes:

- Height.
- Weight.
- Measurement.
- Cup Size.

These are visual placeholder fields for MVP. They are not required to be saved or validated.

### Notes

- Read-only notes display.

### Related Content

Read-only placeholder only:

- Related Video.
- Related Images.

No relation picker in MVP static.

---

## 12. Performer Add/Edit Form

Use the form rules from `03a-mvp-form-specification.md`.

### Section Order from Visual Mockup v1

1. Basic Identity
2. Media
3. Summary
4. Personal
5. Physical
6. Rating
7. Notes
8. Related Videos
9. Related Images

### Active MVP Fields

- Name.
- Original Name.
- Favorite.
- Status.
- Aliases.
- Categories.
- Cover Path.
- Birth Date.
- Notes.

### Visible but Inactive/Placeholder Fields

The following may remain visible to match visual mockup v1, but must not be required for MVP save:

- Thumbnail 1.
- Thumbnail 2.
- Thumbnail 3.
- Thumbnail 4.
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

### Rating Visual Rule

Performer rating may visually show:

- Attraction.
- Visual.
- Performance.
- Popularity.
- Exceptional.
- Versatility.

For MVP frontend static, rating can be local/mock UI only. Do not connect to backend until the rating schema is explicitly approved for integration.

---

## 13. Settings Page

### Header

- Title: `Settings`
- Subtitle: `Minimal local app settings`

### App Info

Read-only:

- App Name: Sakurava.
- Version: 1.0.0 MVP placeholder.
- Mode: Local / Offline.
- Build: Desktop App Placeholder.

### Storage Info

Read-only:

- Database file: `sakurava.sqlite`.
- App data folder: `app.sakurava.desktop`.
- Database status: Ready placeholder.
- Storage mode: Local only.

### Notes

- Settings are minimal and read-only in MVP.
- More configuration options are future releases.

---

## 14. Frontend Static Implementation Rules

- Do not implement all pages in one task.
- Start with App Shell + Routing only.
- Use mock data only.
- No SQLite.
- No Tauri invoke.
- No native file picker.
- No relation picker.
- No real CRUD.
- No persistence.
- No raw ID/UUID visible.
- No broken image icons.
- Tech Info must be read-only placeholder.
- Related Content must be read-only placeholder.
- Browse buttons must be disabled.

---

## 15. Route Safety Rules

Static routes must not be interpreted as dynamic ID routes.

Required checks:

```text
/videos/new -> VideoCreatePage
/images/new -> ImageCreatePage
/performers/new -> PerformerCreatePage
```

These must not render detail pages with `id = "new"`.
