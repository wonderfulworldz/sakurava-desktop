# 33 - Form Field UX V1 Planning

## 1. Purpose

Batch 28.1 mendefinisikan rencana Form Field UX V1 sebelum implementasi.

Dokumen ini adalah planning-only. Tidak ada implementasi UI, source code, runtime, database, schema, Tauri config, package config, test, atau perubahan behavior save dari batch ini.

Form Field UX V1 mencakup:

- Video Create Form
- Video Edit Form
- Image Create Form
- Image Edit Form
- Performer Create Form
- Performer Edit Form

Implementasi dimulai hanya setelah planning ini disetujui.

## 2. Context

Latest completed checkpoint sebelum batch ini:

```text
post-mvp-27-8-image-detail-gallery-placement-adjustment-v1
```

Detail Page V1 sudah complete sampai Batch 27.8. Form Field UX V1 harus mendekatkan struktur form ke arah Detail Page V1 tanpa mengubah model data, persistence, storage kategori, storage related, storage rating, storage gallery, atau behavior save yang sudah ada.

Batch 28.1 hanya merencanakan arah form. Category Picker, Related Picker, Video/Image form cleanup, Performer form data completion, validasi, dan smoke test harus dipisah ke batch berikutnya.

## 3. Form UX V1 Principles

- Form harus lebih clean, sederhana, predictable, dan tidak terasa placeholder/MVP.
- Form harus functional-first, bukan overly visual.
- Gunakan single-column atau simple structured layout jika itu lebih aman untuk form create/edit.
- Hindari large decorative cards dan visual polish berlebihan.
- Label harus jelas, konsisten, dan user-facing.
- Required vs optional harus terlihat melalui label atau helper ringkas, bukan copy panjang.
- Helper text hanya dipakai ketika mencegah salah input atau menjelaskan storage/behavior yang tidak obvious.
- Section grouping harus mengikuti alur pengisian data, bukan sekadar meniru Detail secara visual.
- Keyboard-friendly input flow harus dipertahankan.
- Save, cancel, dan delete behavior harus tetap aman.
- Gunakan existing form data model kecuali batch masa depan secara eksplisit mengubahnya.
- Validasi harus jujur dan minimal.
- Jangan expose raw IDs, UUIDs, raw JSON, atau implementation detail yang tidak perlu.
- Raw file paths boleh tetap editable jika current workflow membutuhkannya, tetapi harus dipresentasikan sebagai path field yang jelas dan aman.
- Jangan fake automation yang belum tersedia.

## 4. Shared Form Section Rules

Shared section rules:

- Section utama memakai heading singkat dan familiar.
- Field yang paling sering dibutuhkan ditempatkan lebih awal.
- Field teknis atau jarang diedit ditempatkan lebih bawah.
- Related dan Categories tetap terlihat sebagai data catalog penting, tetapi tidak boleh mengubah storage semantics.
- Notes ditempatkan dekat akhir agar tidak mengganggu field utama.
- System / Save actions ditempatkan terakhir dan tidak mencampur destructive action dengan create flow.
- Create form harus lebih fokus pada first save yang aman.
- Edit form boleh menampilkan field lebih lengkap, tetapi tetap tidak menampilkan raw JSON.
- Field order boleh sedikit disesuaikan saat implementasi jika struktur current component membutuhkan path yang lebih aman, tetapi alasan perubahan harus dicatat di implementation summary.

## 5. Video Form Plan

Recommended section order:

1. Basic Identity
2. Media / File Fields
3. Metadata
4. Categories
5. Rating
6. Related Performers / Related Images
7. Notes
8. System / Save actions

Basic Identity:

- Title sebagai field utama.
- Original Title jika tersedia.
- Code jika current model mendukungnya.
- Favorite/status field boleh tetap berada dekat identity jika current form sudah mendukung dan tidak mengganggu flow.

Media / File Fields:

- Cover path dan Media path dipisahkan dengan label yang jelas.
- Native file picker harus tetap explicit.
- Manual path typing boleh tetap tersedia jika sudah didukung.
- Jangan copy, import, move, rename, delete, atau generate thumbnail dari form.

Metadata:

- Keep release date/year jika current model mendukung.
- Keep duration jika masih manually stored.
- Keep availability/owned/censorship jika current model mendukung.
- Keep publisher/label jika current model mendukung.
- Jangan fake resolution, file size, file type, atau Quality.

Categories:

- Target V1 adalah controlled picker/chip input berbasis Managed Categories.
- Storage tetap `categoriesJson` sebagai label text per record.

Rating:

- Input tetap sederhana.
- Values harus berada dalam range valid 1 sampai 5 jika current form memakai number rating.
- Storage tetap `ratingJson`.

Related:

- Related Performers dan Related Images harus memakai picker/search existing records pada Batch 28.3.
- Tidak menampilkan raw IDs atau raw JSON.
- Tidak auto-link balik ke record lain.

Notes:

- Notes tetap plain user note.
- Jangan memakai notes untuk menyimpan metadata teknis tersembunyi.

System / Save actions:

- Save/cancel mengikuti behavior existing.
- Delete hanya relevan di Edit Form dan harus tetap destructive-safe.

## 6. Image Form Plan

Recommended section order:

1. Basic Identity
2. Cover / Gallery Fields
3. Metadata
4. Categories
5. Rating
6. Related Performers / Related Videos
7. Notes
8. System / Save actions

Basic Identity:

- Title sebagai field utama.
- Original Title jika tersedia.
- Code jika current model mendukungnya.
- Favorite/status field boleh tetap dekat identity jika sudah ada.

Cover / Gallery Fields:

- Cover path dipisahkan dari gallery fields.
- Gallery fields tetap memakai saved explicit paths dari `galleryImagePathsJson`.
- Folder path tetap metadata/reference jika current form masih mendukungnya.
- Folder reading hanya setelah explicit user action.
- Jangan scan folder dari Detail.
- Jangan recursive scan, watcher, atau live sync.

Metadata:

- Keep release date/year jika current model mendukung.
- Keep image/gallery count hanya jika safe dan data-backed.
- Keep availability/owned/censorship jika current model mendukung.
- Jangan fake resolution, file size, file type, atau Quality.

Categories:

- Sama seperti Video Form: picker berbasis Managed Categories, storage tetap `categoriesJson`.

Rating:

- Input sederhana, range valid 1 sampai 5 jika numeric.
- Storage tetap `ratingJson`.

Related:

- Related Performers dan Related Videos memakai picker/search existing records pada Batch 28.3.
- Tidak auto-create dan tidak mutate related records.

Notes:

- Notes tetap user-facing.

System / Save actions:

- Save/cancel mengikuti behavior existing.
- Delete hanya di Edit Form.

## 7. Performer Form Plan

Recommended section order:

1. Basic Identity
2. Profile / Thumbnail Fields
3. Status / Activity
4. Aliases
5. Personal
6. Physical
7. Categories
8. Rating
9. Related Videos / Related Images
10. Notes
11. System / Save actions

Basic Identity:

- Name sebagai field utama.
- Original Name jika tersedia.
- Favorite/status field boleh tetap dekat identity jika current form mendukung.

Profile / Thumbnail Fields:

- Profile/cover path memakai label jelas.
- Detail/mini thumbnail paths hanya tampil jika current model sudah mendukung.
- Naming boleh diarahkan ke Detail Thumbnail jika relevan, tetapi jangan mengubah storage dari planning batch ini.
- Jangan fake thumbnail availability.
- Jangan scan folder atau generate thumbnails.

Status / Activity:

- Keep active/retired status jika supported.
- Keep Active Years source fields jika current form mendukung.
- Jangan menghitung Debut Date / Retired Date dari Birth Date.

Aliases:

- Aliases harus tetap mudah diedit dan tidak terasa raw JSON.
- Jika current storage masih JSON/list, UI V1 harus menyembunyikan raw JSON.

Personal:

- Align dengan Detail Page V1 jika current storage mendukung.
- Jangan menambahkan field personal baru tanpa data/storage readiness.

Physical:

- Align dengan Detail Page V1 jika current storage mendukung.
- Hindari field placeholder yang tidak tersimpan.

Categories:

- Picker berbasis Managed Categories.
- Storage tetap `categoriesJson`.

Rating:

- Input sederhana dan valid.
- Storage tetap `ratingJson`.

Related:

- Related Videos / Related Images memakai picker/search existing records pada Batch 28.3 jika storage existing/helper sudah cukup.
- Filmography/Pictorials hanya boleh dihitung dari related records dalam batch aman berikutnya, bukan difake.

Notes:

- Notes tetap plain user note.

System / Save actions:

- Save/cancel mengikuti behavior existing.
- Delete hanya di Edit Form.

## 8. Category Picker Field Plan

Category Picker V1 target:

- Category field menjadi controlled picker/chip input berbasis Managed Categories.
- User memilih existing Managed Categories.
- Selected categories tampil sebagai chips.
- Duplicate category dalam satu record dicegah.
- Tidak expose raw JSON.
- Jika category tidak ada, form mengarahkan user ke Category Management, bukan silently create category.
- Inline create category tetap out of scope untuk V1.

Storage rules:

- Preserve `categoriesJson` sebagai record-level text labels.
- Jangan menambahkan `categoryIds`.
- Jangan menambahkan relational category table.
- Jangan menambahkan parent/child categories.
- Jangan menambahkan category thumbnails.
- Jangan mengubah Managed Category storage.
- Form picker tidak boleh mutate Managed Categories.
- Managed Categories tidak boleh otomatis diterapkan ke existing records.

Recommended implementation batch:

```text
28.2 - Category Picker Field Redesign
```

## 9. Related Picker Field Plan

Related Picker V1 target:

- Related Performer picker.
- Related Video picker.
- Related Image picker.
- Search/select existing records.
- Selected related items tampil sebagai compact cards/chips.
- Remove selected related item harus aman dan local ke current form.
- Tidak menampilkan raw IDs.
- Missing related item ditangani dengan state aman.
- Tidak ada relation picker implementation di Batch 28.1.

Storage rules:

- Preserve current related JSON storage kecuali future batch secara eksplisit mengubahnya.
- Jangan implement storage redesign dalam 28.1.
- Jangan menambahkan relation table.
- Jangan auto-create related records.
- Jangan auto-link balik atau mutate unrelated records silently.
- Edit form harus preserve unrelated fields.

Recommended implementation batch:

```text
28.3 - Related Picker Field Redesign
```

## 10. File Picker Field Plan

Shared rules:

- Native file/folder picker behavior harus tetap explicit.
- Manual path typing boleh tetap tersedia jika already supported.
- Path field harus jelas: cover/profile/media/gallery/folder, bukan raw internal field dump.
- Jangan copy/import/move/delete/rename user files.
- Jangan generate thumbnails.
- Jangan add watcher.
- Jangan recursive scan.
- Jangan ubah media root handling dari Form UX batch.

Video:

- Cover path.
- Media path.
- Keduanya harus dipisahkan dengan label yang jelas.

Image:

- Cover path.
- Gallery folder atau gallery image paths mengikuti current implemented flow.
- Preserve saved explicit gallery paths.
- Folder reading hanya setelah explicit user action.
- Detail page tetap tidak scan folder.

Performer:

- Profile/cover path.
- Detail/mini thumbnail paths jika current model supports them.
- Jangan fake thumbnail fields jika model belum siap.

## 11. Image Gallery Form Field Plan

Current source of truth:

```text
galleryImagePathsJson
```

Rules:

- `galleryImagePathsJson` menyimpan explicit saved image paths.
- Gallery tidak live-linked ke folder.
- Direct folder picker/read direct files sudah ada dari batch sebelumnya.
- Jangan scan folder dari Detail.
- Jangan scan subfolders.
- Jangan recursive scan.
- Jangan watcher.
- Jangan automatic folder refresh.

V1 target:

- UI gallery selection lebih jelas.
- Tampilkan selected image count dari saved explicit paths.
- Tampilkan preview/list jika safe.
- Allow clear/replace selected gallery list jika current save behavior supports it.
- Jangan expose raw JSON.
- Preserve normalization behavior yang sudah ada: trim, remove empty paths, dedupe dalam satu Image record, preserve first occurrence order.
- Invalid atau missing `galleryImagePathsJson` harus tetap defensive dan aman.

## 12. Rating Field Plan

Source rating tetap:

```text
ratingJson
```

V1 target:

- Form rating inputs tetap sederhana.
- Values mengikuti helper range valid 1 sampai 5.
- Prevent invalid values jika memungkinkan melalui input constraints.
- Entity-specific rating dimensions tetap diperbolehkan jika current form/config berbeda.
- Jangan redesign rating storage.
- Jangan menambahkan rating table.
- Jangan implement Catalog rating filter/sort dalam Form UX batch.
- Future form helper sebaiknya reuse rating summary helper dari Functional Spider Chart work jika data shape kompatibel.

Invalid/empty rating behavior:

- Jangan crash.
- Jangan fake score.
- Jangan silently convert malformed values menjadi score palsu.
- Jika field optional, jangan block save hanya karena rating kosong.

## 13. Metadata Cleanup Plan

Video:

- Keep title/original title/code.
- Keep release date/year jika current model tersedia.
- Keep duration jika manually stored.
- Keep availability/owned/censorship.
- Keep publisher/label jika current model mendukung.
- Jangan fake resolution/file size/file type.
- Jangan expose raw IDs/UUIDs/raw JSON.

Image:

- Keep title/original title/code.
- Keep release date/year jika current model tersedia.
- Keep image/gallery count jika safe dan data-backed.
- Keep availability/owned/censorship.
- Jangan fake resolution/file size/file type.
- Jangan expose raw `galleryImagePathsJson`.

Performer:

- Keep name/original name.
- Keep active/retired status jika supported.
- Keep aliases.
- Keep Active Years source fields jika supported.
- Personal dan Physical sections harus align dengan Detail jika data-compatible.
- Jangan fake filmography/pictorials.
- Filmography/Pictorials hanya boleh calculated dari related records jika later safe batch menentukannya.
- Jangan memakai Birth Date sebagai Debut Date atau Debut Year substitute.

## 14. Validation and Save Safety Plan

Validation rules:

- Required core fields harus minimal.
- Hindari blocking save untuk optional fields.
- Prevent invalid rating values.
- Prevent invalid JSON dari user-facing fields dengan menghapus raw JSON editing.
- Date-like fields divalidasi hanya jika current UX sudah mendukung dan rules jelas.
- Preserve existing save/restart/persistence behavior.
- Jangan silently drop unknown existing data.
- Edit forms harus preserve unrelated fields.
- Save patches harus mengikuti current safe model dan tidak mengubah schema.
- Category save tetap menulis `categoriesJson`.
- Related save tetap memakai current related JSON storage.
- Gallery save tetap memakai `galleryImagePathsJson`.
- Rating save tetap memakai `ratingJson`.

Destructive action rules:

- Delete tidak tampil di Create Form.
- Delete di Edit Form harus tetap explicit dan safe sesuai current behavior.
- Form UX V1 tidak menambahkan bulk edit atau mass mutation.

## 15. Create vs Edit Differences

Create Form:

- Fokus pada first save.
- Required fields ditempatkan paling awal.
- Optional advanced fields boleh tetap ada, tetapi tidak boleh menghambat save.
- Tidak ada delete/destructive action.
- Tidak boleh membuat category/related records silently.

Edit Form:

- Expose field lebih lengkap dengan aman.
- Preserve existing data.
- Preserve unrelated fields saat save.
- Delete/destructive action tetap guarded.
- Missing related/category/gallery values harus ditangani tanpa crash dan tanpa raw JSON.

Consistency rules:

- Create dan Edit harus memakai section order dan label yang konsisten.
- Perbedaan create/edit harus berdasarkan risiko dan data readiness, bukan desain yang terpisah total.

## 16. Data Readiness Classification

| Item | Classification | Notes |
| --- | --- | --- |
| Category picker UI using existing Managed Categories and `categoriesJson` | Ready for 28.2 | Preserve label storage, no IDs/table. |
| Related picker UI if existing list/load helpers are sufficient | Ready for 28.3 | Confirm helpers before implementation; preserve related JSON. |
| Form layout cleanup | Ready for 28.4 | Keep single-column/simple structure. |
| Hide raw JSON fields | Ready for 28.2/28.3/28.4 | User-facing fields should own parsing/serialization. |
| Rating value range enforcement for simple numeric values | Ready for 28.4/28.6 | Use 1 to 5 semantics from rating helper. |
| Gallery selected count from saved explicit paths | Ready for 28.4 | Parse `galleryImagePathsJson`; no file/folder reads. |
| Label normalization | Needs helper | Keep labels consistent without changing storage unexpectedly. |
| Related search/filter helper | Needs helper | Needed for picker search and safe missing record states. |
| Category picker option helper | Needs helper | Should source Managed Categories and dedupe selected labels. |
| Rating form helper shared with rating summary helper | Needs helper | Avoid duplicating rating parsing/range behavior. |
| Gallery path count/preview helper | Needs helper | Count/list saved paths only; no scan. |
| Advanced file status in forms | Needs separate planning | Avoid mixing runtime status with Form UX. |
| Media root management integration | Needs separate planning | Do not change media root behavior here. |
| Bulk edit | Needs separate planning | Requires preview/confirmation safety. |
| Import/export mapping | Needs separate planning | Data-risk and not part of Form UX V1. |
| New persisted tech metadata | Needs storage/schema planning | Resolution/file size/file type fields need explicit approval. |
| Relational categories | Needs storage/schema planning | Out of MVP category model. |
| Parent/child categories | Needs storage/schema planning | Out of V1 form scope. |
| Category thumbnails | Needs storage/schema planning | Out of V1 form scope. |
| New relation table replacing related JSON | Needs storage/schema planning | Requires separate architecture batch. |
| Scraping | Post-V1 | Not local-first default behavior. |
| Advanced metadata extraction | Post-V1 | Runtime/data risk. |
| Watchers/live folder sync | Post-V1 | Explicitly deferred. |
| Analytics | Post-V1 | Not part of Form UX V1. |

## 17. Recommended Implementation Sequence

Recommended sequence setelah 28.1:

1. 28.2 - Category Picker Field Redesign
2. 28.3 - Related Picker Field Redesign
3. 28.4 - Video/Image Form Layout Cleanup
4. 28.5 - Performer Form Data Completion
5. 28.6 - Form Validation and Save Safety Review
6. 28.7 - Form UX Smoke Test

Rationale:

- Category picker lebih dulu karena Categories adalah shared field di Videos, Images, dan Performers, dan storage safety sudah jelas: Managed Categories options, `categoriesJson` output.
- Related picker setelah Category picker karena UX pattern mirip tetapi data lookup/missing record handling lebih kompleks.
- Video/Image layout cleanup setelah shared picker work agar form cleanup tidak perlu diulang.
- Performer data completion dipisah karena Performer memiliki Personal, Physical, Activity, Alias, dan Thumbnail complexity yang lebih tinggi.
- Validation/save safety review dilakukan setelah field UI berubah agar parser, patching, dan preservation behavior bisa diverifikasi end-to-end.
- Smoke test terakhir memastikan create/edit untuk semua entity tetap berjalan.

Jika saat 28.2 ditemukan Category picker helper belum siap, buat helper kecil dalam batch 28.2 tanpa mengubah storage. Jika saat 28.3 existing related load helpers tidak cukup, implementasi picker harus berhenti di helper/search scope tanpa storage redesign.

## 18. Safety Rules

- No source code changes in 28.1.
- No tests edits in 28.1.
- No database/schema changes.
- No Tauri/runtime changes.
- No package/config changes.
- No category storage changes.
- No related storage changes.
- No `categoriesJson` behavior changes.
- No `ratingJson` behavior changes.
- No `galleryImagePathsJson` behavior changes.
- No file copy/import/move/rename/delete/write.
- No thumbnail generation.
- No folder live scan.
- No recursive scan.
- No watcher.
- Preserve Detail Page V1 completed through 27.8.
- Preserve Catalog Toolbar behavior.
- Preserve Category Management safety rules.
- Preserve SQLite persistence.
- Preserve local/offline desktop behavior.
- Do not auto-commit, push, or create PR.

## 19. Non-goals

- No Form UI implementation.
- No source code changes.
- No tests edits.
- No runtime/Tauri changes.
- No database/schema changes.
- No package/config changes.
- No save behavior changes.
- No category storage change.
- No related storage change.
- No rating storage change.
- No gallery storage change.
- No file picker implementation change.
- No native multi-image picker.
- No media root management.
- No Tech Info metadata extraction.
- No Catalog rating filter/sort implementation.
- No Category Management implementation.
- No Settings changes.
- No Detail Page changes.

## 20. Acceptance Criteria

- Docs clearly define Video Form V1 direction.
- Docs clearly define Image Form V1 direction.
- Docs clearly define Performer Form V1 direction.
- Docs clearly plan Category Picker Field Redesign.
- Docs clearly plan Related Picker Field Redesign.
- Docs clearly preserve `categoriesJson`.
- Docs clearly preserve related JSON storage.
- Docs clearly preserve `galleryImagePathsJson`.
- Docs clearly preserve `ratingJson`.
- Docs clearly define validation/save safety rules.
- Docs clearly define implementation sequence.
- Git diff shows documentation changes only.

## 21. Future Smoke Test Checklist

Use checklist ini untuk Batch 28.2 sampai 28.7 sesuai scope masing-masing:

- Video Create Form can save required core fields.
- Video Edit Form preserves existing data and unrelated fields.
- Image Create Form can save required core fields.
- Image Edit Form preserves existing data, cover path, and gallery paths.
- Performer Create Form can save required core fields.
- Performer Edit Form preserves existing data, aliases, personal/physical fields if present, and thumbnail paths if present.
- Category picker displays Managed Categories options.
- Category picker prevents duplicates in one record.
- Category picker writes `categoriesJson` labels only.
- Category picker does not create Managed Categories silently.
- Related picker searches existing records.
- Related picker selected items display without raw IDs.
- Removing a related item only changes the current form value.
- Related picker preserves current related JSON storage.
- Image Gallery form field shows selected image count from `galleryImagePathsJson`.
- Gallery clear/replace behavior matches existing save behavior.
- Image form does not scan `folderPath` from Detail and does not add live sync.
- Rating fields reject or prevent values outside 1 to 5.
- Empty optional rating remains saveable.
- No raw JSON fields are exposed in normal form UI.
- Raw file paths, where editable, are labeled safely and clearly.
- Save/cancel behavior remains unchanged.
- Delete is absent from Create forms and guarded in Edit forms.
- SQLite persistence still works.
- Catalog Toolbar, Detail Page V1, Category Management, and Image Gallery Detail behavior are not regressed.

## 22. Expected Checkpoint Tag

Expected checkpoint tag after merge:

```text
post-mvp-28-1-form-field-ux-v1-planning-v1
```
