# 28 - UI/UX V1 Audit and Prioritization Plan

## 1. Purpose

Batch 26.1 mengubah latest UI/UX Version 1 adjustment list menjadi roadmap yang aman, bertahap, dan bisa diverifikasi.

Dokumen ini adalah planning-only. Tidak ada implementasi UI, source code, runtime, database, schema, Tauri config, package config, atau dummy data cleanup dari batch ini.

## 2. Context

Latest completed checkpoint:

```text
post-mvp-25-7-image-gallery-qa-safety-review-v1
```

Image Gallery dapat diperlakukan sebagai post-MVP initial complete selama QA tetap clean. Source of truth Image Gallery tetap `galleryImagePathsJson`, `folderPath` tetap metadata/reference only, dan behavior direct-files-only harus dipertahankan.

Latest UI/UX V1 adjustment list yang diberikan user adalah active draft roadmap untuk UI/UX V1. Earlier atau superseded UI/UX V1 adjustment file harus diabaikan kecuali user secara eksplisit mempromosikannya lagi.

Logo folder mungkin ada di stash atau branch lain untuk Batch 26.2. Batch 26.1 tidak menyentuh logo assets.

## 3. V1 Principles

- Keep changes staged and reversible.
- Jangan mencampur App Shell, Home, Detail, Form, Settings, dan Category Management dalam satu implementation batch.
- Utamakan docs-only planning sebelum high-risk implementation.
- Hindari broad UI polish kecuali langsung terkait listed V1 usability issue.
- Preserve existing working Image Gallery behavior.
- Preserve existing CRUD/persistence behavior.
- Preserve `categoriesJson` sampai Category Management V1 data plan disetujui.
- Hindari schema changes kecuali planning batch eksplisit menyetujuinya.
- Jangan memperkenalkan recursive scanner atau live watcher behavior.
- Jangan memasukkan dummy data ke packaged installer setelah V1 cleanup.
- Hapus wording MVP/placeholder hanya dalam dedicated cleanup batch.

## 4. Must-have V1

- App Shell cleanup: custom Sakurava icon, remove offline-first info, collapsed/compact sidebar default, collapse control, functional footer/bottom status, dan Windows/page title sesuai page.
- Home cleanup: hapus top search/filter, ubah Continue Cataloging menjadi Last Edited, dan Recently Added memakai dedicated symmetric cards.
- Catalog toolbar planning dan implementation: Search, Filter, Sorting, View, default sorting last updated, dan view toggle satu tombol.
- Categories page cleanup: label/subtitle/button/stat/card cleanup, category card thumbnail concept, remove Open button, dan pagination jika diperlukan.
- Detail hero/metadata cleanup planning: hero field order, hidden normal metadata path fields, System Info summary, dan Image Gallery placement.
- Image Detail gallery placement adjustment: Gallery di bawah Hero dan di atas Metadata, initial load 2 rows, contoh 8x2.
- V1 placeholder/MVP text audit.
- Packaged install dummy data cleanup planning.

## 5. Should-have V1

- Related cards on Detail Pages, termasuk Related Videos dan Related Images untuk Performer detail.
- Category picker field redesign dengan searchable scrollable checkbox list dan selected chips.
- Related picker field redesign memakai UX model yang sama dengan Categories.
- Settings page information architecture agar menu-oriented, bukan panel/dashboard-oriented; embedded Manage Category / Category Management panel harus dihapus dan diganti dengan menu item/link ke dedicated Category Management page.
- Detail Thumbnail naming cleanup untuk mengganti Mini Thumbnail text jika relevan.
- Performer Personal/Physical field integration jika data-compatible tanpa schema risk.

## 6. Post-V1 / Deferred

- Multi-image picker.
- Recursive folder scanner.
- Advanced category hierarchy beyond simple parent category.
- Analytics.
- Internal media player.
- Large UI redesign outside listed V1 needs.

## 7. High-risk Items Requiring Separate Planning

- Functional spider chart untuk Rating Summary, termasuk dynamic 5, 6, atau lebih dimensions dan average/final score di center.
- Runtime Tech Info detection: duration, resolution, file size, dan file type.
- Category Management parent category, description, thumbnail, full CRUD, table/detail/pagination, dan removal of record-only concept. Semua CRUD dan dashboard penuh Category Management harus berada di dedicated Category Management page, bukan di Settings.
- Settings Import/Export.
- Bulk Editor.
- Theme selector.
- Language editor.
- Optimize selector, lazy loading, dan sejenisnya.
- Packaged install dummy data cleanup implementation.
- Semua schema/database changes.

## 8. Full Prioritization Table

| Area | User request | Recommendation | Priority | Risk level | Recommended batch | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| App Shell / Sidebar | Custom Sakurava icon | Implement setelah asset final tersedia | Must-have V1 | Low | 26.2 | Jangan touch logo asset di Batch 26.1. |
| App Shell / Sidebar | Remove offline-first info | Cleanup text/UI copy | Must-have V1 | Low | 26.2 | App tetap local/offline; hanya wording/info di UI yang disesuaikan. |
| App Shell / Sidebar | Sidebar default collapsed/compact | Implement sebagai scoped shell behavior | Must-have V1 | Medium | 26.2 | Pastikan navigation tetap jelas. |
| App Shell / Sidebar | Add/adjust collapse button | Implement bersama sidebar cleanup | Must-have V1 | Low | 26.2 | Tidak perlu Settings persistence kecuali batch terpisah. |
| App Shell / Sidebar | Functional footer/bottom bar | Tampilkan Local mode, Storage status placeholder, Last update placeholder | Must-have V1 | Medium | 26.2 | Jika status belum runtime-backed, label harus jujur sebagai placeholder. |
| App Shell / Sidebar | Update Windows/page title per page | Plan and implement scoped title update | Must-have V1 | Medium | 26.2 | Jangan ubah Tauri config tanpa batch eksplisit. |
| Home Page | Remove top search and filter | Cleanup Home-only controls | Must-have V1 | Low | 26.3 | Home search/filter adalah deferred item lama. |
| Home Page | Continue Cataloging becomes Last Edited | Rename and adjust data intent | Must-have V1 | Low | 26.3 | Jangan klaim real edit history jika data belum mendukung. |
| Home Page | Recently Added dedicated cards | Improve card structure with 1:1 thumbnail, title, type | Must-have V1 | Low | 26.3 | Preserve existing data source. |
| Catalog Page | Redesign controls into Search, Filter, Sorting, View | Plan first, implement next | Must-have V1 | Medium | 26.4, 26.5 | Keep existing filtering/sorting behavior unless explicitly changed. |
| Catalog Page | Filter groups: Quality, Categories, Rating, Year | Include in toolbar planning | Must-have V1 | Medium | 26.4, 26.5 | Validate available fields before implementation. |
| Catalog Page | Sorting separate or in control model | Decide in planning | Must-have V1 | Medium | 26.4 | Avoid mixing with Settings or detail pages. |
| Catalog Page | One filter/sort icon opens dropdown/panel/modal/canvas | Allow based on usability and implementation fit | Must-have V1 | Medium | 26.4, 26.5 | Pick one pattern and document behavior. |
| Catalog Page | View single toggle button grid/list | Implement scoped toggle UI | Must-have V1 | Low | 26.5 | Preserve current view state behavior unless planned. |
| Catalog Page | Default sorting last updated | Implement if data-compatible | Must-have V1 | Medium | 26.5 | Confirm current updated timestamp availability. |
| Catalog Page | Sorting options list | Implement data-compatible options | Must-have V1 | Medium | 26.5 | duration/count may differ by record type. |
| Categories Page | Remove pink catalog browse label | Cleanup copy | Must-have V1 | Low | 26.6 | Browsing page remains not management page. |
| Categories Page | Rename Open Category Management to Manage Category | Cleanup copy | Must-have V1 | Low | 26.6 | Preserve locked term Category Management in docs. |
| Categories Page | Manage Category button pink and same size style as catalog page | Scoped UI cleanup | Must-have V1 | Low | 26.6 | Avoid broad polish. |
| Categories Page | Shorten subtitle | Align with catalog page tone | Must-have V1 | Low | 26.6 | No behavior change. |
| Categories Page | Replace stats with type counts | Implement if counts already available | Must-have V1 | Medium | 26.6 | New stats: Total Category, Videos Category, Images Category, Performers Category. |
| Categories Page | Add suitable icons | Scoped UI addition | Must-have V1 | Low | 26.6 | Use existing icon library. |
| Categories Page | Improve category cards | Scoped card cleanup | Must-have V1 | Low | 26.6 | Keep browsing/discovery role. |
| Categories Page | Add thumbnail support concept | Document concept now, defer implementation if storage missing | Should-have V1 | Medium | 26.6 or 30.1 | Category thumbnail overlaps Category Management V1 data model. |
| Categories Page | Remove Open button | Cleanup card action | Must-have V1 | Low | 26.6 | Ensure card click/action remains clear if needed. |
| Categories Page | Add pagination if needed | Implement only if list size requires it | Should-have V1 | Medium | 26.6 | Keep separate from Category Management table pagination. |
| Detail Pages | Video/Image hero field order | Plan first, then implement hero cleanup | Must-have V1 | Medium | 27.1, 27.2 | Includes Code + Favorite alignment, Title, Original Title, Play where applicable, resolution label, Owned, Censored, Categories. |
| Detail Pages | Auto resolution label SD/HD/FHD/2K/4K | Treat as Tech Info dependent if runtime-detected | High-risk planning-needed | High | 27.5, 27.6 | If not available from stored data, do not fake. |
| Detail Pages | Move Duration to Tech Info | Plan and implement metadata cleanup | Must-have V1 | Medium | 27.1, 27.2 | Duration detection/enrichment is separate high-risk work. |
| Detail Pages | Hide Cover Path and Media Path from normal metadata | Move summary into System Info | Must-have V1 | Low | 27.2 | Do not remove stored paths. |
| Detail Pages | Rating Summary spider chart | Plan separately, then implement | Should-have V1 | High | 27.3, 27.4 | Functional chart must support dynamic dimensions. |
| Detail Pages | Tech Info functional fields | Plan separately, then implement if safe | Should-have V1 | High | 27.5, 27.6 | Avoid scanners/watchers and file mutation. |
| Detail Pages | Media File Status separate section removed | Merge simple status into System Info | Must-have V1 | Medium | 27.5, 27.6 | Preserve existing Media File Status safety. |
| Detail Pages | Related Videos/Images/Performers as small cards | Implement after layout cleanup | Should-have V1 | Medium | 27.7 | Preserve existing related storage semantics. |
| Detail Pages | Related Videos and Images for Performer detail | Implement if storage exists or after approved storage | Should-have V1 | Medium | 27.7 | Do not invent schema in detail UI batch. |
| Detail Pages | Thumbnail preview/view mode align with Picture Detail Gallery viewer | Reuse existing Image Gallery viewer behavior where applicable | Should-have V1 | Medium | 27.7 or 27.8 | Preserve Image Gallery behavior. |
| Image Detail | Gallery below Hero and above Metadata | Implement scoped placement adjustment | Must-have V1 | Low | 27.8 | Keep source `galleryImagePathsJson`. |
| Image Detail | Reduce default gallery load to 2 rows, example 8x2 | Implement only for Image Detail gallery | Must-have V1 | Low | 27.8 | Replace current 24 initial images if approved in batch. |
| Video Form Page | Categories field redesign | Plan first, then implement picker | Should-have V1 | Medium | 28.1, 28.2 | Keep Managed Categories-only direction and preserve `categoriesJson`. |
| Video Form Page | Separate Cover Path and File Path | Scoped form layout cleanup | Should-have V1 | Medium | 28.4 | File Path becomes section/order number 4 after Cover Path. |
| Video Form Page | Duration moves into Tech Info | Layout cleanup now; detection later | Should-have V1 | High | 28.4 and 27.5 | Do not fake runtime detection. |
| Video Form Page | Related item field same UX as Categories | Plan and implement after storage semantics are clear | Should-have V1 | Medium | 28.1, 28.3 | Do not auto-create related records. |
| Video Form Page | Remove unnecessary Open Performers button | Scoped cleanup | Should-have V1 | Low | 28.4 | Verify no workflow regression. |
| Image Form Page | Categories field redesign | Same as Video form | Should-have V1 | Medium | 28.1, 28.2 | Preserve `categoriesJson`. |
| Image Form Page | Separate Cover Path and Folder Path/Gallery Images | Scoped layout cleanup | Should-have V1 | Medium | 28.4 | Preserve Gallery Images behavior. |
| Image Form Page | Image Count moves into Tech Info | Layout cleanup; detection separate | Should-have V1 | High | 28.4 and 27.5 | Existing gallery count can be displayed if data-backed. |
| Image Form Page | Keep Gallery Images section | Preserve current feature | Must-have V1 | Low | 28.4 | Do not regress Image Gallery. |
| Image Form Page | Related item field same UX as Categories | Plan and implement after storage semantics are clear | Should-have V1 | Medium | 28.1, 28.3 | No schema invention. |
| Image Form Page | Rename Mini Thumbnail to Detail Thumbnail where applicable | Naming cleanup | Should-have V1 | Low | 28.4 | Keep locked terms elsewhere. |
| Performer Form Page | Categories field redesign | Same as other forms | Should-have V1 | Medium | 28.1, 28.2 | Preserve `categoriesJson`. |
| Performer Form Page | Rename Media to Cover | Scoped wording cleanup | Should-have V1 | Low | 28.6 | Confirm no locked term conflict. |
| Performer Form Page | Separate Mini/Detail Thumbnail section as number 3 | Layout cleanup | Should-have V1 | Medium | 28.6 | Align with existing mini thumbnail storage. |
| Performer Form Page | Summary changes: Debut Date, Retired Date, calculated Filmography/Pictorials | Plan before implementation | Should-have V1 | Medium | 28.5, 28.6 | Calculated fields depend on related Videos/Images. |
| Performer Form Page | Activate Personal and Physical fields and integrate into Detail | Implement if data-compatible | Should-have V1 | Medium | 28.5, 28.6 | Any missing storage needs separate data plan. |
| Performer Form Page | Related item field same UX as Categories | Plan and implement after storage semantics are clear | Should-have V1 | Medium | 28.1, 28.3 | Do not mutate related records from form. |
| Performer Form Page | Remove unnecessary Open Performers button | Scoped cleanup | Should-have V1 | Low | 28.6 | Verify no workflow regression. |
| Settings Page | Move status/info items to bottom status area | Plan IA first | Should-have V1 | Medium | 29.1, 29.2 | Avoid changing runtime behavior. |
| Settings Page | Menu-oriented Settings | Implement menu cleanup after IA | Should-have V1 | Medium | 29.1, 29.2 | Tools remain planning-heavy unless implemented safely. |
| Settings Page | Remove embedded Manage Category / Category Management panel | Replace full embedded panel/dashboard with one simple Category Management menu item and one clear button/link to the dedicated Category Management page | Should-have V1 | Medium | 29.1, 29.2 | Settings must not contain full Category Management CRUD, parent category, description, thumbnail, table, pagination, or selected category detail. |
| Settings Page | Tools: Backup/Restore | Keep existing safety rules | Should-have V1 | Medium | 29.1, 29.2 | Do not weaken restore confirmation. |
| Settings Page | Import/Export via table CSV | Separate planning-heavy item | High-risk planning-needed | High | Future dedicated batch | Data import/export can mutate records. |
| Settings Page | Bulk Editor Videos/Images/Performers | Separate planning-heavy item | High-risk planning-needed | High | Future dedicated batch | Requires preview/confirmation and rollback thinking. |
| Settings Page | Theme selector | Separate planning-heavy item unless UI-only safe | High-risk planning-needed | Medium | Future dedicated batch | Settings persistence implications. |
| Settings Page | Language editor | Separate planning-heavy item | High-risk planning-needed | Medium | Future dedicated batch | Localization architecture needed. |
| Settings Page | Optimize selector/lazy loading | Separate planning-heavy item | High-risk planning-needed | High | Future dedicated batch | Performance/runtime behavior. |
| Category Management | Parent Category | Separate planning and data model safety | High-risk planning-needed | High | 30.1, 30.2 | Current safety docs forbid parent/child in MVP. |
| Category Management | Description | Separate data plan | High-risk planning-needed | High | 30.1, 30.2 | Requires storage decision. |
| Category Management | Thumbnail | Separate data plan | High-risk planning-needed | High | 30.1, 30.2 | Requires explicit path/storage rules. |
| Category Management | Full CRUD | Plan then implement on the dedicated Category Management page | High-risk planning-needed | High | 30.1-30.4 | Must preserve record safety; do not implement full CRUD inside Settings. |
| Category Management | Remove record-only concept from Category Management V1 | Plan terminology/data transition | High-risk planning-needed | High | 30.1, 30.2 | Must not break Record Categories filtering. |
| Category Management | Table format and selected detail | Implement after data plan | High-risk planning-needed | High | 30.3, 30.4 | Used counts by Videos, Images, Performers. |
| Category Management | Pagination | Implement after table design | Should-have V1 | Medium | 30.4 | Keep separate from Categories browse page. |
| V1 Cleanup | Clear MVP/placeholder/draft notes | Audit first, cleanup next | Must-have V1 | Medium | 31.1, 31.2 | Avoid accidental removal of useful safety docs. |
| V1 Cleanup | Placeholder text audit | Dedicated audit and cleanup | Must-have V1 | Medium | 31.1, 31.2 | Do not mix with feature implementation. |
| V1 Cleanup | Dummy data empty/removed for packaged installer | Plan first, implement later | Must-have V1 planning; implementation high-risk | High | 31.3, 31.4 | Do not remove dummy data in Batch 26.1. |

## 9. Recommended Batch Sequence

1. 26.1 - UI/UX V1 Audit & Prioritization Plan
2. 26.2 - App Shell V1 Cleanup
3. 26.3 - Home Page V1 Cleanup
4. 26.4 - Catalog Toolbar V1 Planning
5. 26.5 - Catalog Toolbar V1 Implementation
6. 26.6 - Categories Page V1 Cleanup
7. 27.1 - Detail Page V1 Layout Planning
8. 27.2 - Detail Hero + Metadata Cleanup
9. 27.3 - Functional Spider Chart Rating Planning
10. 27.4 - Functional Spider Chart Rating Implementation
11. 27.5 - Tech Info + Media Status Planning
12. 27.6 - Tech Info + Media Status Implementation
13. 27.7 - Related Cards on Detail Pages
14. 27.8 - Image Detail Gallery Placement Adjustment
15. 28.1 - Form Field UX V1 Planning
16. 28.2 - Category Picker Field Redesign
17. 28.3 - Related Picker Field Redesign
18. 28.4 - Video/Image Form Layout Cleanup
19. 28.5 - Performer Form Data Completion Planning
20. 28.6 - Performer Form Data Completion Implementation
21. 29.1 - Settings Page V1 Information Architecture
22. 29.2 - Settings Page V1 Menu Cleanup
23. 30.1 - Category Management V1 Planning
24. 30.2 - Category Management Data Model Safety Plan
25. 30.3 - Category Management CRUD Implementation
26. 30.4 - Category Management Table + Detail + Pagination
27. 31.1 - V1 Placeholder / MVP Text / Dummy Data Audit
28. 31.2 - V1 Placeholder / MVP Text Cleanup
29. 31.3 - Packaged Install Dummy Data Cleanup Planning
30. 31.4 - Packaged Install Dummy Data Cleanup Implementation
31. 31.5 - UI/UX V1 Full Smoke Test + Release Candidate

## 10. Safety Rules

- Batch 26.1 docs-only: no source, runtime, database, schema, Tauri config, package/config, or asset changes.
- Do not implement UI changes from this plan until the matching implementation batch.
- Do not remove dummy data until the dedicated implementation batch.
- Preserve local/offline desktop behavior.
- Preserve existing CRUD and persistence behavior.
- Preserve Image Gallery behavior confirmed in Batch 25.7.
- Preserve `categoriesJson` for Record Categories until a Category Management V1 data plan explicitly approves a change.
- Category Management V1 data changes require separate planning and human review before implementation.
- Settings must not contain the full embedded Category Management panel/dashboard in UI/UX V1; Settings should only expose a simple Category Management section item with one clear navigation button/link to the dedicated Category Management page.
- Category CRUD, parent category, description, thumbnail, table, pagination, and selected category detail belong on the dedicated Category Management page, not inside Settings.
- Any mass record mutation must include preview, explicit confirmation, and narrow patches.
- Do not introduce scanners, watchers, file mutation, cloud sync, scraping, accounts, telemetry, or network dependency.
- Do not auto-commit, push, or create PR from this batch.

## 11. Non-goals

- No UI implementation.
- No source code edits.
- No tests edits.
- No database/schema changes.
- No Tauri config changes.
- No package/config changes.
- No logo asset changes.
- No dummy data removal.
- No runtime file metadata detection implementation.
- No spider chart implementation.
- No Settings tools implementation.
- No Category Management V1 implementation.

## 12. Acceptance Criteria

- Docs capture the latest UI/UX V1 adjustment list.
- Docs state earlier/superseded UI/UX V1 adjustment file is ignored.
- Requests are classified into Must-have V1, Should-have V1, Post-V1/deferred, and high-risk planning-needed groups.
- Recommended batch sequence from 26.1 onward is documented.
- Docs warn against mixing unrelated implementation areas.
- Docs state that Settings should remove the embedded Category Management panel and only link to the dedicated Category Management page.
- High-risk areas are identified: spider chart, Tech Info detection, Category Management V1 data model, Settings tools, Import/Export, Bulk Editor, and packaged dummy data cleanup.
- Image Gallery is preserved as post-MVP initial complete.
- Docs do not claim UI/UX V1 is implemented.
- Git diff shows documentation changes only.

## 13. Checkpoint

Expected checkpoint tag after merge:

```text
post-mvp-26-1-ui-ux-v1-audit-prioritization-plan-v1
```
