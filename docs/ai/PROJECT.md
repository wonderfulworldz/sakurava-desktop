# Sakurava Project

## Identity

Sakurava Desktop is a private-first, local/offline Windows desktop catalog for
Videos, Images, Performers, Categories, Credits, Glossary, and associated
metadata. It is intended for a non-cloud personal catalog workflow where
catalog data and referenced media remain under the operator's control.

## Product Direction

The application uses React and TypeScript in a Tauri Windows desktop shell with
SQLite-backed catalog data. The product direction favors local storage,
non-destructive data handling, explicit user-controlled features, compatibility
with existing catalog data, and clear separation between catalog records,
managed UI configuration, external media references, and generated managed
media.

The stable product vocabulary is Videos, Images, Performers, Categories,
Managed Categories, Record Categories, Credits, Glossary, Settings, and Catalog
Settings. User-entered catalog values are data, not interface Translation text.

## Stable Constraints

- MVP Categories are text labels stored in `categoriesJson`; Managed Categories
  are local suggestions/configuration and are not record truth.
- External video and image files remain referenced media. Sakurava's backup
  direction includes catalog data, relationships, settings, translations,
  public references, and managed mini images, but not full external media or
  disposable cache.
- Existing workflows and visual language are compatibility constraints. A
  redesign, package-format change, schema replacement, dependency strategy,
  or cloud/network capability requires a separately approved decision.
- Translation is for application-controlled presentation text. English is the
  built-in/default/source/fallback language; other languages are user-managed.
- Catalog identity exposed to users and spreadsheets uses public Sakurava Ref;
  technical database IDs remain internal.

## Release Direction

Sakurava evolves through explicitly approved, bounded batches. Product safety,
data preservation, compatibility, and evidence quality take priority over
unapproved polish or optimization. Historical execution memory and future
work are kept separate in the Project Brain.
