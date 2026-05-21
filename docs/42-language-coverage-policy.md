# 42 - Language Coverage Policy

## Status

Locked as of Batch 34.16. Full translation sweep deferred until major UI/features stabilize.

## Core Rules

1. **All future static UI/chrome text must use translation keys** via `t("key.name")`.
2. **User catalog data is never translated** — titles, names, notes, categories, file paths, CSV values.
3. **English is the only built-in source/fallback language.** English text lives in `englishDictionary` in `src/lib/language.ts`.
4. **Custom languages use the CSV workflow** — export starter/edit CSV, fill in translations, import.
5. **Missing custom text falls back to English** — incomplete languages are allowed.
6. **English cannot be edited, imported, replaced, or removed** via the language CSV system.

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

## What Must Be Keyed (Eventually)

All static UI text that is visible to the user and is not catalog/user data:
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

## CSV Workflow Reminder

1. Select English in App Language → Export Starter CSV (prefilled from English).
2. Edit the CSV: change Language Code/Name, fill in Text column.
3. Import the CSV → preview → confirm → custom language added.
4. Select the new language in App Language.
5. Missing keys fall back to English automatically.

## QA Checklist for Future Batches

When adding new UI text:
- [ ] Add a stable translation key to `englishDictionary` in `src/lib/language.ts`.
- [ ] Use `t("key.name")` in the component instead of hardcoded English.
- [ ] Verify the key appears in exported CSV (run export and check).
- [ ] Do not add Indonesian translations unless specifically requested — Indonesian is a custom/bundled pack.
- [ ] Do not translate user catalog data.
- [ ] Run `npm run test` to verify the English dictionary coverage test passes.

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
