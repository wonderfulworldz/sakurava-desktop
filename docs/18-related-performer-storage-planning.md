# 18 - Related Performer Storage Planning

## 1. Purpose

Related Performer Picker implementation needs an approved storage model before it can safely persist selections.

The picker must not invent persistence during UI work. It must not add schema fields, backend behavior, Rust/Tauri commands, or relation tables without an explicit storage implementation batch.

This document plans the storage direction for future Related Performer relationships.

## 2. Current Scope

This batch is documentation/planning only.

Do not make implementation changes in this batch:

- No Related Performer storage implementation.
- No schema changes.
- No backend/Rust/Tauri changes.
- No package changes.
- No form UI changes.
- No detail UI changes.
- No tests.

The goal is to define a safe storage direction before any picker implementation resumes.

## 3. Current Finding

Current code inspection shows:

- Current Video types do not expose a persisted related performer field.
- Current Image types do not expose a persisted related performer field.
- Current schema tests expect Video and Image tables to contain no `related` fields.
- Current schema tests expect no `related_performers` table.
- Current Rust-side database tests also guard against relation tables.
- Current Video and Image form sections show placeholder related rows only.
- Current Video and Image detail pages show placeholder related rows only.

Therefore, Related Performer Picker selections cannot be safely persisted without a storage plan and a later approved implementation batch.

## 4. Storage Options

### Option A - JSON Field On Video/Image Records

Example conceptual field:

```text
relatedPerformersJson
```

Conceptual JSON shape:

```json
[
  {
    "performerId": "existing-performer-id",
    "nameSnapshot": "Display Name"
  }
]
```

Pros:

- Simple and compatible with current `categoriesJson` and `ratingJson` style.
- Local/offline friendly.
- Avoids join table complexity.
- Easier to parse defensively.
- Easier to migrate later than unstructured text.
- Enough for form picker and detail display v1.

Cons:

- Less normalized than a join table.
- Query-heavy relation browsing is less direct.
- Requires careful validation and safe parsing.
- Requires update paths to preserve unrelated record fields.
- Must handle missing Performer records with fallback display.

### Option B - Relational Join Table

Example conceptual tables:

- `video_performers`
- `image_performers`

Pros:

- More normalized.
- Better for query-heavy relation browsing.
- Stronger model for many-to-many relationships.
- Easier to enforce relational uniqueness later.

Cons:

- More schema complexity.
- Requires migrations.
- Requires repository and command changes.
- Requires broader tests.
- More risk than needed for the current stage.
- Likely too heavy for the first Related Performer Picker implementation.

### Option C - Text-Only Labels

Example conceptual field:

```text
relatedPerformerLabelsJson
```

Pros:

- Simple.
- Similar to category label storage.
- Can display even if Performer records are missing.

Cons:

- Weak linking.
- Performer name changes can make labels stale.
- Cannot reliably open Performer detail pages.
- Can create duplicate or ambiguous relations.
- Not recommended as the main storage model.

## 5. Recommended Direction

Recommended direction:

- Use a simple JSON field on Video and Image records in a future implementation batch.
- Conceptual field name: `relatedPerformersJson`.
- Conceptual storage shape: array of relation objects.
- Store Performer IDs for internal linking.
- Store a name snapshot for fallback display.

Conceptual relation object:

```json
{
  "performerId": "existing-performer-id",
  "nameSnapshot": "Display Name"
}
```

This is conceptual only. Final naming and shape must be confirmed during the storage implementation batch before code changes.

## 6. Why JSON Field Is Recommended Now

A JSON field is the safest current direction because it:

- Aligns with existing simple JSON fields such as `categoriesJson`, `ratingJson`, and `aliasesJson`.
- Avoids premature relational table complexity.
- Supports local/offline app needs.
- Supports multiple related Performers per Video/Image.
- Allows safe fallback display through `nameSnapshot`.
- Can be defensively parsed without crashing.
- Can be migrated to relation tables later if the app needs heavier relation browsing.
- Is enough for Related Performer Picker v1 and detail display v1.

The goal is a controlled, compatible storage step before adding picker UI.

## 7. Required Safety Rules

Mandatory future implementation rules:

- Do not expose raw IDs in UI.
- Store IDs only for internal linking if used.
- Keep a name snapshot as fallback display.
- Invalid relation JSON must not crash the app.
- Missing Performer records must show unresolved or legacy fallback.
- Saving Video/Image must preserve unrelated fields.
- Performer records must not be mutated by Video/Image forms.
- Do not auto-create Performer from relation input.
- Do not implement Related Video/Image Picker in this storage batch.
- Do not change Category behavior.
- Do not change media behavior.

The relation picker should be a current-record edit only. It must not become a bulk relation maintenance workflow.

## 8. Migration / Existing Data

Existing records without a relation field should behave as an empty relation list.

Future migration behavior:

- Existing Video records should default to no related Performers.
- Existing Image records should default to no related Performers.
- Missing relation JSON should parse as an empty list.
- Invalid relation JSON should parse as an empty list or safe unresolved state.
- No automatic migration is needed for empty existing records beyond adding a safe default if the field is added.
- Any future data migration must be tested.
- Any risky migration should be backup-aware and reversible where practical.

Do not silently convert category labels, notes, or unrelated text into related Performer values.

## 9. Backend / Repository Impact

Future storage implementation likely needs:

- Update frontend/backend shared types.
- Add Video and Image relation field types.
- Update schema tests.
- Update SQLite schema or migration behavior if required.
- Update repository create behavior.
- Update repository update behavior.
- Update repository list/detail mapping.
- Update validation and default normalization.
- Update runtime command payloads if relevant.
- Add tests for create persistence.
- Add tests for update persistence.
- Add tests for list/detail persistence.
- Add tests for invalid JSON fallback.
- Add tests that unrelated fields are preserved.

The implementation batch must explicitly report every schema/backend/Rust/Tauri file touched.

## 10. Frontend Impact

After storage exists, future frontend implementation can:

- Replace Video form Related Performer placeholder with a picker.
- Replace Image form Related Performer placeholder with a picker.
- Use existing Performer list command pattern to populate picker choices.
- Save selected related Performers through the current Video/Image save path.
- Display related Performers on Video detail pages.
- Display related Performers on Image detail pages.
- Handle empty Performer state.
- Handle unresolved Performer fallback.
- Avoid showing raw IDs.

The picker should not be implemented before storage is approved unless the user explicitly asks for a UI-only non-persistent prototype.

## 11. Non-Goals / Deferred

The following are explicitly deferred:

- Implementation in this batch.
- Relational join table.
- Related Video/Image Picker.
- Performer self-relations.
- Import/export relation mapping.
- Scraping.
- Media behavior.
- Broad UI polish.
- Category behavior changes.
- Automatic migration from free text.

## 12. Future Implementation Checklist

For the future storage implementation batch:

- [ ] Storage shape finalized.
- [ ] Field name finalized.
- [ ] JSON object shape finalized.
- [ ] Schema/backend changes planned in a dedicated implementation batch.
- [ ] Validation added.
- [ ] Safe parser added.
- [ ] Repository tests added.
- [ ] Command tests added.
- [ ] Invalid JSON fallback tested.
- [ ] Missing Performer fallback tested.
- [ ] Existing records without relation data behave as empty relation list.
- [ ] Unrelated fields are preserved on Video/Image updates.
- [ ] No Performer mutation from Video/Image forms.
- [ ] Form picker implemented only after storage exists.
- [ ] Detail display implemented only after storage exists.
- [ ] Manual smoke test plan prepared.

## 13. Agent Notes

Future agents:

- Do not implement storage from this planning batch.
- Do not change schema in this planning batch.
- Do not implement Related Performer Picker until storage implementation is approved.
- Keep the JSON field option preferred unless the user explicitly asks for relational schema.
- Keep this separate from Related Video/Image Picker.
- Keep this separate from media work.
- Do not mutate Performer records from Video/Image forms.
- Do not expose raw IDs in UI.
- Read `docs/17-related-performer-picker-structure-planning.md` before picker implementation.

## 14. Related Documents

- [docs/17-related-performer-picker-structure-planning.md](17-related-performer-picker-structure-planning.md) - Picker structure planning.
- [docs/11-prd-alignment-and-development-plan.md](11-prd-alignment-and-development-plan.md) - Current post-MVP standard.
- [docs/ROADMAP_LOCKED.md](ROADMAP_LOCKED.md) - Locked roadmap order.
- [docs/WORKFLOW_GIT.md](WORKFLOW_GIT.md) - Git and verification workflow.

## 15. Checkpoint

This documentation batch establishes the Related Performer Storage planning baseline.

Checkpoint tag:

```text
post-mvp-22-2-related-performer-storage-planning-v1
```
