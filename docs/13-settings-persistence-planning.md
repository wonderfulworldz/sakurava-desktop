# 13 - Settings Persistence Planning

## 1. Purpose

Settings persistence needs a clear plan before implementation because not all settings carry the same risk.

Some settings are harmless UI preferences, such as appearance, language, sidebar state, or simple display choices. Other settings can affect data safety, file paths, media behavior, Backup/Restore expectations, or future file operations.

This document defines a safe planning baseline for Settings persistence before any implementation batch begins.

## 2. Current Scope

This batch is documentation/planning only.

Do not make implementation changes in this batch:

- No Settings persistence implementation.
- No UI changes.
- No schema changes.
- No backend/Rust/Tauri changes.
- No package changes.
- No tests.

The goal is to define storage boundaries, safety rules, deferred work, and implementation checklist items for a later batch.

## 3. Settings Categories

### 3.1 UI Preferences

UI Preferences are low-risk settings that affect the local display experience only.

Examples:

- appearance/theme;
- language;
- sidebar collapse state;
- welcome slider preference;
- collection view mode if already supported;
- items per page if already supported.

These settings should not mutate catalog records, media files, categories, Backup/Restore behavior, or schema.

### 3.2 Catalog Preferences

Catalog Preferences affect how existing catalog data is presented, not the stored records themselves.

Examples:

- default sort;
- default collection filters if needed later;
- last selected section if needed later.

These settings must remain separate from catalog record fields. They should not write to Videos, Images, Performers, `categoriesJson`, or Managed Categories unless a later batch explicitly defines that behavior.

### 3.3 Media / Path Settings

Media / Path Settings affect local file access, thumbnail rendering, missing-file behavior, or media root behavior.

Examples:

- media root;
- thumbnail path behavior;
- local asset behavior;
- missing file status behavior.

These settings are higher risk than simple UI preferences because they interact with the filesystem and local media paths. Future implementation should validate values, tolerate missing paths, avoid storing file contents, and clearly explain whether a setting only affects display or affects file access.

Current context: Sakurava already has local media root behavior in Settings. This planning document does not change that behavior.

### 3.4 Data-Risk Settings

Data-Risk Settings can affect data replacement, data loss, import/export, backup output, restore behavior, or file operations.

Examples:

- backup location;
- restore behavior;
- import/export behavior;
- anything that can affect data replacement, data loss, or file operations.

These settings require explicit safety review before implementation. They should not auto-save into behavior that changes data without confirmation.

## 4. Recommended Storage Strategy

### 4.1 localStorage

Use `localStorage` for low-risk UI preferences:

- appearance selection;
- language selection;
- sidebar collapse state;
- welcome slider preference;
- simple display preferences.

`localStorage` is appropriate when the setting is local, small, non-sensitive, frontend-owned, and safe to ignore or reset. Values must be parsed defensively and invalid values must fall back to safe defaults.

Existing context: Managed Categories already use `sakurava.managedCategories.v1` as local UI configuration. Do not merge general Settings persistence into that key.

### 4.2 SQLite / App Config Table

Use SQLite or an app config table later only if settings must be durable, queryable, shared with backend behavior, included in database backup expectations, or important for data operations.

Potential examples for a future batch:

- settings that backend commands need to read;
- settings that must be restored with the database;
- settings that must participate in migrations;
- settings whose history or validation matters for data safety.

Do not add a SQLite settings table in this planning batch.

### 4.3 Tauri / App Config File

Consider a Tauri/app config file later only for app-level settings that are not catalog record data but need filesystem-level stability.

Potential examples for a future batch:

- app-level filesystem preferences;
- native window or runtime settings;
- settings that should survive frontend storage resets but should not live in catalog records.

Do not add a Tauri config file in this planning batch.

### 4.4 No Schema Decision In This Batch

Do not decide schema changes in this batch.

If a SQLite settings table is needed later, plan it in a separate implementation batch with explicit approval, migration rules, backup/restore implications, and tests.

## 5. Safety Rules

Mandatory rules for future Settings persistence:

- Do not store sensitive media contents in `localStorage`.
- Do not store raw file contents in `localStorage`.
- Do not store large data blobs in `localStorage`.
- Do not persist invalid setting values.
- Use safe defaults if a setting is missing or invalid.
- Settings parsing must not crash the app.
- Settings migration/versioning should be considered before adding many persistent settings.
- Data-risk settings require confirmation and safety review before implementation.
- Settings persistence must not mutate catalog records.
- Settings persistence must not change category behavior.
- Settings persistence must not change Backup/Restore behavior unless a later Backup/Restore batch explicitly asks for it.
- Settings persistence must not change media root behavior unless a later media/path batch explicitly asks for it.
- Storage keys should be versioned when the shape is expected to evolve.
- Unknown future keys should be ignored safely.

## 6. Suggested Settings Schema / Shape

The following shape is conceptual only. It is not implementation code and does not decide the final storage mechanism.

```json
{
  "version": 1,
  "appearance": "system",
  "language": "en",
  "sidebarCollapsed": false,
  "welcomeSliderEnabled": true,
  "collectionPreferences": {
    "videosView": "grid",
    "imagesView": "grid",
    "performersView": "grid",
    "itemsPerPage": 24
  }
}
```

Planning notes:

- Final shape can be adjusted during implementation.
- Invalid values should fall back safely.
- Each persisted setting should define allowed values and defaults.
- Settings that affect data risk should not be mixed into a low-risk UI preference blob without review.
- Category storage should remain separate from general Settings persistence.

## 7. Settings Persistence UX Rules

Settings should save clearly and predictably.

Future implementation should follow these UX rules:

- Low-risk UI preferences can auto-save if the behavior is obvious and reversible.
- Risky settings should require explicit confirmation before being saved or applied.
- User should not need to restart for simple UI preferences unless technically required.
- If restart is needed, explain it clearly.
- Reset to defaults should be planned carefully.
- Reset to defaults must clarify what is being reset.
- Settings must not silently change catalog data.
- Settings must not silently change categories.
- Settings must not silently change Backup/Restore behavior.
- Settings must not silently change file or media behavior.

## 8. Current Deferred Settings

The following remain deferred unless a future batch explicitly activates them:

- Appearance real logic.
- Language real logic.
- Welcome Slider real logic.
- Advanced media root behavior.
- Backup/Restore implementation changes.
- Import/export settings.
- Cloud/sync settings.

Cloud/sync settings are outside the local/offline product direction unless the user explicitly approves a planned batch that changes that direction.

## 9. Future Implementation Checklist

For a future Settings persistence implementation batch:

- [ ] Decide exact settings to persist.
- [ ] Decide storage per setting.
- [ ] Define defaults.
- [ ] Validate values.
- [ ] Handle missing settings.
- [ ] Handle corrupt settings.
- [ ] Add tests if logic is implemented.
- [ ] Avoid schema changes unless approved.
- [ ] Avoid unrelated UI polish.
- [ ] Verify persistence after app restart.
- [ ] Verify reset/default behavior if implemented.
- [ ] Confirm catalog records are not mutated.
- [ ] Confirm category behavior is unchanged.
- [ ] Confirm Backup/Restore behavior is unchanged unless explicitly in scope.
- [ ] Confirm media/path behavior is unchanged unless explicitly in scope.

## 10. Agent Notes

Future agents:

- Do not implement Settings persistence from this batch.
- Do not add schema/backend/Tauri changes in this batch.
- Do not persist everything by default.
- Keep UI preferences separate from data-risk settings.
- Keep Media / Path Settings separate from low-risk UI preferences.
- Do not change Categories, Backup/Restore, or media behavior unless a later batch explicitly asks.
- Do not change `categoriesJson`.
- Do not change Managed Categories storage or semantics.
- Do not add UI polish unless requested or required for usability, correctness, accessibility, or verification.
- Read this document before implementing any Settings persistence.

## 11. Related Documents

- [docs/PROJECT_STATUS.md](PROJECT_STATUS.md) - Current project status and latest roadmap phase.
- [docs/ROADMAP_LOCKED.md](ROADMAP_LOCKED.md) - Locked roadmap order.
- [docs/10-category-management-safety.md](10-category-management-safety.md) - Category Management safety rules.
- [docs/12-backup-restore-ux-safety.md](12-backup-restore-ux-safety.md) - Backup/Restore safety rules.

## 12. Checkpoint

This documentation batch establishes the Settings persistence planning baseline.

Checkpoint tag:

```text
post-mvp-18-2-settings-persistence-planning-v1
```
