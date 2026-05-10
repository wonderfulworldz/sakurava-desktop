# 03a — Sakurava MVP Form Specification

## Status

Dokumen ini mengunci field, jenis field, urutan UX, status input, dan aturan penyimpanan untuk form MVP Sakurava setelah **Visual UI Mockup v1** disetujui.

Form MVP mencakup:

- Video Add/Edit Form
- Image Add/Edit Form
- Performer Add/Edit Form

Catatan penting:

- Visual mockup boleh menampilkan field future/advanced.
- Field future/advanced harus inactive atau placeholder jika belum masuk MVP data model.
- Frontend Static Only tidak boleh menyimpan data nyata.
- Integration phase nanti hanya boleh mengaktifkan field yang sudah disetujui sebagai saved field.

---

## 1. General Form Rules

### 1.1 Required Fields

MVP hanya memiliki field wajib minimal.

| Entity | Required Field |
|---|---|
| Video | Title |
| Image | Title |
| Performer | Name |

### 1.2 Form Layout

Gunakan **single scroll form** dengan section kecil dan jelas.

Jangan gunakan tab untuk MVP.

Alasan:

- Lebih mudah dipahami user pemula.
- Lebih mudah dites manual.
- Tidak ada field tersembunyi.
- Risiko save sebagian lebih kecil.

### 1.3 Field Status

Setiap field harus masuk salah satu status berikut.

| Status | Arti |
|---|---|
| Inputable | User bisa isi/edit |
| Disabled Placeholder | Elemen UI future feature, belum aktif |
| Read-only Placeholder | Tampil sebagai preview, belum dihitung otomatis |
| Inactive Placeholder | Field terlihat untuk visual continuity, tetapi belum aktif/saved |
| System Generated | Dibuat sistem, tidak diedit user |

### 1.4 Save Rules

Pada MVP integration, hanya field berikut yang boleh disimpan:

- Inputable fields yang tercatat sebagai `Saved = Yes`.
- System generated fields seperti `createdAt` dan `updatedAt`.

Field berikut tidak wajib disimpan pada MVP:

- Disabled placeholder.
- Read-only placeholder.
- Inactive placeholder.
- Related content placeholder.
- Tech info placeholder.

### 1.5 Categories Rule

Categories MVP menggunakan **text labels only**.

Contoh benar:

```json
["Favorite", "Classic", "High Replay"]
```

Contoh salah:

```json
["cat_01", "cat_02"]
```

Jangan gunakan `categoryIds` pada MVP.

### 1.6 Aliases Rule

Aliases untuk Performer menggunakan text labels only.

Contoh benar:

```json
["Alias A", "Alias B"]
```

### 1.7 Rating Rule

- Rating di form menggunakan slider atau number input 1–5.
- Spider chart hanya tampil di detail page, bukan input utama di form.
- Pada Frontend Static Only, rating boleh berupa UI mock/local state.
- Rating baru dihubungkan ke backend ketika schema `ratingJson` untuk entity tersebut sudah dikunci.

### 1.8 Path Rule

Path field pada MVP menggunakan manual text input.

Browse button boleh tampil, tetapi harus disabled sebagai placeholder post-MVP.

---

## 2. Video Form

### 2.1 Section Order

Urutan UX final:

1. Basic Identity
2. Quick Classification
3. Cover & File Path
4. Release Metadata
5. Tech Info
6. Rating
7. Notes
8. Related Content

### 2.2 Basic Identity

| Field | Type | Status | Saved |
|---|---|---|---|
| Title | Text input | Inputable | Yes |
| Original Title | Text input | Inputable | Yes |
| Code | Text input | Inputable | Yes |
| Favorite | Checkbox / toggle | Inputable | Yes |

### 2.3 Quick Classification

| Field | Type | Status | Saved |
|---|---|---|---|
| Availability | Select | Inputable | Yes |
| Censorship | Select | Inputable | Yes |
| Categories | Tag/chip input | Inputable | Yes |

Availability options:

- Owned
- Not Owned
- Missing

Censorship options:

- Censored
- Uncensored
- Reduced

Categories data rule:

```json
["Category A", "Category B"]
```

### 2.4 Cover & File Path

| Field | Type | Status | Saved |
|---|---|---|---|
| Cover Path | Text input | Inputable | Yes |
| Browse Cover | Button | Disabled Placeholder | No |
| Media Path | Text input | Inputable | Yes |
| Browse Media | Button | Disabled Placeholder | No |

### 2.5 Release Metadata

| Field | Type | Status | Saved |
|---|---|---|---|
| Release Date | Date input | Inputable | Yes |
| Duration | Number input | Inputable | Yes |
| Publisher / Label | Text input | Inputable | Yes |

Catatan:

- `Duration` menggunakan satuan menit.
- `Publisher / Label` menggunakan text input untuk MVP, bukan tag/chip input.

### 2.6 Tech Info

Tech Info tampil sebagai read-only placeholder.

| Field | Type | Status | Saved |
|---|---|---|---|
| Resolution | Read-only text | Read-only Placeholder | No |
| File Size | Read-only text | Read-only Placeholder | No |
| Codec | Read-only text | Read-only Placeholder | No |
| Bitrate | Read-only text | Read-only Placeholder | No |
| Frame Rate | Read-only text | Read-only Placeholder | No |

Placeholder text:

```text
Tech info is not detected in MVP.
```

Do not scan files in MVP.

### 2.7 Rating

Video rating term dikunci memakai **Rewatch**.

| Field | Type | Status | Saved |
|---|---|---|---|
| Rewatch | Slider / number 1–5 | Inputable | Yes |
| Performance | Slider / number 1–5 | Inputable | Yes |
| Visual | Slider / number 1–5 | Inputable | Yes |
| Intensity | Slider / number 1–5 | Inputable | Yes |
| Story | Slider / number 1–5 | Inputable | Yes |
| Chemistry | Slider / number 1–5 | Inputable | Yes |

Saved as `ratingJson`.

Example:

```json
{
  "rewatch": 3,
  "performance": 4,
  "visual": 4,
  "intensity": 3,
  "story": 2,
  "chemistry": 4
}
```

### 2.8 Notes

| Field | Type | Status | Saved |
|---|---|---|---|
| Notes | Textarea | Inputable | Yes |

### 2.9 Related Content

Related Content tampil sebagai read-only placeholder only.

| Field | Type | Status | Saved |
|---|---|---|---|
| Related Images | Read-only section | Read-only Placeholder | No |
| Related Performer | Read-only section | Read-only Placeholder | No |

Placeholder text:

```text
Available after relation features are added.
```

Do not implement relation picker in MVP.

---

## 3. Image Form

### 3.1 Section Order

Urutan UX final:

1. Basic Identity
2. Quick Classification
3. Cover & Folder Path
4. Release Metadata
5. Tech Info
6. Rating
7. Notes
8. Related Content

### 3.2 Basic Identity

| Field | Type | Status | Saved |
|---|---|---|---|
| Title | Text input | Inputable | Yes |
| Original Title | Text input | Inputable | Yes |
| Code | Text input | Inputable | Yes |
| Favorite | Checkbox / toggle | Inputable | Yes |

### 3.3 Quick Classification

| Field | Type | Status | Saved |
|---|---|---|---|
| Availability | Select | Inputable | Yes |
| Censorship | Select | Inputable | Yes |
| Categories | Tag/chip input | Inputable | Yes |

Availability options:

- Owned
- Not Owned
- Missing

Censorship options:

- Censored
- Uncensored
- Reduced

### 3.4 Cover & Folder Path

| Field | Type | Status | Saved |
|---|---|---|---|
| Cover Path | Text input | Inputable | Yes |
| Browse Cover | Button | Disabled Placeholder | No |
| Folder Path | Text input | Inputable | Yes |
| Browse Folder | Button | Disabled Placeholder | No |

### 3.5 Release Metadata

| Field | Type | Status | Saved |
|---|---|---|---|
| Release Date | Date input | Inputable | Yes |
| Image Count | Number input | Inputable | Yes |
| Publisher / Label | Text input | Inputable | Yes |

Catatan:

- `Image Count` manual dulu.
- `Detected Image Count` di Tech Info belum aktif.
- `Publisher / Label` menggunakan text input untuk MVP, bukan tag/chip input.

### 3.6 Tech Info

Tech Info tampil sebagai read-only placeholder.

| Field | Type | Status | Saved |
|---|---|---|---|
| Folder Size | Read-only text | Read-only Placeholder | No |
| Detected Image Count | Read-only text | Read-only Placeholder | No |
| Main Resolution | Read-only text | Read-only Placeholder | No |
| File Types | Read-only text | Read-only Placeholder | No |

Placeholder text:

```text
Folder analysis is not available in MVP.
```

Do not scan folders in MVP.

### 3.7 Rating

| Field | Type | Status | Saved |
|---|---|---|---|
| Memorability | Slider / number 1–5 | Inputable | Yes |
| Visual | Slider / number 1–5 | Inputable | Yes |
| Posing | Slider / number 1–5 | Inputable | Yes |
| Atmosphere | Slider / number 1–5 | Inputable | Yes |
| Flow | Slider / number 1–5 | Inputable | Yes |
| Signature | Slider / number 1–5 | Inputable | Yes |

Saved as `ratingJson`.

Example:

```json
{
  "memorability": 4,
  "visual": 5,
  "posing": 4,
  "atmosphere": 3,
  "flow": 4,
  "signature": 5
}
```

### 3.8 Notes

| Field | Type | Status | Saved |
|---|---|---|---|
| Notes | Textarea | Inputable | Yes |

### 3.9 Related Content

Related Content tampil sebagai read-only placeholder only.

| Field | Type | Status | Saved |
|---|---|---|---|
| Related Video | Read-only section | Read-only Placeholder | No |
| Related Performer | Read-only section | Read-only Placeholder | No |

Do not implement relation picker in MVP.

---

## 4. Performer Form

### 4.1 Visual Baseline Rule

Performer Edit pada visual mockup v1 **tidak disederhanakan secara tampilan**.

Namun, untuk MVP:

- Advanced performer fields boleh tampil.
- Advanced performer fields harus inactive atau placeholder.
- Advanced performer fields tidak wajib disimpan.
- Advanced performer fields tidak wajib divalidasi.
- Advanced performer fields tidak boleh membuat Save gagal.
- Related Videos dan Related Images tidak boleh aktif.

### 4.2 Section Order from Visual Mockup v1

1. Basic Identity
2. Media
3. Summary
4. Personal
5. Physical
6. Rating
7. Notes
8. Related Videos
9. Related Images

### 4.3 Basic Identity

| Field | Type | Status | Saved |
|---|---|---|---|
| Name | Text input | Inputable | Yes |
| Original Name | Text input | Inputable | Yes |
| Favorite | Checkbox / toggle | Inputable | Yes |
| Status | Select | Inputable | Yes |
| Aliases | Tag/chip input | Inputable | Yes |
| Categories | Tag/chip input | Inputable | Yes |

Status options:

- Unknown
- Active
- Retired

Aliases data rule:

```json
["Alias A", "Alias B"]
```

### 4.4 Media

| Field | Type | Status | Saved |
|---|---|---|---|
| Cover Path | Text input | Inputable | Yes |
| Thumbnail 1 | Text input | Inactive Placeholder | No |
| Thumbnail 2 | Text input | Inactive Placeholder | No |
| Thumbnail 3 | Text input | Inactive Placeholder | No |
| Thumbnail 4 | Text input | Inactive Placeholder | No |
| Browse Cover | Button | Disabled Placeholder | No |

### 4.5 Summary

| Field | Type | Status | Saved |
|---|---|---|---|
| Years Active | Text input/read-only text | Inactive Placeholder | No |
| Filmography | Number/read-only text | Inactive Placeholder | No |
| Pictorials | Number/read-only text | Inactive Placeholder | No |

Catatan:

- Field ini boleh tampil supaya cocok dengan desain.
- Belum dihitung otomatis pada MVP.
- Jika perlu nilai mock, gunakan placeholder static.

### 4.6 Personal

| Field | Type | Status | Saved |
|---|---|---|---|
| Birth Date | Date input | Inputable | Yes |
| Birthplace | Text input | Inactive Placeholder | No |
| Nationality | Text input | Inactive Placeholder | No |
| Astrological Sign | Text input | Inactive Placeholder | No |
| Blood Type | Text input | Inactive Placeholder | No |

### 4.7 Physical

| Field | Type | Status | Saved |
|---|---|---|---|
| Height | Text input | Inactive Placeholder | No |
| Weight | Text input | Inactive Placeholder | No |
| Measurement | Text input | Inactive Placeholder | No |
| Cup Size | Text input | Inactive Placeholder | No |

### 4.8 Rating

Visual mockup v1 uses six performer rating axes.

| Field | Type | Status | Saved |
|---|---|---|---|
| Attraction | Slider / number 1–5 | Inactive Placeholder for MVP static | No until schema approved |
| Visual | Slider / number 1–5 | Inactive Placeholder for MVP static | No until schema approved |
| Performance | Slider / number 1–5 | Inactive Placeholder for MVP static | No until schema approved |
| Popularity | Slider / number 1–5 | Inactive Placeholder for MVP static | No until schema approved |
| Exceptional | Slider / number 1–5 | Inactive Placeholder for MVP static | No until schema approved |
| Versatility | Slider / number 1–5 | Inactive Placeholder for MVP static | No until schema approved |

Catatan:

- Rating Performer boleh tampil di frontend static sebagai mock UI.
- Jangan hubungkan ke backend sebelum schema rating performer disetujui.
- Jika MVP integration memerlukan rating performer, buat task khusus untuk mengaktifkan schema `ratingJson` performer.

### 4.9 Notes

| Field | Type | Status | Saved |
|---|---|---|---|
| Notes | Textarea | Inputable | Yes |

### 4.10 Related Content

Related Content tampil sebagai read-only placeholder only.

| Field | Type | Status | Saved |
|---|---|---|---|
| Related Videos | Read-only section | Read-only Placeholder | No |
| Related Images | Read-only section | Read-only Placeholder | No |

Do not implement relation picker in MVP.

---

## 5. Saved Fields Summary

### 5.1 Video Saved Fields

```text
id
title
originalTitle
code
favorite
availability
censorship
categoriesJson
coverPath
mediaPath
releaseDate
durationMinutes
publisherLabel
ratingJson
notes
createdAt
updatedAt
```

Not saved for MVP:

```text
resolution
fileSize
codec
bitrate
frameRate
relatedImages
relatedPerformer
```

### 5.2 Image Saved Fields

```text
id
title
originalTitle
code
favorite
availability
censorship
categoriesJson
coverPath
folderPath
releaseDate
imageCount
publisherLabel
ratingJson
notes
createdAt
updatedAt
```

Not saved for MVP:

```text
folderSize
detectedImageCount
mainResolution
fileTypes
relatedVideo
relatedPerformer
```

### 5.3 Performer Saved Fields

```text
id
name
originalName
aliasesJson
favorite
status
categoriesJson
coverPath
birthDate
notes
createdAt
updatedAt
```

Visible but not saved for MVP unless a later approved task updates the schema:

```text
thumbnail1Path
thumbnail2Path
thumbnail3Path
thumbnail4Path
yearsActive
filmographyCount
pictorialsCount
birthplace
nationality
astrologicalSign
bloodType
height
weight
measurement
cupSize
performerRatingJson
relatedVideos
relatedImages
```

---

## 6. Validation Rules

### 6.1 Required Validation

| Entity | Rule |
|---|---|
| Video | Title cannot be empty |
| Image | Title cannot be empty |
| Performer | Name cannot be empty |

### 6.2 Number Validation

Number fields must accept empty value or valid number.

Affected active MVP fields:

- Duration
- Image Count

Inactive placeholder number fields must not block save.

### 6.3 Rating Validation

Rating fields must be between 1 and 5 if active.

Empty rating should be allowed and treated as unrated.

Inactive placeholder rating fields must not block save.

### 6.4 JSON Validation

The following fields must be saved and reopened as text label arrays:

- categoriesJson
- aliasesJson

The following field must be saved and reopened as object JSON when active:

- ratingJson

---

## 7. UX Rules

- Use one scrollable form.
- Do not use tabs for MVP.
- Keep Save and Cancel visible.
- Disabled buttons must look disabled.
- Read-only placeholder sections must clearly say not available yet.
- Inactive placeholder fields must not look like required fields.
- Do not show raw ID.
- Do not show UUID.
- Do not show broken image icon.
- Empty cover must use placeholder.
- Related Content must not be clickable in MVP.
- Tech Info must not trigger file scanning in MVP.

---

## 8. Manual Test Checklist

### 8.1 Video

- Add Video with Title only.
- Add Video with categories.
- Save and reopen categories.
- Save and reopen rating.
- Save and reopen path fields.
- Confirm Browse buttons are disabled.
- Confirm Tech Info is read-only placeholder.
- Confirm Related Content is read-only placeholder.
- Confirm Video rating label uses `Rewatch`.

### 8.2 Image

- Add Image with Title only.
- Add Image with folder path.
- Save and reopen Image Count.
- Save and reopen categories.
- Save and reopen rating.
- Confirm Browse buttons are disabled.
- Confirm Tech Info is read-only placeholder.
- Confirm Related Content is read-only placeholder.

### 8.3 Performer

- Add Performer with Name only.
- Add aliases.
- Save and reopen aliases.
- Save and reopen categories.
- Confirm advanced fields are visible but inactive/placeholder.
- Confirm advanced fields do not block save.
- Confirm Related Videos and Related Images are placeholder only.
- Confirm no related raw ID appears.

### 8.4 General

- No raw ID visible.
- No UUID visible.
- No broken image icon.
- Form typing does not crash.
- Disabled Browse buttons cannot be clicked.
- Tech Info does not trigger scanning.
- Related Content does not open a picker.

---

## 9. Locked MVP Decisions

- Minor text changes are allowed.
- `Publisher / Label` is text input for MVP.
- Browse buttons are disabled placeholders.
- Related Content is read-only placeholder.
- Tech Info is read-only placeholder.
- Categories are text labels only.
- Aliases are text labels only.
- Video rating term is `Rewatch`.
- Performer advanced fields remain visible but inactive/placeholder.
- No UUID/categoryIds in form.
- No relation picker in MVP.
- No native file picker in MVP.
