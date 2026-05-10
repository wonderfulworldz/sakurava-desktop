# Sakurava — Visual Mockup Prompt Pack

## 1. Purpose

Dokumen ini berisi prompt visual mockup untuk membuat gambar UI Sakurava sebelum masuk frontend implementation.

Dokumen ini mengikuti:

- `01-clean-planning.md`
- `02-mvp-prd.md`
- `03a-mvp-form-specification.md`
- `03-ui-wireframe-revised.md`
- `04-visual-design-guide.md`

Dokumen ini masih berada di fase:

```text
Phase 2B — Visual UI Mockup Image
```

Tidak ada coding, React implementation, Tauri integration, SQLite schema, atau Codex task di dokumen ini.

---

## 2. Global Visual Direction

Gunakan gaya visual berikut untuk semua mockup:

```text
Flat minimal desktop app UI.
Apple-inspired spacing and hierarchy.
Light mode first.
Soft Sakura accent.
Clean white and off-white background.
Compact but readable cards.
Rounded corners.
Subtle borders.
No heavy shadows.
No dark theme.
No complex dashboard.
No adult-explicit imagery.
Use neutral placeholder images and placeholder text.
```

---

## 3. Global UI Rules

### 3.1 Must Include

- App Shell with sidebar.
- Sidebar items:
  - Home
  - Videos
  - Images
  - Performers
  - Settings
- Clean page header.
- Main content area.
- Placeholder image fallback.
- Sakura accent used sparingly.
- Clear Save / Cancel actions for forms.
- Disabled Browse buttons in forms.
- Read-only placeholder sections for Tech Info and Related Content.

### 3.2 Must Not Include

- No native file picker interaction.
- No active relation picker.
- No scraping.
- No backup/restore.
- No media player.
- No advanced analytics.
- No raw UUID or internal ID.
- No broken image icon.
- No explicit content.
- No online/source website branding.
- No dark mode for MVP mockup.

### 3.3 Placeholder Rules

Use neutral placeholder labels:

```text
Sample Video Title
Sample Image Title
Sample Performer Name
Original Title Placeholder
Original Name Placeholder
CODE-001
Category A
Category B
```

Use neutral placeholder image blocks, not real photos.

---

## 4. Recommended Visual Mockup Order

Do not create all visual mockups at once.

Recommended order:

```text
1. Video Add/Edit Form
2. Video Detail
3. Video Collection
4. Image Add/Edit Form
5. Image Detail
6. Image Collection
7. Performer Add/Edit Form
8. Performer Detail
9. Performer Collection
10. App Shell
11. Home
12. Settings Minimal
```

Reason:

- Video Form is the most complex.
- If Video Form is approved, Image and Performer forms can reuse the same pattern.
- Detail and Collection pages can follow after form field structure is visually understood.

---

## 5. Master Prompt Template

Use this template for every mockup request.

```text
Create a clean visual UI mockup image for Sakurava, a local offline desktop catalog app.

Style:
- Flat minimal
- Apple-inspired
- Light mode first
- Soft Sakura accent
- Clean spacing
- Compact cards
- Rounded corners
- Subtle borders
- No heavy shadows
- No dark mode
- No explicit imagery
- Use neutral placeholder images and placeholder text

Layout:
- Desktop app screen
- Left sidebar with: Home, Videos, Images, Performers, Settings
- Main content area
- Clear page header
- Consistent spacing and typography

Rules:
- Do not show raw ID or UUID
- Do not show broken image icons
- Use placeholder image blocks
- Do not add post-MVP features
- Browse buttons must appear disabled if shown
- Tech Info must appear as read-only placeholder
- Related Content must appear as read-only placeholder
- Do not show active native file picker
- Do not show active relation picker
- Do not show scraping, backup, media player, or analytics

Use the exact page content described below:
[PASTE PAGE-SPECIFIC CONTENT HERE]
```

---

## 6. Video Add/Edit Form Mockup Prompt

```text
Create a clean visual UI mockup image for Sakurava — Video Add/Edit Form.

Style:
- Flat minimal desktop app UI
- Apple-inspired spacing
- Light mode first
- Soft Sakura accent
- Clean white/off-white background
- Compact form sections
- Rounded cards
- Subtle borders
- No heavy shadows
- No explicit imagery
- Neutral placeholder image blocks and placeholder text

App shell:
- Left sidebar: Home, Videos, Images, Performers, Settings
- Main content page title: Add Video
- Subtitle: Create or edit a local video catalog item

Form layout:
- Single scroll form
- Do not use tabs
- Save and Cancel actions should be visible near top or sticky bottom
- Form sections should be visually grouped but not overwhelming

Sections and fields:

1. Basic Identity
- Title * — text input
- Original Title — text input
- Code — text input
- Favorite — checkbox/toggle

2. Quick Classification
- Availability — select with placeholder Owned
- Censorship — select with placeholder Censored
- Categories — tag/chip input with chips: Category A, Category B

3. Cover & File Path
- Cover Path — text input
- Browse Cover — disabled button
- Media Path — text input
- Browse Media — disabled button

4. Release Metadata
- Release Date — date input
- Duration — number input, minutes
- Publisher / Label — text input

5. Tech Info — read-only placeholder
- Resolution: Not detected yet
- File Size: Not detected yet
- Codec: Not detected yet
- Bitrate: Not detected yet
- Frame Rate: Not detected yet

6. Rating
- Rewatch — slider or segmented 1–5 control
- Performance — slider or segmented 1–5 control
- Visual — slider or segmented 1–5 control
- Intensity — slider or segmented 1–5 control
- Story — slider or segmented 1–5 control
- Chemistry — slider or segmented 1–5 control

7. Notes
- Notes — textarea

8. Related Content — read-only placeholder
- Related Images: Available after relation features are added
- Related Performer: Available after relation features are added

Important:
- Do not show active file picker
- Do not show active relation picker
- Do not show raw ID or UUID
- Do not show broken image icon
- Do not add extra features
```

---

## 7. Video Detail Mockup Prompt

```text
Create a clean visual UI mockup image for Sakurava — Video Detail page.

Style:
- Flat minimal
- Apple-inspired
- Light mode first
- Soft Sakura accent
- Compact cards
- Rounded corners
- Subtle borders
- Neutral placeholder image blocks
- No explicit imagery

App shell:
- Left sidebar: Home, Videos, Images, Performers, Settings
- Main content page title: Video Detail
- Header actions: Back to Videos, Edit

Hero / Main Info:
- Large cover placeholder/fallback
- Sample Video Title
- Original Title Placeholder
- CODE-001
- Favorite indicator
- Availability: Owned
- Censorship: Censored
- Categories: Category A, Category B

Metadata card:
- Release Date
- Duration
- Publisher / Label
- Cover Path
- Media Path

Rating summary:
- Show compact rating breakdown
- Rewatch
- Performance
- Visual
- Intensity
- Story
- Chemistry
- Optional spider chart placeholder is allowed only on detail page

Tech Info read-only placeholder:
- Resolution: Not detected yet
- File Size: Not detected yet
- Codec: Not detected yet
- Bitrate: Not detected yet
- Frame Rate: Not detected yet

Notes:
- Notes placeholder text

Related Content read-only placeholder:
- Related Images: Available after relation features are added
- Related Performer: Available after relation features are added

Important:
- Do not show playable media player
- Do not show raw ID or UUID
- Do not show broken image icon
- Do not add scraping, backup, or analytics
```

---

## 8. Video Collection Mockup Prompt

```text
Create a clean visual UI mockup image for Sakurava — Video Collection page.

Style:
- Flat minimal desktop app
- Apple-inspired
- Light mode first
- Soft Sakura accent
- Compact cards
- Rounded corners
- Subtle borders
- Neutral placeholder images

App shell:
- Left sidebar: Home, Videos, Images, Performers, Settings
- Main content page title: Videos
- Subtitle: Manage your local video catalog

Top action row:
- Search input
- Availability filter
- Sort select
- Add Video button

Optional view controls:
- Card view / Table view toggle placeholder

Content:
- Responsive card grid
- Each card has:
  - Cover placeholder/fallback
  - Sample Video Title
  - CODE-001
  - Availability chip
  - Censorship chip
  - Category chips
  - Favorite indicator

Empty state should be visually planned but not dominant:
- No videos yet
- Add Video button

Important:
- Do not show internal ID
- Do not show UUID
- Do not show broken image icon
- Do not add media player
- Do not add advanced analytics
```

---

## 9. Image Add/Edit Form Mockup Prompt

```text
Create a clean visual UI mockup image for Sakurava — Image Add/Edit Form.

Style:
- Flat minimal
- Apple-inspired
- Light mode first
- Soft Sakura accent
- Clean spacing
- Compact form sections
- Rounded cards
- Subtle borders
- Neutral placeholder image blocks
- No explicit imagery

App shell:
- Left sidebar: Home, Videos, Images, Performers, Settings
- Main content page title: Add Image
- Subtitle: Create or edit a local image catalog item

Form layout:
- Single scroll form
- Do not use tabs
- Save and Cancel actions visible

Sections and fields:

1. Basic Identity
- Title * — text input
- Original Title — text input
- Code — text input
- Favorite — checkbox/toggle

2. Quick Classification
- Availability — select with placeholder Owned
- Censorship — select with placeholder Censored
- Categories — tag/chip input with chips: Category A, Category B

3. Cover & Folder Path
- Cover Path — text input
- Browse Cover — disabled button
- Folder Path — text input
- Browse Folder — disabled button

4. Release Metadata
- Release Date — date input
- Image Count — number input
- Publisher / Label — text input

5. Tech Info — read-only placeholder
- Folder Size: Folder analysis is not available in MVP
- Detected Image Count: Folder analysis is not available in MVP
- Main Resolution: Folder analysis is not available in MVP
- File Types: Folder analysis is not available in MVP

6. Rating
- Memorability — slider or segmented 1–5 control
- Visual — slider or segmented 1–5 control
- Posing — slider or segmented 1–5 control
- Atmosphere — slider or segmented 1–5 control
- Flow — slider or segmented 1–5 control
- Signature — slider or segmented 1–5 control

7. Notes
- Notes — textarea

8. Related Content — read-only placeholder
- Related Video: Available after relation features are added
- Related Performer: Available after relation features are added

Important:
- Do not show active folder picker
- Do not show active relation picker
- Do not show raw ID or UUID
- Do not show broken image icon
```

---

## 10. Image Detail Mockup Prompt

```text
Create a clean visual UI mockup image for Sakurava — Image Detail page.

Style:
- Flat minimal
- Apple-inspired
- Light mode first
- Soft Sakura accent
- Compact cards
- Rounded corners
- Subtle borders
- Neutral placeholder image blocks

App shell:
- Left sidebar: Home, Videos, Images, Performers, Settings
- Main content page title: Image Detail
- Header actions: Back to Images, Edit

Hero / Main Info:
- Large cover placeholder/fallback
- Sample Image Title
- Original Title Placeholder
- CODE-001
- Favorite indicator
- Availability: Owned
- Censorship: Censored
- Categories: Category A, Category B

Metadata card:
- Release Date
- Image Count
- Publisher / Label
- Cover Path
- Folder Path

Rating summary:
- Memorability
- Visual
- Posing
- Atmosphere
- Flow
- Signature
- Optional spider chart placeholder is allowed only on detail page

Tech Info read-only placeholder:
- Folder Size: Folder analysis is not available in MVP
- Detected Image Count: Folder analysis is not available in MVP
- Main Resolution: Folder analysis is not available in MVP
- File Types: Folder analysis is not available in MVP

Notes:
- Notes placeholder text

Related Content read-only placeholder:
- Related Video: Available after relation features are added
- Related Performer: Available after relation features are added

Important:
- Do not show active folder scan
- Do not show raw ID or UUID
- Do not show broken image icon
```

---

## 11. Image Collection Mockup Prompt

```text
Create a clean visual UI mockup image for Sakurava — Image Collection page.

Style:
- Flat minimal desktop app
- Apple-inspired
- Light mode first
- Soft Sakura accent
- Compact cards
- Rounded corners
- Subtle borders
- Neutral placeholder images

App shell:
- Left sidebar: Home, Videos, Images, Performers, Settings
- Main content page title: Images
- Subtitle: Manage your local image catalog

Top action row:
- Search input
- Availability filter
- Sort select
- Add Image button

Optional view controls:
- Card view / Table view toggle placeholder

Content:
- Responsive card grid
- Each card has:
  - Cover placeholder/fallback
  - Sample Image Title
  - CODE-001
  - Image Count
  - Availability chip
  - Censorship chip
  - Category chips
  - Favorite indicator

Empty state:
- No images yet
- Add Image button

Important:
- Do not show internal ID
- Do not show UUID
- Do not show broken image icon
- Do not add folder scanner
- Do not add advanced analytics
```

---

## 12. Performer Add/Edit Form Mockup Prompt

```text
Create a clean visual UI mockup image for Sakurava — Performer Add/Edit Form.

Style:
- Flat minimal
- Apple-inspired
- Light mode first
- Soft Sakura accent
- Clean spacing
- Compact form sections
- Rounded cards
- Subtle borders
- Neutral placeholder image blocks
- No explicit imagery

App shell:
- Left sidebar: Home, Videos, Images, Performers, Settings
- Main content page title: Add Performer
- Subtitle: Create or edit a performer profile

Form layout:
- Single scroll form
- Do not use tabs
- Save and Cancel actions visible

Sections and fields:

1. Basic Identity
- Name * — text input
- Original Name — text input
- Aliases — tag/chip input with chips: Alias A, Alias B
- Favorite — checkbox/toggle

2. Status & Classification
- Status — select with placeholder Active
- Categories — tag/chip input with chips: Category A, Category B

3. Profile Image
- Cover Path — text input
- Browse Cover — disabled button

4. Personal & Catalog Metadata
- Birth Date — date input
- Filmography Count — read-only placeholder
- Pictorials Count — read-only placeholder

5. Tech Info — read-only placeholder
- Linked Videos Count: Not available in MVP
- Linked Images Count: Not available in MVP
- Last Updated: System generated later

6. Rating
- Visual — slider or segmented 1–5 control
- Performance — slider or segmented 1–5 control
- Presence — slider or segmented 1–5 control

7. Notes
- Notes — textarea

8. Related Content — read-only placeholder
- Related Video: Available after relation features are added
- Related Images: Available after relation features are added

Important:
- Do not show active relation picker
- Do not show raw ID or UUID
- Do not show broken image icon
```

---

## 13. Performer Detail Mockup Prompt

```text
Create a clean visual UI mockup image for Sakurava — Performer Detail page.

Style:
- Flat minimal
- Apple-inspired
- Light mode first
- Soft Sakura accent
- Compact cards
- Rounded corners
- Subtle borders
- Neutral placeholder image blocks

App shell:
- Left sidebar: Home, Videos, Images, Performers, Settings
- Main content page title: Performer Detail
- Header actions: Back to Performers, Edit

Hero / Main Info:
- Large profile cover placeholder/fallback
- Sample Performer Name
- Original Name Placeholder
- Aliases: Alias A, Alias B
- Favorite indicator
- Status: Active
- Categories: Category A, Category B

Personal & Catalog Metadata:
- Birth Date
- Filmography Count: 0 / placeholder
- Pictorials Count: 0 / placeholder

Rating summary:
- Visual
- Performance
- Presence
- Optional spider chart placeholder is allowed only on detail page

Tech Info read-only placeholder:
- Linked Videos Count: Not available in MVP
- Linked Images Count: Not available in MVP
- Last Updated: from updatedAt

Notes:
- Notes placeholder text

Related Content read-only placeholder:
- Related Video: Available after relation features are added
- Related Images: Available after relation features are added

Important:
- Do not show active relation picker
- Do not show raw ID or UUID
- Do not show broken image icon
```

---

## 14. Performer Collection Mockup Prompt

```text
Create a clean visual UI mockup image for Sakurava — Performer Collection page.

Style:
- Flat minimal desktop app
- Apple-inspired
- Light mode first
- Soft Sakura accent
- Compact cards
- Rounded corners
- Subtle borders
- Neutral placeholder images

App shell:
- Left sidebar: Home, Videos, Images, Performers, Settings
- Main content page title: Performers
- Subtitle: Manage performer profiles

Top action row:
- Search input
- Status filter
- Sort select
- Add Performer button

Optional view controls:
- Card view / Table view toggle placeholder

Content:
- Responsive card grid
- Each card has:
  - Profile image placeholder/fallback
  - Sample Performer Name
  - Original Name Placeholder
  - Status chip
  - Category chips
  - Favorite indicator

Empty state:
- No performers yet
- Add Performer button

Important:
- Do not show internal ID
- Do not show UUID
- Do not show broken image icon
- Do not add relation analytics
```

---

## 15. App Shell Mockup Prompt

```text
Create a clean visual UI mockup image for Sakurava — App Shell.

Style:
- Flat minimal desktop app
- Apple-inspired
- Light mode first
- Soft Sakura accent
- Clean white/off-white background
- Rounded panels
- Subtle borders
- No heavy shadows

Layout:
- Left sidebar
- Main content area
- Top page header
- Optional compact bottom status area

Sidebar:
- App name: Sakurava
- Home
- Videos
- Images
- Performers
- Settings

Main content placeholder:
- Page title area
- Content card area
- Empty state/card placeholders

Important:
- Do not add advanced technical pages
- Do not add backup, scraping, media player, analytics
- Do not show debug logs
```

---

## 16. Home Mockup Prompt

```text
Create a clean visual UI mockup image for Sakurava — Home page.

Style:
- Flat minimal
- Apple-inspired
- Light mode first
- Soft Sakura accent
- Compact summary cards
- Rounded corners
- Subtle borders

App shell:
- Left sidebar: Home, Videos, Images, Performers, Settings
- Main content page title: Home
- Subtitle: Local private catalog for Videos, Images, and Performers

Content:
- Summary card: Videos, total placeholder
- Summary card: Images, total placeholder
- Summary card: Performers, total placeholder

Quick Actions:
- Add Video
- Add Image
- Add Performer

Recent Activity Placeholder:
- Recent Videos placeholder
- Recent Images placeholder
- Recent Performers placeholder

Important:
- Do not create complex dashboard
- Do not add analytics charts
- Do not add file scanner
```

---

## 17. Settings Minimal Mockup Prompt

```text
Create a clean visual UI mockup image for Sakurava — Settings Minimal page.

Style:
- Flat minimal
- Apple-inspired
- Light mode first
- Soft Sakura accent
- Compact settings cards
- Rounded corners
- Subtle borders

App shell:
- Left sidebar: Home, Videos, Images, Performers, Settings
- Main content page title: Settings
- Subtitle: Minimal local app settings

Sections:

1. App Info
- App Name: Sakurava
- Version: Placeholder
- Mode: Local / Offline

2. Storage Info
- Database file: sakurava.sqlite
- App data folder: app.sakurava.desktop
- Database status: Placeholder

3. Future Settings — Disabled
- Backup / Restore disabled
- Native file picker disabled
- Advanced categories disabled

Important:
- Do not implement advanced settings
- Do not show technical logs
- Do not show active backup/restore
- Do not show active native file picker
```

---

## 18. Visual Review Checklist

Use this checklist after each mockup image.

```text
[ ] Sidebar contains only Home, Videos, Images, Performers, Settings.
[ ] Page title is clear.
[ ] Layout is light mode.
[ ] Sakura accent is subtle.
[ ] Cards are compact and readable.
[ ] No explicit imagery.
[ ] Placeholder image is used.
[ ] No broken image icon.
[ ] No raw ID.
[ ] No UUID.
[ ] No post-MVP features appear active.
[ ] Browse buttons are disabled.
[ ] Related Content is read-only placeholder.
[ ] Tech Info is read-only placeholder.
[ ] Form uses single scroll, not tabs.
[ ] Save and Cancel are visible on form.
[ ] Rating form uses slider/number/segmented control, not spider chart.
[ ] Detail page may show spider chart placeholder.
```

---

## 19. Approval Rule

Do not move to frontend static implementation until these are approved:

```text
[ ] Video Form visual mockup
[ ] Video Detail visual mockup
[ ] Video Collection visual mockup
[ ] Image Form visual mockup
[ ] Image Detail visual mockup
[ ] Image Collection visual mockup
[ ] Performer Form visual mockup
[ ] Performer Detail visual mockup
[ ] Performer Collection visual mockup
[ ] App Shell visual mockup
[ ] Home visual mockup
[ ] Settings Minimal visual mockup
```

If this is too many images, approve only these first:

```text
[ ] App Shell
[ ] Video Form
[ ] Video Detail
[ ] Video Collection
```

Then reuse pattern for Image and Performer.

---

## 20. Next Step

Recommended next step:

```text
Create the first visual mockup image: Video Add/Edit Form.
```

Do not use Codex yet.
