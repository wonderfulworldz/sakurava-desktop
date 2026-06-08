# Category Library UI Pattern v1

This document records reusable UI and UX principles extracted from the polished
Glossary Library page. It is a concept reference for future library-style pages,
not a copy-paste content template.

## 1. Purpose

Category Library UI Pattern v1 defines a consistent way to present local
reference libraries in Sakurava: a calm page header, focused edit form, compact
toolbar, readable hierarchy table, and predictable empty states.

The pattern should help future pages feel like part of the same product while
leaving each page free to keep its own fields, records, validation, commands,
and business rules.

## 2. What this pattern applies to

- Glossary Library style pages.
- Future Category Management polish.
- Local-first reference/library pages with searchable records.
- Pages that benefit from parent/child relationships, table hierarchy, compact
  toolbar filters, thumbnails, and form-driven CRUD.

## 3. What this pattern does NOT define

- Database schema.
- Tauri command shape.
- Storage model.
- Exact fields or validation rules.
- Category business rules.
- Record mutation behavior.
- Page-specific content, labels, or domain logic.

## 4. Page Header Pattern

- Use a catalog-like header: page title, short subtitle, and one primary action.
- Do not use a boxed hero or marketing-style intro.
- Keep the action aligned with the header, not buried inside the table toolbar.
- Use clear action text such as `Add Entry`, `Add Category`, or the page-specific
  equivalent.

## 5. Form Card Pattern

- Use a clean card below the header for create/edit work.
- Prefer a two-column layout for medium and larger screens, collapsing cleanly
  on narrow screens.
- Mark required fields with a visible asterisk next to the label.
- Keep CRUD buttons left-aligned and close to the form content.
- Place destructive actions such as delete in the edit form, not as noisy inline
  text actions in every table row.
- Preserve each page's unique fields and validation requirements.

## 6. Chip Input Pattern

- Use alias-style chips inside or directly under the input field.
- Support comma, Enter, and plus/add-button entry where the page needs multiple
  labels.
- Chips should be compact, readable, and removable.
- Avoid making chips look like unrelated filter chips; they belong to the field.
- Deduplicate chip values defensively when appropriate for the page.

## 7. Parent/Child Picker Pattern

- Picker rows should use clean white backgrounds with subtle hover and selected
  states.
- Form pickers should prioritize path awareness:
  `Parent > Child` on the left, compact role chip on the right.
- Role chips should be compact and natural, such as `Parent`, `Child`,
  `Sub-Parent`, or `N/A`.
- Do not stretch a role chip into a full-width gray bar.
- Keep parent/child selection logic page-specific.

## 8. Toolbar Pattern

- Use the compact toolbar order: `[Search] [Category/Filter] [Sort]`.
- Search should be the widest control.
- Category/filter controls should use a stable flex layout:
  icon, label, optional count badge, chevron.
- Count badges should be separate rounded-rectangle chips, not literal bracket
  text and not circular badges.
- Badge text must not overlap the label.
- Keep sort visually aligned with the other toolbar controls.

## 9. Active Filter Chips Row Pattern

- Show selected filters in a compact row under the toolbar.
- Keep chips short and scannable.
- Provide `Clear all filters` on the same row when active filters exist.
- Preserve full filter meaning in `title` or accessible labels when the visible
  chip text is abbreviated.
- Category path chips may use compact formatting such as:
  - `Cat: Parent`
  - `Cat: Par > Child`
  - `Cat: ... > Tes > Sub Child`

## 10. Table Pattern

- Use proportional fixed columns so key content remains stable.
- Keep cells compact.
- Give the definition, description, or body-text column the widest space.
- Avoid per-row text actions that compete with record content.
- Make row content easy to scan before edit.

## 11. Hierarchy Table Pattern

- Place expand/collapse chevrons at the far left.
- Use a subtle darker row background for parent rows.
- Start child indentation before the thumbnail/content group.
- Preserve the same table column sizing for parent and child rows.
- Keep hierarchy ordering logic separate from visual polish.

## 12. Thumbnail Pattern

- Thumbnails must be fixed square `1:1`.
- Parent and child rows should share the same thumbnail component and classes.
- Images should crop with object-cover behavior.
- Missing thumbnails should show a page-appropriate placeholder icon.
- Do not show `N/A` text inside image cells.
- Apply child indentation outside the thumbnail box so the thumbnail ratio cannot
  distort.

## 13. Action Pattern

- Prefer row click/edit behavior over inline text action clutter.
- Keep favorite/star actions compact where needed.
- Put delete and other destructive actions in the edit form with clear context.
- Avoid adding action columns unless the workflow genuinely needs them.

## 14. Empty/Null/N/A Rule

- Display `N/A` for missing text values rather than empty strings, null, or `0`.
- Do not use `N/A` inside image/thumbnail cells; use a placeholder icon there.
- Keep empty state messaging neutral and actionable.
- Invalid or missing optional data must not crash the page.

## 15. Typography/Button Consistency Rules

- Match catalog page tone: quiet, utilitarian, and scan-friendly.
- Keep headings proportional to the surface; table and card headings should not
  use hero-scale text.
- Use consistent rounded corners, border weights, and sakura accent treatment.
- Buttons should use stable height and clear icon/text alignment.
- Avoid negative letter spacing and viewport-scaled type.

## 16. Usage guidance for Category Management future polish

- Reuse the header, form card, toolbar, active-chip row, and table hierarchy
  principles where they fit Category Management.
- Keep Managed Categories and Record Categories conceptually separate.
- Do not let visual polish imply new category behavior, schema, or bulk mutation
  rules.
- Category Management may adapt fields and actions to its own safety model.
- Mass record category actions still require preview, counts, confirmation, and
  `categoriesJson`-only patches where applicable.

## 17. Regression risks

- Turning a stable toolbar button back into an input overlay can reintroduce
  label/count overlap.
- Reusing form picker rows in toolbar filters can make toolbar dropdowns too
  path-heavy.
- Indenting the thumbnail box itself can distort child row thumbnails.
- Replacing placeholder icons with `N/A` text makes image cells look broken.
- Adding inline row actions can clutter the hierarchy table.
- Over-abbreviating filter chips can hide important context if full paths are
  not preserved in tooltips or accessible labels.

## 18. Non-goals

- No schema changes.
- No backend or Tauri command changes.
- No new Category Management behavior.
- No prescribed exact field set.
- No global design-system rewrite.
- No requirement that future pages copy Glossary content, wording, or business
  logic.
