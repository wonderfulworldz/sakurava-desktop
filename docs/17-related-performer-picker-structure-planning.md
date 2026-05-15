# 17 - Related Performer Picker Structure Planning

## 1. Purpose

The future Related Performer Picker should replace placeholder or free-text performer relation behavior with a controlled picker from existing Performer records.

The picker should let Video and Image forms select related Performers from saved Performer records. It should not create Performers automatically, expose raw IDs, or introduce unsafe schema changes.

This document defines expected behavior and safety boundaries before implementation begins.

## 2. Current Scope

This batch is documentation/planning only.

Do not make implementation changes in this batch:

- No Related Performer Picker implementation.
- No form UI changes.
- No route changes.
- No tests.
- No schema changes.
- No backend/Rust/Tauri changes.
- No package changes.

The goal is to document the target structure and constraints for a later implementation batch.

## 3. Target Entities

The Related Performer Picker should apply to:

- Video create form.
- Video edit form.
- Image create form.
- Image edit form.
- Video detail display, if relation data is available.
- Image detail display, if relation data is available.

It should not apply to Performer forms unless a later batch explicitly asks for performer self-relations or performer-to-performer relationships.

The Related Performer Picker should remain separate from:

- Related Video Picker.
- Related Image Picker.
- Category Management.
- Form Category Picker Lockdown.
- Media file behavior.

## 4. Current Baseline

Current app baseline:

- Videos, Images, and Performers already have CRUD flows.
- Forms currently include related sections as placeholders.
- Video and Image forms include `Related Performer` placeholder sections.
- Detail pages display related content placeholder rows.
- Current frontend record types do not expose a persisted related performer field.
- Current backend/schema tests expect no related relation fields or related tables.
- Runtime command files currently provide Performer list/get/create/update/delete commands.

Before implementation, agents must inspect the current storage shape again. Do not invent new relation storage in this planning batch.

Important baseline rule:

- If no related performer storage exists at implementation time, the implementation batch must either stay UI-only/placeholder-safe or request an explicit storage/schema planning batch before persisting relationships.

## 5. Desired Picker Behavior

Target behavior for the future picker:

- Picker lists existing Performer records.
- User can search Performers by display name.
- User can search by original name when available.
- User can select multiple Performers.
- Selected Performers appear as removable chips or compact cards.
- Selected display should use safe labels such as Performer name and optional original name.
- Picker should not allow free-text Performer creation.
- If a Performer does not exist, user should create a Performer record first.
- Form should provide a link to the Performers collection or Add Performer route.
- The form should not auto-create Performers.
- The form should not mutate unrelated Performer records.
- Save should only affect the current Video or Image being edited.

The picker should be searchable and simple. It should not become a broad relation management surface.

## 6. Data Storage Planning

Storage must be decided carefully during implementation.

Preferred approach:

- Preserve existing related field/storage if one exists at implementation time.
- If current MVP uses JSON/text fields for related data, keep a simple compatible shape unless a later schema batch approves a change.
- Save only updates the current Video or Image relationship field.
- Preserve unrelated fields on the current record.
- Existing legacy relation values must not be silently deleted.

Current observed constraint:

- The current typed Video and Image records do not expose a related performer field.
- The current schema does not define related performer tables.

Allowed future options only after explicit approval:

- Add a simple JSON/text field to Video/Image records.
- Add a relation table or join model.
- Add a migration from legacy text values to stable IDs.

Forbidden for this planning batch:

- Do not introduce relational join tables.
- Do not add Performer UUID migration.
- Do not add schema fields.
- Do not change backend/Rust/Tauri files.
- Do not change package files.

Implementation should prefer the smallest compatible path and must report storage assumptions before editing persistence behavior.

## 7. Legacy Relation Handling

Existing records may later contain legacy related performer values that do not resolve to current Performer records.

Future implementation should handle these safely:

- Show unresolved values as legacy or unresolved relation chips when possible.
- Do not auto-delete unresolved relations.
- Do not auto-create Performer records from unresolved values.
- Allow the user to remove unresolved relations from the current Video or Image record.
- Do not mutate other records during cleanup.
- Full cleanup or migration should be a separate planned batch.

Recommended display labels:

- Resolved Performer: show Performer name.
- Resolved Performer with original name: show name plus original name as secondary text.
- Unresolved legacy relation: show the stored label with an `Unresolved` or `Legacy` marker.

Do not expose raw IDs or UUIDs in user-facing text.

## 8. Empty Performer State

When no Performer records exist:

- Picker should show an empty state.
- Helper text should explain: "Create Performer records first."
- Provide a link to `/performers`.
- Optionally provide a link to `/performers/new`.
- Saving the current Video or Image with no related Performers should remain allowed.
- Do not fall back to free-text input.
- Do not create a Performer during Video or Image save.

The empty state should be clear and non-blocking.

## 9. UX Plan

Recommended UI:

- Searchable multi-select picker.
- Selected Performer chips or compact cards.
- Available Performer results list.
- Remove control on selected Performers.
- Helper text: "Create Performer records first."
- Link to Performers collection.
- Link to Add Performer if appropriate.
- Optional thumbnail/avatar only if an existing safe cover/profile path is already available.
- Keep layout simple and consistent with current forms.

Suggested result item content:

- Performer name.
- Original name if available.
- Status if useful.
- Optional local cover/avatar thumbnail if current asset handling supports it safely.

Avoid broad UI polish and avoid changing unrelated form layout.

## 10. Detail Page Display

Future Video and Image detail pages should display related Performers when relation data exists.

Display behavior:

- Show related Performers as chips or compact cards.
- Link to Performer detail pages when the relation resolves to a Performer record.
- Show safe fallback text for unresolved relations.
- Do not expose raw IDs.
- Do not crash if the related Performer is missing.
- Do not fetch or mutate unrelated records beyond what is needed for display.

If relation storage is not implemented yet, detail pages should continue showing safe placeholder text.

## 11. Safety Rules

Mandatory rules:

- Do not auto-create Performers from relation input.
- Do not mutate Performer records from Video/Image forms.
- Do not delete unresolved legacy relation values silently.
- Do not expose raw IDs or UUIDs in UI.
- Do not change schema/backend/Tauri/package files without explicit future batch approval.
- Do not introduce relational join tables in this planning batch.
- Do not mix with Related Video/Image Picker.
- Do not mix with media file behavior.
- Do not change Category behavior.
- Do not change Form Category Picker Lockdown behavior.
- Do not change Categories Sidebar Page behavior.
- Preserve existing app behavior outside the requested relation picker scope.

## 12. Non-Goals / Deferred

The following are explicitly deferred:

- Implementation in this batch.
- Related Video/Image Picker.
- Performer self-relation picker.
- Schema migration.
- Relational join tables.
- Import/export relation mapping.
- Scraping.
- Broad UI polish.
- Media player/open-file behavior.
- Category behavior changes.

## 13. Future Implementation Checklist

For the future implementation batch:

- [ ] Current related performer storage inspected.
- [ ] Video create/edit form impact confirmed.
- [ ] Image create/edit form impact confirmed.
- [ ] Detail display behavior confirmed.
- [ ] Picker behavior defined.
- [ ] Performer list loading uses existing runtime/list pattern.
- [ ] Empty Performer state handled.
- [ ] Legacy/unresolved relation handling defined.
- [ ] No free-text Performer creation.
- [ ] No Performer mutation from relation picker.
- [ ] Save only updates the current Video/Image relation field.
- [ ] No schema/backend/Tauri/package changes unless approved.
- [ ] Tests planned for Video form.
- [ ] Tests planned for Image form.
- [ ] Tests planned for empty Performer state.
- [ ] Tests planned for unresolved legacy relations if storage exists.
- [ ] Manual smoke test plan prepared.

## 14. Agent Notes

Future agents:

- Do not implement Related Performer Picker from this planning batch.
- Do not change form code in this batch.
- Do not change detail code in this batch.
- Do not invent new relation storage before inspecting current data shapes.
- Keep Related Performer Picker separate from Related Video/Image Picker.
- Keep this feature separate from categories and media work.
- Do not mutate Performer records from Video/Image forms.
- Preserve existing app behavior.
- Read this document, `docs/11-prd-alignment-and-development-plan.md`, and `docs/WORKFLOW_GIT.md` before implementation.

## 15. Related Documents

- [docs/11-prd-alignment-and-development-plan.md](11-prd-alignment-and-development-plan.md) - Current post-MVP standard.
- [docs/15-form-category-picker-lockdown-planning.md](15-form-category-picker-lockdown-planning.md) - Form controlled picker precedent.
- [docs/16-categories-sidebar-page-planning.md](16-categories-sidebar-page-planning.md) - Categories browse page planning.
- [docs/ROADMAP_LOCKED.md](ROADMAP_LOCKED.md) - Locked roadmap order.

## 16. Checkpoint

This documentation batch establishes the Related Performer Picker Structure planning baseline.

Checkpoint tag:

```text
post-mvp-22-1-related-performer-picker-structure-planning-v1
```
