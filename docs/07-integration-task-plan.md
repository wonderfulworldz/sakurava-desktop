# 07 — Integration Only Task Plan

## 1. Purpose

Integration phase connects frontend static UI to backend persistence.

This phase must be small and sequential.

Do not integrate all entities at once.

## 2. Integration Order

Mandatory order:

1. Video CRUD basic.
2. Image CRUD basic.
3. Performer CRUD basic.

Do not continue to the next entity until the current entity passes manual check.

## 3. Recommended Branches

```text
integration/video-crud-basic
integration/image-crud-basic
integration/performer-crud-basic
```

## 4. Global Integration Rules

Do not:

- Redesign UI.
- Add native file picker.
- Add relation picker.
- Add advanced categories.
- Add backup/restore.
- Add scraping.
- Add media player.
- Add dashboard analytics.
- Change PRD scope.

## 5. Runtime Safety Requirement

Frontend must not crash in browser mode.

If Tauri API is unavailable:

- Use safe adapter.
- Show clear disabled state.
- Do not call invoke blindly.

Native Tauri mode must not show:

```text
Database unavailable
Cannot read properties of undefined (reading 'invoke')
```

## 6. Video CRUD Integration

### Scope

Connect Video UI to backend.

Required:

- Create Video.
- List Videos.
- View Video Detail.
- Edit Video.
- Save categories.
- Save favorite.
- Restart persistence.

### Do Not Touch

- Image integration.
- Performer integration.
- Visual redesign.
- Native file picker.
- Related Performer picker.
- Advanced categories.

### Acceptance Criteria

Video integration is done if:

- `/videos` loads real persisted data.
- `/videos/new` creates real Video.
- `/videos/:id` displays real Video.
- `/videos/:id/edit` edits real Video.
- Title validation works.
- Categories remain text labels.
- Favorite persists.
- Empty/broken cover uses placeholder.
- Restart app: Video remains.
- No raw ID/UUID visible.
- Browser mode does not crash.
- Native Tauri mode database works.

### Manual Check

1. Open app in browser dev mode.
2. Open `/videos`.
3. Open `/videos/new`.
4. Add title.
5. Add category.
6. Save.
7. Confirm item appears in `/videos`.
8. Open detail.
9. Confirm data.
10. Edit item.
11. Save.
12. Reopen edit form.
13. Confirm categories still text labels.
14. Restart native app.
15. Confirm data remains.
16. Confirm no broken image icon.

## 7. Image CRUD Integration

### Scope

Connect Image UI to backend after Video integration passes.

Required:

- Create Image.
- List Images.
- View Image Detail.
- Edit Image.
- Save categories.
- Save favorite.
- Save imageCount.
- Restart persistence.

### Do Not Touch

- Video redesign.
- Performer integration.
- Native file picker.
- Advanced categories.
- Related content.

### Acceptance Criteria

Image integration is done if:

- `/images` loads real persisted data.
- `/images/new` creates real Image.
- `/images/:id` displays real Image.
- `/images/:id/edit` edits real Image.
- Title validation works.
- Categories remain text labels.
- Favorite persists.
- Broken cover uses placeholder.
- Restart app: Image remains.
- No raw ID/UUID visible.
- Browser mode safe.
- Native mode safe.

## 8. Performer CRUD Integration

### Scope

Connect Performer UI to backend after Image integration passes.

Required:

- Create Performer.
- List Performers.
- View Performer Detail.
- Edit Performer.
- Save aliases.
- Save categories.
- Save favorite.
- Save filmography/pictorials count.
- Restart persistence.

### Do Not Touch

- Video/Image redesign.
- Relation picker.
- Advanced categories.
- Native file picker.

### Acceptance Criteria

Performer integration is done if:

- `/performers` loads real persisted data.
- `/performers/new` creates real Performer.
- `/performers/:id` displays real Performer.
- `/performers/:id/edit` edits real Performer.
- Name validation works.
- Aliases remain text labels.
- Categories remain text labels.
- Favorite persists.
- Broken cover uses placeholder.
- Restart app: Performer remains.
- No raw ID/UUID visible.
- Browser mode safe.
- Native mode safe.

## 9. Integration Test Commands

Recommended:

```text
npm run test
npm run build
```

If Tauri dev/build is available:

```text
npm run tauri dev
```

Build should be checked only after integration is reasonably stable.

## 10. Manual Smoke Checklist per Entity

For each entity:

- Add.
- Save.
- List.
- Detail.
- Edit.
- Save again.
- Reopen edit form.
- Restart app.
- Confirm data persists.
- Confirm categories remain labels.
- Confirm no raw JSON.
- Confirm no raw ID.
- Confirm placeholder image works.

## 11. Rollback Plan

If integration fails:

1. Stop.
2. Do not continue to next entity.
3. Identify if issue is:
   - Route.
   - Adapter.
   - Service.
   - Repository.
   - Form state.
   - JSON mapping.
4. Fix only the failing area.
5. If branch becomes messy, discard branch.
6. Restart with smaller task.

## 12. Remaining Risks

After integration:

- Installed app database path still needs deploy check.
- Some edge cases may remain.
- Search/filter/sort may still need refinement.
- Advanced features still postponed.
