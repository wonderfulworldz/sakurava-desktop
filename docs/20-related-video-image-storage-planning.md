# 20 - Related Video/Image Storage Planning

## 1. Purpose

Related Video/Image Picker implementation needs an approved storage model before it can safely persist selections.

Picker UI must not invent persistence during implementation. It must not add schema fields, backend behavior, Rust/Tauri command fields, relation tables, or migration behavior without an explicit storage implementation batch.

This document plans the storage direction for future Related Video/Image relationships.

## 2. Current Scope

This batch is documentation/planning only.

Do not make implementation changes in this batch:

- No Related Video/Image storage implementation.
- No schema changes.
- No backend/Rust/Tauri changes.
- No package changes.
- No form UI changes.
- No detail UI changes.
- No tests.

The goal is to define a safe storage direction before picker implementation begins.

## 3. Current Finding

Current code inspection shows:

- Related Performer already uses `relatedPerformersJson` on Video records.
- Related Performer already uses `relatedPerformersJson` on Image records.
- Related Performer storage is wired through TypeScript types, JSON normalization, schema SQL, repository behavior, SQLite adapter behavior, Tauri database initialization, Tauri command payloads, and tests.
- Related Video/Image storage is not implemented yet.
- Video records do not expose `relatedImagesJson`.
- Image records do not expose `relatedVideosJson`.
- Current schema and Rust database initialization do not define Related Video/Image relation fields.
- Current schema tests still guard against relational content tables such as `related_videos` and `related_images`.
- Current Video/Image related rows are still planning or placeholder surfaces unless future batches change them.

Therefore, Related Video/Image Picker selections cannot be safely persisted until storage is planned and then implemented in a later approved batch.

## 4. Storage Options

### Option A - JSON Fields On Current Records

Likely future fields:

```text
relatedImagesJson on Video records
relatedVideosJson on Image records
```

Conceptual JSON shape:

```json
[
  {
    "recordId": "existing-record-id",
    "titleSnapshot": "Display Title"
  }
]
```

Pros:

- Aligns with `categoriesJson`, `ratingJson`, `aliasesJson`, and `relatedPerformersJson` style.
- Local/offline friendly.
- Enough for v1 picker and detail display.
- Supports unresolved fallback through `titleSnapshot`.
- Avoids premature join table complexity.
- Can be defensively parsed without crashing.
- Can be migrated later if heavier relation browsing becomes necessary.

Cons:

- Less normalized than a relation table.
- Query-heavy relation browsing is less direct.
- Requires defensive parsing.
- Requires careful update behavior.
- Requires tests that unrelated fields are preserved during create and update.

### Option B - Relational Join Table

Example conceptual tables:

- `video_images`
- `image_videos`

Pros:

- Normalized.
- Better for query-heavy relation browsing.
- Can support many-to-many relation queries later.
- Can support uniqueness constraints later.

Cons:

- Adds migration complexity.
- Adds repository complexity.
- Adds Rust/Tauri command and mapping complexity.
- Raises bidirectional behavior risk.
- Requires broader tests and rollback planning.
- Too heavy for current v1 unless explicitly needed.

### Option C - Text-Only Labels

Example conceptual fields:

- `relatedImageLabelsJson`
- `relatedVideoLabelsJson`

Pros:

- Simple.
- Easy fallback display when target records are missing.

Cons:

- Weak linking.
- Title changes can make labels stale.
- Cannot reliably open target detail pages.
- Can create duplicate or ambiguous records.
- Not recommended as the main storage model.

## 5. Recommended Direction

Recommended direction for v1:

- Use Option A.
- Add `relatedImagesJson` on Video records in a future storage implementation batch.
- Add `relatedVideosJson` on Image records in a future storage implementation batch.

Conceptual Video `relatedImagesJson` item:

```json
{
  "recordId": "existing-image-id",
  "titleSnapshot": "Image Title"
}
```

Conceptual Image `relatedVideosJson` item:

```json
{
  "recordId": "existing-video-id",
  "titleSnapshot": "Video Title"
}
```

This is the preferred baseline, but final field names and object shape must be confirmed during implementation planning before code changes.

## 6. Relationship Direction And Source Of Truth

Recommended v1 rules:

- Video saves should only mutate the current Video record.
- Image saves should only mutate the current Image record.
- No automatic bidirectional sync in v1.
- If a user relates Video A to Image B while editing Video A, this does not automatically edit Image B.
- If a user wants the reverse relation, it can be added when editing Image B.
- Bidirectional sync can be reconsidered later as a separate planning topic.

This direction is preferred because it:

- Avoids stale mirrored links.
- Reduces delete and update complexity.
- Keeps the current-record update rule simple.
- Is easier to test.
- Is easier to rollback.
- Avoids mutating target records from a form save.

## 7. Required Safety Rules

Mandatory future implementation rules:

- Do not expose raw IDs in UI.
- Store IDs only for internal linking if used.
- Keep `titleSnapshot` as fallback display.
- Invalid JSON must not crash the app.
- Missing related records must show unresolved fallback.
- Saving current Video/Image must preserve unrelated fields.
- Saving current record must not mutate target records.
- Do not auto-create target records.
- Do not implement bidirectional sync in v1.
- Do not change Related Performer behavior.
- Do not change Category behavior.
- Do not change media behavior.

The relation storage should be a current-record edit only. It must not become a bulk relation maintenance workflow.

## 8. Migration / Existing Data

Future storage implementation should treat existing data safely:

- Existing records without relation fields should behave as empty relation lists.
- Missing JSON should parse as an empty relation list.
- Invalid JSON should fallback safely.
- No automatic migration should alter relationship semantics.
- Any SQLite schema update must be idempotent.
- Existing data must not be reset.
- Existing Related Performer data must be preserved.
- Existing `categoriesJson`, `ratingJson`, `aliasesJson`, media paths, notes, favorites, and timestamps must be preserved.
- Backup/Restore considerations should be respected because this changes persisted data shape.

Future migration should add fields with safe defaults only. It should not infer Video/Image relationships from titles, categories, notes, file paths, folder paths, or Related Performer values.

## 9. Backend / Repository Impact

Future storage implementation likely needs:

- Update TypeScript `Video` and `Image` types.
- Update `NewVideo`, `VideoPatch`, `NewImage`, and `ImagePatch` behavior through the existing type structure.
- Add JSON parser/default helpers for Related Video/Image relation references.
- Update schema SQL for `videos` and `images`.
- Update schema tests.
- Update validation defaults.
- Update repository create behavior.
- Update repository update behavior.
- Update repository list/detail mapping.
- Update SQLite adapter column lists.
- Update SQLite adapter row mapping.
- Update SQLite adapter tests.
- Update Tauri database schema initialization.
- Add idempotent column migration behavior in Tauri database initialization.
- Update Tauri command structs for create and patch payloads.
- Update Tauri command create/update SQL.
- Update Tauri row mapping.
- Add tests for create persistence.
- Add tests for update persistence.
- Add tests for list/detail persistence.
- Add tests for existing DB migration/idempotency.
- Add invalid JSON/default fallback tests.
- Add tests that target records are not mutated.

The implementation batch must explicitly report every schema/backend/Rust/Tauri file touched.

## 10. Frontend Impact

After storage exists, future frontend implementation can:

- Add a Related Image picker to Video forms.
- Add a Related Video picker to Image forms.
- Save selected related Images through the current Video save path.
- Save selected related Videos through the current Image save path.
- Display related Images on Video detail pages.
- Display related Videos on Image detail pages.
- Handle empty target state.
- Handle unresolved fallback.
- Avoid showing raw IDs.

The picker should not be implemented before storage is approved unless the user explicitly asks for a UI-only non-persistent prototype.

## 11. Non-Goals / Deferred

The following are explicitly deferred:

- Implementation in this batch.
- Storage implementation.
- Picker implementation.
- Detail display implementation.
- Bidirectional sync.
- Relational join table.
- Related Performer changes.
- Import/export relation mapping.
- Scraping.
- Media behavior.
- Open-file behavior.
- Image preview modal behavior.
- Broad UI polish.
- Category behavior changes.

## 12. Future Batch Sequence

Recommended sequence:

1. Batch 23.2 - Related Video/Image Storage Planning.
2. Batch 23.3 - Related Video/Image Storage Implementation.
3. Batch 23.4 - Related Video/Image Picker Implementation.
4. Batch 23.5 - Related Video/Image Detail Display and Smoke Validation.

Keep each batch narrow. Do not combine storage, picker UI, and detail display unless the user explicitly approves a combined batch.

## 13. Future Implementation Checklist

For the future storage implementation batch:

- [ ] Storage field names finalized.
- [ ] JSON object shape finalized.
- [ ] Schema/default behavior approved.
- [ ] TypeScript types updated.
- [ ] JSON parser/default helpers added.
- [ ] Validation/default helpers added.
- [ ] SQLite schema updated.
- [ ] Tauri schema initialization updated.
- [ ] SQLite/Tauri migration idempotent.
- [ ] Repository create/update/list/detail behavior updated.
- [ ] Tauri command create/update/list/detail behavior updated.
- [ ] Repository tests added.
- [ ] Command tests added.
- [ ] Existing DB migration tests added.
- [ ] Invalid JSON fallback tested.
- [ ] Missing relation field fallback tested.
- [ ] No target mutation.
- [ ] No bidirectional sync.
- [ ] No raw IDs in UI.
- [ ] Smoke test plan prepared.

## 14. Agent Notes

Future agents:

- Do not implement storage from this planning batch.
- Do not change schema in this planning batch.
- Do not implement picker until the storage batch is approved.
- Prefer the JSON field option unless the user explicitly asks for relational schema.
- Keep Related Video/Image separate from Related Performer.
- Keep this separate from media work.
- Preserve existing app behavior.
- Preserve existing Related Performer behavior.
- Preserve Category behavior.
- Read `docs/19-related-video-image-picker-structure-planning.md` before Related Video/Image picker work.

## 15. Related Documents

- [docs/19-related-video-image-picker-structure-planning.md](19-related-video-image-picker-structure-planning.md) - Related Video/Image picker structure planning.
- [docs/18-related-performer-storage-planning.md](18-related-performer-storage-planning.md) - Related Performer storage precedent.
- [docs/17-related-performer-picker-structure-planning.md](17-related-performer-picker-structure-planning.md) - Related Performer picker structure precedent.
- [docs/11-prd-alignment-and-development-plan.md](11-prd-alignment-and-development-plan.md) - Current post-MVP standard.
- [docs/ROADMAP_LOCKED.md](ROADMAP_LOCKED.md) - Locked roadmap order.
- [docs/WORKFLOW_GIT.md](WORKFLOW_GIT.md) - Git and verification workflow.

## 16. Checkpoint

This documentation batch establishes the Related Video/Image Storage planning baseline.

Checkpoint tag:

```text
post-mvp-23-2-related-video-image-storage-planning-v1
```
