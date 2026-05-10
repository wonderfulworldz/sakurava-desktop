# 05 — Frontend Static Only Task Plan

## Status

Dokumen ini sudah disesuaikan dengan **Visual UI Mockup v1** yang telah disetujui.

Fase ini hanya membuat React UI static dengan mock data.

Tidak boleh ada:

- SQLite.
- Tauri invoke.
- Backend commands.
- Persistence.
- Real CRUD.
- Native file picker.
- Relation picker.
- Advanced categories.
- Backup/restore.
- Scraping.
- Media player.
- Analytics.

---

## 1. Purpose

Tujuan fase Frontend Static Only:

- Membuat UI sesuai visual mockup v1.
- Membuktikan route aman.
- Membuktikan layout shell stabil.
- Membuktikan form bisa diketik tanpa crash.
- Membuktikan placeholder/fallback bekerja.
- Tidak menyentuh backend atau database.

Frontend static belum membuktikan persistence.

Core MVP persistence baru dibuktikan pada Backend + Integration + Testing.

---

## 2. Approved Visual Baseline

Visual pages to follow:

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

Minor text changes allowed.

Required text corrections:

- Performers search placeholder: `Search performers...`.
- Images count label: `24 images`.
- Video rating term: `Rewatch`.

---

## 3. Global Static Constraints

All frontend static tasks must follow these rules:

- Use mock data only.
- No SQLite.
- No Tauri invoke.
- No backend commands.
- No real save.
- No persistence.
- No native file picker.
- No relation picker.
- No raw ID/UUID visible in UI.
- No broken image icon.
- Use placeholder image fallback.
- Browse buttons disabled.
- Tech Info read-only placeholder.
- Related Content read-only placeholder.
- Performer advanced fields visible but inactive/placeholder.

---

## 4. Batch Order

Do not implement all pages in one task.

Required safe order:

```text
Batch 1: App Shell + Routing
Batch 2: Static Home + Collection Pages
Batch 3: Static Video Detail + Video Form
Batch 4: Static Image Detail + Image Form
Batch 5: Static Performer Detail + Performer Form
Batch 6: Static UI Review
```

Each batch must pass manual check before continuing.

---

## 5. Batch 1 — App Shell + Routing

### Scope

Implement only:

- AppShell layout.
- Sidebar.
- TopWindowBar placeholder.
- BottomStatusBar placeholder.
- Route stubs for all MVP routes.
- Active sidebar state.

### Routes

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

### Critical Route Rule

Static routes must be matched before dynamic routes.

Required behavior:

```text
/videos/new -> VideoCreatePage
/images/new -> ImageCreatePage
/performers/new -> PerformerCreatePage
```

The string `new` must never be treated as an ID.

### Do Not Touch

- No collection cards.
- No detail layout.
- No full forms.
- No backend.
- No database.

### Acceptance Criteria

- App opens without backend.
- Sidebar shows Home, Videos, Images, Performers, Settings.
- Bottom status bar is visible.
- All MVP routes render without crashing.
- `/videos/new` renders create page.
- `/images/new` renders create page.
- `/performers/new` renders create page.
- No raw ID/UUID visible.
- Build/test pass.

### Manual Check

Open:

```text
/
/videos
/videos/new
/videos/sample-id
/videos/sample-id/edit
/images
/images/new
/images/sample-id
/images/sample-id/edit
/performers
/performers/new
/performers/sample-id
/performers/sample-id/edit
/settings
```

---

## 6. Batch 2 — Static Home + Collection Pages

### Scope

Implement:

- Home page.
- Videos collection.
- Images collection.
- Performers collection.
- Mock card data.
- Search/filter/sort visual controls.
- Grid/list toggle visual.
- Placeholder image fallback.

### Required Corrections

- Performers search placeholder: `Search performers...`.
- Images count label: `24 images`.

### Do Not Touch

- No detail pages.
- No forms.
- No backend.
- No real search logic required.
- No persistence.

### Acceptance Criteria

- Home matches visual baseline.
- Collection pages match visual baseline.
- Cards render with placeholder images.
- Favorite icons render.
- Chips render.
- No broken image icon.
- No raw ID/UUID visible.

---

## 7. Batch 3 — Static Video Detail + Video Form

### Scope

Implement:

- Video Detail page.
- Video Create page.
- Video Edit page.
- Static/local form state only.
- Category chip input visual/local state.
- Rating input visual/local state.
- Placeholder sections.

### Video Form Rules

- Use `Rewatch` as rating term.
- Browse Cover disabled.
- Browse Media disabled.
- Tech Info read-only placeholder.
- Related Performer read-only placeholder.
- Related Images read-only placeholder.
- No relation picker.
- No native file picker.

### Do Not Touch

- No Image pages.
- No Performer pages.
- No backend.
- No real save.
- No persistence.

### Acceptance Criteria

- Video detail matches visual baseline.
- Video form matches visual baseline.
- Typing in form does not crash.
- Category chip typing does not white screen.
- Tech Info is not editable.
- Related Content is not interactive.
- Browse buttons are disabled.

---

## 8. Batch 4 — Static Image Detail + Image Form

### Scope

Implement:

- Image Detail page.
- Image Create page.
- Image Edit page.
- Static/local form state only.
- Category chip input visual/local state.
- Rating input visual/local state.
- Gallery grid placeholders.

### Image Form Rules

- Browse Cover disabled.
- Browse Folder disabled.
- Tech Info read-only placeholder.
- Related Performer read-only placeholder.
- Related Video read-only placeholder.
- No folder scanning.
- No native file picker.

### Do Not Touch

- No backend.
- No real save.
- No persistence.
- No relation picker.

### Acceptance Criteria

- Image detail matches visual baseline.
- Image form matches visual baseline.
- Typing in form does not crash.
- Category chip typing does not white screen.
- Tech Info is not editable.
- Related Content is not interactive.
- Browse buttons are disabled.

---

## 9. Batch 5 — Static Performer Detail + Performer Form

### Scope

Implement:

- Performer Detail page.
- Performer Create page.
- Performer Edit page.
- Static/local form state only.
- Aliases chip input visual/local state.
- Categories chip input visual/local state.
- Advanced performer fields visible as inactive/placeholder.

### Performer Rules

Do not simplify the visual performer form.

But advanced fields must be inactive/placeholder:

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

Rating can be visual/mock only:

- Attraction.
- Visual.
- Performance.
- Popularity.
- Exceptional.
- Versatility.

### Do Not Touch

- No backend.
- No real save.
- No persistence.
- No relation picker.
- No automatic filmography/pictorial count.

### Acceptance Criteria

- Performer collection/search text uses `Search performers...`.
- Performer detail matches visual baseline.
- Performer form matches visual baseline.
- Advanced fields are visible but inactive/placeholder.
- Advanced fields do not block form typing.
- Related Videos/Images are not interactive.
- No raw ID/UUID visible.

---

## 10. Batch 6 — Static UI Review

### Scope

Review all static frontend pages.

### Checklist

- App shell consistent.
- Sidebar active state correct.
- Bottom status bar visible.
- All routes render.
- `/new` routes do not render detail pages.
- Home matches visual baseline.
- Collection pages match visual baseline.
- Detail pages match visual baseline.
- Form pages match visual baseline.
- Settings matches visual baseline.
- Performer search placeholder correct.
- Images count label correct.
- Video rating term uses `Rewatch`.
- Tech Info read-only placeholder.
- Related Content read-only placeholder.
- Browse buttons disabled.
- No Tauri invoke.
- No SQLite.
- No native file picker.
- No relation picker.
- No broken image icon.
- No raw ID/UUID visible.

---

## 11. Verification Commands

Use project-specific commands if available.

Expected default:

```text
npm run test
npm run build
```

If tests are not configured yet, Codex must report that clearly and not pretend tests passed.

---

## 12. First Codex Task Prompt

Use this only after documentation review is complete.

```text
You are working on Sakurava, a local/offline Windows desktop catalog app.

Task:
Implement Frontend Static Batch 1: App Shell + Routing only.

This is FRONTEND STATIC ONLY.

Do not add:
- SQLite
- Tauri invoke
- Backend commands
- Persistence
- Native file picker
- CRUD
- Relation picker
- Advanced categories
- Backup/restore
- Scraping
- Media player
- Analytics

Approved app direction:
- App name: Sakurava
- React + TypeScript + Tailwind CSS
- Light mode first
- Sakura pink accent
- Apple-inspired flat minimal UI
- Left sidebar
- Top window bar placeholder
- Bottom status bar
- Rounded cards
- Subtle borders
- Clean spacing
- No broken image icons
- No raw ID / UUID visible in UI

Sidebar MVP:
- Home
- Videos
- Images
- Performers
- Settings

Routes to implement:
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

Critical route rule:
Static routes must be matched before dynamic routes.
The string "new" must never be treated as an id.

Scope:
1. Inspect current project state.
2. Give a short plan before editing.
3. List expected changed files before editing.
4. Implement AppShell layout.
5. Implement Sidebar navigation.
6. Implement TopWindowBar placeholder.
7. Implement BottomStatusBar placeholder.
8. Implement route stubs for all MVP routes.
9. Each route should show only page title, subtitle, and simple placeholder content for now.
10. Add active sidebar state based on current route.
11. Keep components small and easy to audit.

Acceptance criteria:
- App opens without backend.
- No Tauri invoke is used.
- No SQLite is used.
- Sidebar shows Home, Videos, Images, Performers, Settings.
- Bottom status bar is visible.
- All MVP routes render without crashing.
- /videos/new renders VideoCreatePage, not VideoDetailPage.
- /images/new renders ImageCreatePage, not ImageDetailPage.
- /performers/new renders PerformerCreatePage, not PerformerDetailPage.
- No raw ID or UUID is shown.
- No broken image icon is shown.
- Build/test commands pass.

Verification commands:
- npm run test
- npm run build

After finishing, report:
1. Files changed
2. Verification commands run
3. Test/build result
4. Manual check required
5. Remaining risks
```
