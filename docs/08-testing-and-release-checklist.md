# 08 — Testing and Release Checklist

## 1. Purpose

Dokumen ini dipakai setelah integration selesai.

Tujuan:

- Memastikan MVP benar-benar stabil.
- Mencegah bug lama muncul lagi.
- Memastikan app layak menjadi stable checkpoint.
- Memastikan deploy dilakukan tanpa menambah fitur baru.

## 2. Testing Only Rule

Pada fase testing:

Tidak boleh:

- Menambah fitur baru.
- Redesign.
- Mengubah schema besar.
- Menambah native file picker.
- Menambah relation picker.
- Menambah advanced categories.
- Menambah backup/scraping/media player.

Boleh:

- Bug fix kecil.
- Validation fix.
- Fallback fix.
- Route fix.
- Crash fix.

## 3. Test Environment

Minimal check di:

- Browser/dev mode.
- Tauri native dev mode.
- Tauri Windows build/installed app pada fase deploy.

## 4. Route Smoke Test

### Global

- [ ] `/` opens Home.
- [ ] `/settings` opens Settings.

### Videos

- [ ] `/videos` opens Video Collection.
- [ ] `/videos/new` opens Add Video.
- [ ] `/videos/:id` opens Video Detail.
- [ ] `/videos/:id/edit` opens Video Edit.
- [ ] `/videos/new` is not treated as `id="new"`.

### Images

- [ ] `/images` opens Image Collection.
- [ ] `/images/new` opens Add Image.
- [ ] `/images/:id` opens Image Detail.
- [ ] `/images/:id/edit` opens Image Edit.
- [ ] `/images/new` is not treated as `id="new"`.

### Performers

- [ ] `/performers` opens Performer Collection.
- [ ] `/performers/new` opens Add Performer.
- [ ] `/performers/:id` opens Performer Detail.
- [ ] `/performers/:id/edit` opens Performer Edit.
- [ ] `/performers/new` is not treated as `id="new"`.

## 5. Video CRUD Smoke Test

- [ ] Open `/videos`.
- [ ] Click Add Video.
- [ ] Try save with empty title.
- [ ] Required validation appears.
- [ ] Enter title.
- [ ] Enter Original Title.
- [ ] Enter code.
- [ ] Enter Censorship.
- [ ] Enter Availability.
- [ ] Enter Release Date.
- [ ] Enter Duration Minutes.
- [ ] Enter Publisher / Label.
- [ ] Enter Cover Path manually.
- [ ] Enter Media Path manually.
- [ ] Add category text.
- [ ] Remove category.
- [ ] Add category again.
- [ ] Toggle Favorite.
- [ ] Enter Notes.
- [ ] Save.
- [ ] Item appears in Video Collection.
- [ ] Open Video Detail.
- [ ] Confirm data displays correctly.
- [ ] Confirm no raw ID.
- [ ] Confirm no raw JSON.
- [ ] Confirm category appears as text label.
- [ ] Click Edit.
- [ ] Change title.
- [ ] Save.
- [ ] Reopen detail.
- [ ] Confirm edited data appears.
- [ ] Restart app.
- [ ] Confirm Video still exists.
- [ ] Confirm category still text label.
- [ ] Confirm Favorite persists.

## 6. Image CRUD Smoke Test

- [ ] Open `/images`.
- [ ] Click Add Image.
- [ ] Try save with empty title.
- [ ] Required validation appears.
- [ ] Enter title.
- [ ] Enter Original Title.
- [ ] Enter code.
- [ ] Enter Censorship.
- [ ] Enter Availability.
- [ ] Enter Release Date.
- [ ] Enter Publisher / Label.
- [ ] Enter Cover Path manually.
- [ ] Enter Folder Path manually.
- [ ] Enter Image Count.
- [ ] Add category text.
- [ ] Remove category.
- [ ] Add category again.
- [ ] Toggle Favorite.
- [ ] Enter Notes.
- [ ] Save.
- [ ] Item appears in Image Collection.
- [ ] Open Image Detail.
- [ ] Confirm data displays correctly.
- [ ] Confirm no raw ID.
- [ ] Confirm no raw JSON.
- [ ] Confirm category appears as text label.
- [ ] Click Edit.
- [ ] Change title.
- [ ] Save.
- [ ] Reopen detail.
- [ ] Confirm edited data appears.
- [ ] Restart app.
- [ ] Confirm Image still exists.
- [ ] Confirm category still text label.
- [ ] Confirm Favorite persists.

## 7. Performer CRUD Smoke Test

- [ ] Open `/performers`.
- [ ] Click Add Performer.
- [ ] Try save with empty name.
- [ ] Required validation appears.
- [ ] Enter name.
- [ ] Enter Original Name.
- [ ] Add alias.
- [ ] Remove alias.
- [ ] Add alias again.
- [ ] Enter Status.
- [ ] Enter Birth Date.
- [ ] Enter Cover Path manually.
- [ ] Enter Filmography Count.
- [ ] Enter Pictorials Count.
- [ ] Add category text.
- [ ] Remove category.
- [ ] Add category again.
- [ ] Toggle Favorite.
- [ ] Enter Notes.
- [ ] Save.
- [ ] Item appears in Performer Collection.
- [ ] Open Performer Detail.
- [ ] Confirm data displays correctly.
- [ ] Confirm no raw ID.
- [ ] Confirm no raw JSON.
- [ ] Confirm aliases appear as text labels.
- [ ] Confirm categories appear as text labels.
- [ ] Click Edit.
- [ ] Change name.
- [ ] Save.
- [ ] Reopen detail.
- [ ] Confirm edited data appears.
- [ ] Restart app.
- [ ] Confirm Performer still exists.
- [ ] Confirm aliases still text labels.
- [ ] Confirm categories still text labels.
- [ ] Confirm Favorite persists.

## 8. Browser Mode Safety Test

- [ ] Start frontend dev server.
- [ ] Open app in browser.
- [ ] Confirm app does not crash.
- [ ] Confirm no `Cannot read properties of undefined (reading 'invoke')`.
- [ ] Confirm database-dependent UI shows safe state if native API is unavailable.
- [ ] Confirm routes can be opened.

## 9. Native Tauri Mode Test

- [ ] Run Tauri dev mode.
- [ ] Confirm app opens.
- [ ] Confirm database is available.
- [ ] Confirm no `Database unavailable`.
- [ ] Run Video CRUD smoke test.
- [ ] Run Image CRUD smoke test.
- [ ] Run Performer CRUD smoke test.
- [ ] Restart native app.
- [ ] Confirm data persists.

## 10. Broken Image Fallback Test

For each entity:

- [ ] Create item with empty coverPath.
- [ ] Confirm collection uses placeholder.
- [ ] Confirm detail uses placeholder.
- [ ] Confirm edit form uses placeholder.
- [ ] Enter invalid path.
- [ ] Confirm no broken image icon appears.

## 11. Categories JSON Test

For Videos, Images, Performers:

- [ ] Add category `Sample`.
- [ ] Save.
- [ ] Reopen detail.
- [ ] Confirm category shows as `Sample`.
- [ ] Reopen edit form.
- [ ] Confirm category chip/input shows `Sample`.
- [ ] Confirm category is not UUID.
- [ ] Confirm category is not raw JSON.
- [ ] Remove category.
- [ ] Save.
- [ ] Confirm removed category stays removed.

## 12. Favorite Test

For Videos, Images, Performers:

- [ ] Turn Favorite on.
- [ ] Save.
- [ ] Reopen detail.
- [ ] Confirm Favorite on.
- [ ] Restart app.
- [ ] Confirm Favorite still on.
- [ ] Turn Favorite off.
- [ ] Save.
- [ ] Confirm Favorite off.

## 13. Build/Test Commands

Recommended:

```text
npm run test
npm run build
```

If Tauri build is ready:

```text
npm run tauri build
```

If sandbox build hits known Vite/esbuild limitation, verify build outside sandbox and document the result.

## 14. Release/Deploy Only Rule

Deploy phase must not add features.

Allowed:

- Packaging.
- Installer generation.
- Installed app smoke test.
- Database location check.
- Shortcut/app launch check.

Not allowed:

- New UI features.
- New database fields unless critical bug.
- New category manager.
- Native picker.
- Backup/restore.
- Scraping.

## 15. Installed App Smoke Test

After installing Windows build:

- [ ] App launches.
- [ ] Home opens.
- [ ] Sidebar works.
- [ ] Database file is created/loaded.
- [ ] Add Video works.
- [ ] Add Image works.
- [ ] Add Performer works.
- [ ] Restart installed app.
- [ ] Data persists.
- [ ] No database unavailable error.
- [ ] No raw ID/UUID visible.
- [ ] No broken image icon.

## 16. Stable Checkpoint Criteria

Only create stable checkpoint/tag if:

- [ ] All MVP route tests pass.
- [ ] Video CRUD pass.
- [ ] Image CRUD pass.
- [ ] Performer CRUD pass.
- [ ] Restart persistence pass.
- [ ] Browser mode safe.
- [ ] Native mode safe.
- [ ] Installed app smoke test pass.
- [ ] Known critical bugs fixed.
- [ ] No post-MVP feature was added.

Recommended tag:

```text
v0.1.0-mvp-stable
```

## 17. Bug Handling Rule

If a bug appears:

1. Stop next feature work.
2. Record bug.
3. Identify affected phase.
4. Fix in the smallest possible scope.
5. Re-run the related smoke test.
6. Only continue after pass.

Do not hide known MVP bugs inside a new checkpoint.
