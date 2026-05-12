# Post MVP 0 Clean Baseline Audit

Date: 2026-05-13

## Scope

Batch 0 audited sample, mock, placeholder, demo, and stub references in:

- `src/lib/collectionData.ts`
- `src/lib/detailData.ts`
- `src/lib/formData.ts`
- `src/lib/homeData.ts`
- `src/pages/CollectionPage.tsx`
- `src/App.test.tsx`
- `src/backend/*.test.ts`

## Findings

### Test-only

- `src/App.test.tsx` uses `sample-id`, sample titles, placeholder labels, and persisted `*_test_001` records as route and integration test fixtures.
- `src/backend/repositories.test.ts` uses `sample-id` to verify disconnected repository errors.
- `src/backend/repositoryBehavior.test.ts` uses sample entity values in in-memory repository tests.
- `src/backend/validation.test.ts` uses sample entity values to verify normalization and validation behavior.

No production change required.

### UI fallback/static mock

- `src/lib/collectionData.ts` contains static sample collection records for browser-preview fallback.
- `src/lib/detailData.ts` contains static detail configs for browser-preview fallback and empty-runtime display.
- `src/lib/formData.ts` contains static edit-mode initial values for browser-preview fallback.
- `src/pages/CollectionPage.tsx` had empty-state copy that referenced mock items.

Fallback records remain available only for browser-preview/static test paths. Empty-state copy now references saved items instead of mock items.

### Production runtime risk

- Collection wrapper pages initialized from static sample configs before Tauri list commands resolved, which could briefly show sample records in a desktop runtime.
- Detail and edit form wrapper pages initialized from static sample configs before Tauri get commands resolved, which could briefly show sample detail/edit values in a desktop runtime.
- `src/lib/homeData.ts` exposed mock counts and placeholder recent items directly on the Home page.

Fixed with small runtime guards:

- Desktop collection pages now initialize to empty collection configs while list commands load.
- Desktop detail and edit form pages now show loading states while get commands load.
- Home summary counts now start at zero, quick action descriptions no longer reference route stubs, and placeholder recent/continue items were removed.

### Safe documentation-only

- Placeholder wording that describes unavailable MVP capabilities, disabled relation sections, disabled technical detection, or browser-preview-only save behavior is documentation/status copy, not sample data exposure.

## Changed Files

- `src/lib/homeData.ts`
- `src/pages/CollectionPage.tsx`
- `src/pages/VideoCollectionPage.tsx`
- `src/pages/ImageCollectionPage.tsx`
- `src/pages/PerformerCollectionPage.tsx`
- `src/pages/VideoDetailPage.tsx`
- `src/pages/ImageDetailPage.tsx`
- `src/pages/PerformerDetailPage.tsx`
- `src/pages/VideoFormPage.tsx`
- `src/pages/ImageFormPage.tsx`
- `src/pages/PerformerFormPage.tsx`
- `docs/audits/POST_MVP_0_CLEAN_BASELINE_AUDIT.md`

## Verification

Run after this audit:

- `npm.cmd run test`
- `npm.cmd run build`
- `npm.cmd run tauri build`
