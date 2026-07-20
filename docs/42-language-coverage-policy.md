# 42 - Language Coverage Policy

## Status

Locked as of Batch 34.16. Full translation sweep deferred until major UI/features stabilize.

## Core Rules

1. **All future static UI/chrome text must use translation keys** via `t("key.name")`.
2. **English is the only built-in, installed-by-default, default, source, and fallback language.** English text lives in `englishDictionary` in `src/lib/language.ts`.
3. **Indonesian and every other non-English language are user-managed.** They are not preinstalled, receive no special built-in treatment, and are removable.
4. **English cannot be removed, but it can be modified through the approved CSV workflow and reset to the original bundled English baseline.** English reset must not remove custom languages, custom-language overrides, or user-entered records.
5. **Custom languages use the CSV workflow** — export, edit, preview, and import translations.
6. **Missing custom text falls back to English** — incomplete languages are allowed.
7. **Translation covers application-controlled frontend presentation text only.**
8. **User-entered and stored catalog data is never translated, rewritten, normalized, or mutated** — titles, names, notes, descriptions, metadata, Categories, Work records, Performer records, Credits, imported values, database values, exported catalog values, public references, technical identifiers, and file paths.
9. **One normalized language code represents exactly one identity.** `en` is reserved; recognized and custom codes are accepted; unknown codes are not silently remapped; safe imported/operator labels may be retained when no platform display name exists.

## Key Naming Convention

```
section.subsection.identifier
```

Examples:
- `nav.home` — Sidebar navigation label
- `settings.language.title` — Settings section heading
- `collection.filter` — Collection page toolbar button
- `home.welcome` — Home page hero heading

Rules:
- Use dot-separated lowercase segments.
- Do not use visible English text as the key.
- Group by UI area: `nav.*`, `settings.*`, `home.*`, `collection.*`, `app.*`.
- Keep keys stable — renaming a key breaks existing custom language CSVs.

## Translation Boundary

All visible application-controlled frontend text must be keyed from initial feature implementation:
- Navigation labels
- Page titles and subtitles
- Button labels
- Form field labels and placeholders
- Empty state messages
- Confirmation dialog text
- Validation messages
- Tooltip/helper text
- Status labels (e.g., "Active", "Retired")
- Filter/sort option labels
- Pagination labels

Messages originating outside the frontend may be mapped to stable frontend Translation keys, but raw user data must remain unchanged.

## What Must NOT Be Translated

- Video/Image/Performer titles, names, original titles
- User-entered notes and descriptions
- Category labels (user-managed data)
- File paths and folder names
- CSV column values and database fields
- Code identifiers, IDs, UUIDs
- Related item display names (user data)

## Current Coverage (Batch 34.16)

### Covered (using `t()`)

- App Shell / Sidebar: all labels, subtitle, expand/collapse
- Settings: section titles, descriptions, Appearance controls, Language controls, Optimization block titles, Data Safety action tiles
- Home: welcome heading, description, Get Started, Quick Actions, Continue Cataloging, Recently Added, summary card labels, loading/empty states
- Collection pages: page titles, subtitles, search placeholders, Filter/View/Sorting buttons, pagination, empty states, category filter labels

### Known Uncovered Areas (Deferred)

- **Collection filters/sorts**: sort option values (Last Added, Title A-Z, etc.), data filter options (All quality, SD, HD, etc.)
- **Collection table headers**: Title, Original Title, Duration, etc.
- **Categories page**: browse page labels, usage counts
- **Detail pages**: section headings, metadata labels, Tech Info labels, Related section titles
- **Form pages**: field labels, placeholders, validation messages, section headings
- **Category Management**: table columns, action buttons, confirmation text
- **Settings remaining**: Optimization mini-setting rows, App Information rows, runtime status labels, media root helper text
- **Dialogs/confirmations**: delete confirmation, restore confirmation, cache clear confirmation
- **Status chips**: "Active", "Retired", "Owned", "Censored"
- **Home quick action details**: already keyed but detail text is English-only in the data layer

## Language-Code and Identity Rules

- Normalize language identity consistently, normally to lowercase.
- Do not create built-in and custom entries with the same normalized code.
- `en` is reserved and protected; every other code is removable.
- Do not reject a custom code solely because it is not recognized by the platform.
- Do not silently remap a custom code such as `jp` to another code such as `ja`.
- Display labels are metadata only and must not be used as persistent identity.
- Existing metadata, overrides, selected-language state, and Translation values require non-destructive compatibility handling.

## CSV Workflow Reminder

1. Select English in App Language → Export Starter CSV (prefilled from English).
2. Edit the CSV: provide supported language metadata and text values, or modify English source values through the approved English workflow.
3. Import the CSV → preview → confirm → custom language added.
4. Select the new language in App Language.
5. Missing keys fall back to English automatically.

English reset restores the bundled original baseline without removing custom languages, custom-language overrides, catalog records, database identities, or performing an unapproved migration.

## QA Checklist for Future Batches

When adding new UI text:
- [ ] Add a stable translation key to `englishDictionary` in `src/lib/language.ts`.
- [ ] Use `t("key.name")` in the component instead of hardcoded English.
- [ ] Verify the key appears in exported CSV (run export and check).
- [ ] Do not translate user catalog data.

## Permanent Future-Feature Translation Gate

Every future feature batch must integrate its application-controlled frontend UI text into the stable Translation system and English baseline as part of that feature implementation. It must not defer fundamental Translation integration to Batch `42.11`.

Each feature must use stable keys, preserve user-entered data outside Translation, support custom-language fallback to English, and add only the keys required by that feature. Broad unrelated Translation refactoring remains prohibited.

Batch `42.11` performs final CSV refinement and compatibility, release-critical coverage, final fallback and missing-key regression, final shared-state coverage, restart/persistence verification, and release-facing Translation validation after feature and shared-UI work is stable.

## Deferred Full Sweep Plan

A full translation sweep batch will:
1. Audit all remaining hardcoded English strings in components.
2. Add translation keys for each uncovered area.
3. Update the English dictionary.
4. Re-export starter CSV with new keys.
5. Verify no layout breaks from longer translated text.

This sweep is deferred until:
- Major UI features (forms, detail pages, category management) are stable.
- No large UI refactors are planned in the near term.
- The key inventory is unlikely to churn significantly.
