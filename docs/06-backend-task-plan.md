# 06 — Backend Only Task Plan

## 1. Purpose

Fase backend hanya membuat fondasi data lokal.

Tidak boleh mengubah UI.

Tujuan:

- SQLite schema.
- Repository layer.
- Service layer.
- Simple validation.
- Backend tests.
- JSON field safe parsing.

## 2. Recommended Branch

```text
backend/sqlite-mvp-foundation
```

## 3. Scope

Backend MVP mencakup:

- Videos table.
- Images table.
- Performers table.
- Repository functions.
- Service functions.
- Validation functions.
- Unit tests / backend tests.
- Safe JSON helpers.

## 4. Do Not Touch

Pada fase ini jangan:

- Ubah React UI.
- Ubah visual design.
- Hubungkan frontend ke backend.
- Tambah native file picker.
- Tambah relation picker.
- Tambah relational categories.
- Tambah backup/restore.
- Tambah scraping.
- Tambah media player.

## 5. Database File

Database file:

```text
sakurava.sqlite
```

App data folder:

```text
app.sakurava.desktop
```

## 6. Tables Concept

### videos

Fields:

- id
- title
- originalTitle
- code
- censorship
- availability
- releaseDate
- durationMinutes
- publisherLabel
- coverPath
- mediaPath
- categoriesJson
- ratingJson
- notes
- favorite
- createdAt
- updatedAt

### images

Fields:

- id
- title
- originalTitle
- code
- censorship
- availability
- releaseDate
- publisherLabel
- coverPath
- folderPath
- imageCount
- categoriesJson
- ratingJson
- notes
- favorite
- createdAt
- updatedAt

### performers

Fields:

- id
- name
- originalName
- aliasesJson
- status
- birthDate
- coverPath
- filmographyCount
- pictorialsCount
- categoriesJson
- ratingJson
- notes
- favorite
- createdAt
- updatedAt

## 7. Repository Layer Requirements

Repository layer handles direct database operations.

Required operations per entity:

- create
- getById
- list
- update
- delete optional for MVP or deferred
- count optional for Home

Important:

- Repository should not contain UI logic.
- Repository should not return raw invalid JSON without service normalization.

## 8. Service Layer Requirements

Service layer handles:

- Input validation.
- Data normalization.
- Safe JSON parse/stringify.
- Default values.
- Error messages.
- Mapping between persistence shape and app shape.

## 9. Validation Rules

### Video

- `title` required.
- `durationMinutes` must be number if provided.
- `favorite` default false.
- `categoriesJson` default `[]`.
- `ratingJson` default `{}`.

### Image

- `title` required.
- `imageCount` must be number if provided.
- `favorite` default false.
- `categoriesJson` default `[]`.
- `ratingJson` default `{}`.

### Performer

- `name` required.
- `filmographyCount` must be number if provided.
- `pictorialsCount` must be number if provided.
- `favorite` default false.
- `aliasesJson` default `[]`.
- `categoriesJson` default `[]`.
- `ratingJson` default `{}`.

## 10. JSON Rules

### categoriesJson

Must store text labels only.

Valid:

```json
["Favorite", "Sample"]
```

Invalid for MVP:

```json
["7b4a5f6e-raw-id"]
```

If user typed category text that looks like random ID, still treat as text label, but do not create ID-based categories.

### aliasesJson

Must store text labels only.

### ratingJson

Must store simple object.

If invalid:

- Return safe default.
- Do not crash.

## 11. Acceptance Criteria

Backend only is done if:

- Database can initialize.
- Videos CRUD backend works.
- Images CRUD backend works.
- Performers CRUD backend works.
- Required validation works.
- JSON fields save/read correctly.
- Categories remain text labels.
- No relation table for categories.
- Tests pass.
- No UI files changed.

## 12. Test Command

Final command depends on project setup.

Recommended:

```text
npm run test
```

If backend tests are separate:

```text
npm run test:backend
```

Build check if available:

```text
npm run build
```

## 13. Manual/Developer Check

Backend phase manual check:

- Create sample Video.
- Read sample Video.
- Update sample Video.
- Reopen database.
- Confirm sample Video persists.
- Confirm categories are labels.
- Repeat for Image.
- Repeat for Performer.

## 14. Rollback Plan

If backend task fails:

1. Do not merge.
2. Check if schema, repository, service, and tests were mixed too broadly.
3. Split into smaller tasks:
   - SQLite init only.
   - Video repository only.
   - Image repository only.
   - Performer repository only.
   - Validation helpers only.
   - JSON helpers only.

## 15. Remaining Risks

After backend only:

- Frontend still not wired.
- Native Tauri runtime may still need integration check.
- Browser mode adapter still needed.
- Database path in installed app still needs deploy validation.
