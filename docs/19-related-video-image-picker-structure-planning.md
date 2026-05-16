# 19 - Related Video/Image Picker Structure Planning

## 1. Purpose

The future Related Video/Image Picker should let:

- Video forms select related Images.
- Image forms select related Videos.

The picker should use existing saved records only. It should not allow free-text relation creation, auto-create related records, expose raw IDs, or invent storage during UI implementation.

This document defines the target structure and safety boundaries before implementation begins.

## 2. Current Scope

This batch is documentation/planning only.

Do not make implementation changes in this batch:

- No Related Video/Image Picker implementation.
- No form UI changes.
- No detail UI changes.
- No route changes.
- No tests.
- No schema changes.
- No backend/Rust/Tauri changes.
- No package changes.

The goal is to document the target relationship structure and constraints for later batches.

## 3. Target Entities

Target relationship surfaces:

- Video create form -> related Images.
- Video edit form -> related Images.
- Image create form -> related Videos.
- Image edit form -> related Videos.
- Video detail -> display related Images in a future display batch.
- Image detail -> display related Videos in a future display batch.

Performer form/detail is out of scope unless a later batch explicitly asks for Performer-to-Video or Performer-to-Image relation behavior.

The Related Video/Image Picker should remain separate from:

- Related Performer Picker.
- Category Management.
- Form Category Picker Lockdown.
- Categories Sidebar Page.
- Media file status.
- Open file or preview behavior.

## 4. Current Baseline

Current app baseline:

- Videos, Images, and Performers already have CRUD flows.
- Related Performer has planning, storage, picker, and detail display through Batch 22.5.
- Video and Image records currently expose `relatedPerformersJson`.
- Video/Image relation storage is not yet planned or implemented.
- Video and Image forms still show Related Images or Related Video as placeholder-only rows.
- Video and Image detail pages still show Related Images or Related Video as placeholder-only rows.
- Current Video/Image related rows may still be placeholder-only even where Related Performer display is active.
- Current tests expect Related Video/Image sections to remain separate placeholder sections.

Before implementation, agents must inspect the current storage shape again. Do not invent Video/Image relation storage in a picker implementation batch.

Related Video/Image should follow the same staged pattern used by Related Performer:

1. Structure planning.
2. Storage planning.
3. Storage implementation.
4. Picker implementation.
5. Detail display and smoke validation.

## 5. Relationship Direction

The relationship model must be planned before storage is implemented.

Possible directions:

- Video -> Images.
- Image -> Videos.
- Both directions.

Recommended v1 direction:

- Store both directions explicitly only if needed.
- Prefer one source of truth per record type:
  - Video stores `relatedImagesJson`.
  - Image stores `relatedVideosJson`.
- Do not assume automatic bidirectional sync unless explicitly designed in a later storage planning batch.

Automatic bidirectional sync has real risks:

- Stale mirrored links when one side updates and the other side fails.
- Harder update logic for create, edit, delete, and missing-record cases.
- More complicated rename or title snapshot behavior.
- More tests across Video save, Image save, delete, and unresolved references.
- Higher migration risk than needed for the first picker version.

For v1, saving a Video should only mutate that Video. Saving an Image should only mutate that Image.

## 6. Desired Picker Behavior

Target behavior:

- Picker lists existing records only.
- Video form picker lists Images.
- Image form picker lists Videos.
- Search by title.
- Search by original title when available.
- Multiple selection is allowed.
- Selected items show as removable chips or compact cards.
- No free-text creation.
- If the target record does not exist, the user should create that record first.
- Form should not auto-create related Video/Image records.
- Form should not mutate related target records.
- Save should only affect the current record being edited.

The picker should be searchable and simple. It should not become a broad relation management or bulk maintenance surface.

## 7. Data Storage Planning

Do not implement storage in this batch.

Storage options to evaluate in a separate storage planning batch:

### Option A - JSON Field On Video/Image Records

Likely future fields:

```text
relatedImagesJson
relatedVideosJson
```

Conceptual relation object:

```json
{
  "recordId": "existing-record-id",
  "titleSnapshot": "Display Title"
}
```

Pros:

- Compatible with the app's existing JSON field style.
- Local/offline friendly.
- Enough for picker v1 and detail display v1.
- Allows fallback display when a target record is missing.
- Avoids relation table complexity for the first version.

Cons:

- Less normalized than a join table.
- Requires defensive parsing.
- Requires careful update paths that preserve unrelated fields.
- Requires explicit unresolved-reference behavior.

### Option B - Relational Join Table

Example conceptual tables:

- `video_images`.
- `image_videos`.

Pros:

- More normalized.
- Better for query-heavy relation browsing.
- Stronger many-to-many model if future relation pages need it.

Cons:

- Requires schema and migration work.
- Requires broader backend, Rust/Tauri, and repository tests.
- Adds more risk than needed for the first Video/Image picker.
- Must not be introduced in this planning batch.

### Option C - Text-Only Labels

Example conceptual fields:

- `relatedImageLabelsJson`.
- `relatedVideoLabelsJson`.

Pros:

- Simple to display.
- Can preserve labels even if target records are missing.

Cons:

- Weak linking.
- Title changes can make labels stale.
- Cannot reliably open target detail pages.
- Can create duplicate or ambiguous relations.
- Not recommended as the main storage model.

Recommended future direction:

- Use a simple JSON field on Video and Image records in a dedicated storage implementation batch.
- Likely field on Video: `relatedImagesJson`.
- Likely field on Image: `relatedVideosJson`.
- Store target record IDs for internal linking.
- Store a title snapshot for fallback display.

Final field names and JSON shape must be approved in storage planning before implementation.

## 8. Legacy / Unresolved Relation Handling

Future implementation should handle unresolved relation values safely:

- Missing target records should show an unresolved fallback from `titleSnapshot`.
- Invalid JSON should not crash forms, detail pages, or save flows.
- Existing legacy values must not be silently deleted.
- User may remove an unresolved relation only from the current record during edit.
- Do not auto-create target records from unresolved relation values.
- Do not mutate the missing or target record while editing the current record.

Recommended display labels:

- Resolved Image: show Image title and optional original title.
- Resolved Video: show Video title and optional original title.
- Unresolved relation: show `titleSnapshot` with an `Unresolved` marker.

Do not expose raw IDs or UUIDs in user-facing text.

## 9. Empty Target State

When no target records exist:

- If no Images exist, Video form picker shows an empty state.
- If no Videos exist, Image form picker shows an empty state.
- Video form helper text should say: "Create Image records first."
- Image form helper text should say: "Create Video records first."
- Video form should link to Images and Add Image.
- Image form should link to Videos and Add Video.
- Saving with no related items remains allowed.
- Do not fall back to free-text input.
- Do not create the missing target record during save.

The empty state should be clear and non-blocking.

## 10. UX Plan

Recommended UI:

- Searchable multi-select picker.
- Selected chips or compact cards.
- Title as the primary label.
- Original title as optional secondary text when available.
- Optional thumbnail only if current local asset handling supports it safely.
- Available results list.
- Remove control on selected items.
- Helper text:
  - "Create Image records first." on Video forms.
  - "Create Video records first." on Image forms.
- Links to the target collection and add route.
- Layout consistent with the Related Performer Picker.

Avoid broad UI polish and avoid changing unrelated form layout.

## 11. Detail Page Display Plan

Future display behavior:

- Video detail should show related Images as read-only cards or chips.
- Image detail should show related Videos as read-only cards or chips.
- Resolved target records show safe title.
- Resolved target records may show original title as secondary text.
- Unresolved references show fallback `titleSnapshot`.
- Unresolved references should be visually marked as unresolved.
- Do not expose raw IDs.
- Do not add mutation controls on detail pages.
- Do not turn detail display into a relation management workflow.

If relation storage is not implemented yet, detail pages should continue showing safe placeholder text.

## 12. Safety Rules

Mandatory rules:

- Do not auto-create related Video/Image records.
- Do not mutate target records from the current form.
- Do not silently delete unresolved relations.
- Do not expose raw IDs or UUIDs in UI.
- Do not implement bidirectional sync without explicit planning.
- Do not add schema/backend/Tauri/package changes in this planning batch.
- Do not introduce relational join tables in this planning batch.
- Do not mix with Related Performer work.
- Do not change Category behavior.
- Do not change media file behavior.
- Preserve existing app behavior outside the requested relation scope.

## 13. Non-Goals / Deferred

The following are explicitly deferred:

- Implementation in this batch.
- Storage implementation.
- Picker implementation.
- Detail display implementation.
- Bidirectional sync.
- Relational join tables.
- Import/export relation mapping.
- Scraping.
- Media player behavior.
- Open-file behavior.
- Image preview modal behavior.
- Broad UI polish.
- Category behavior changes.
- Related Performer behavior changes.

## 14. Future Batch Sequence

Recommended sequence:

1. Batch 23.1 - Related Video/Image Picker Structure Planning.
2. Batch 23.2 - Related Video/Image Storage Planning.
3. Batch 23.3 - Related Video/Image Storage Implementation.
4. Batch 23.4 - Related Video/Image Picker Implementation.
5. Batch 23.5 - Related Video/Image Detail Display and Smoke Validation.

Keep each batch narrow. Do not combine storage, picker UI, and detail display unless the user explicitly approves a combined batch.

## 15. Future Implementation Checklist

For future implementation batches:

- [ ] Storage shape finalized before picker implementation.
- [ ] Field names finalized before code changes.
- [ ] Affected forms identified.
- [ ] Affected detail pages identified.
- [ ] Video form target list loads Images only.
- [ ] Image form target list loads Videos only.
- [ ] Empty target state handled.
- [ ] Unresolved fallback handled.
- [ ] Invalid JSON fallback handled.
- [ ] No free-text creation.
- [ ] No target record mutation.
- [ ] No automatic bidirectional sync.
- [ ] No raw IDs shown.
- [ ] Save only updates the current record relation field.
- [ ] Tests planned for Video form.
- [ ] Tests planned for Image form.
- [ ] Tests planned for detail display.
- [ ] Smoke test plan prepared.

## 16. Agent Notes

Future agents:

- Do not implement from this planning batch.
- Do not invent relation storage before storage planning.
- Keep Related Video/Image separate from Related Performer.
- Keep this separate from media file status, open-file, and preview behavior.
- Keep this separate from Category behavior.
- Preserve existing app behavior.
- Follow the staged pattern used by Related Performer.
- Read this document before Related Video/Image storage or picker work.

## 17. Related Documents

- [docs/17-related-performer-picker-structure-planning.md](17-related-performer-picker-structure-planning.md) - Related Performer picker structure precedent.
- [docs/18-related-performer-storage-planning.md](18-related-performer-storage-planning.md) - Related Performer storage precedent.
- [docs/11-prd-alignment-and-development-plan.md](11-prd-alignment-and-development-plan.md) - Current post-MVP standard.
- [docs/ROADMAP_LOCKED.md](ROADMAP_LOCKED.md) - Locked roadmap order.
- [docs/WORKFLOW_GIT.md](WORKFLOW_GIT.md) - Git and verification workflow.

## 18. Checkpoint

This documentation batch establishes the Related Video/Image Picker Structure planning baseline.

Checkpoint tag:

```text
post-mvp-23-1-related-video-image-picker-structure-planning-v1
```
