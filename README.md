# Sakurava Desktop

Sakurava is a local/offline Windows desktop app for managing Videos, Images, and Performers.

## Stack

- React
- TypeScript
- Tailwind CSS
- Tauri
- SQLite
- Vitest

## Local Development

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run tauri dev
```

## Verification

```powershell
npm.cmd run test
npm.cmd run build
Push-Location src-tauri; cargo test; Pop-Location
```

Run `cargo test` from `src-tauri`, not from the project root.

## Project Docs

- [Agent instructions](AGENTS.md)
- [Agent Code handoff](docs/AGENT_CODE_HANDOFF.md)
- [Project status](docs/PROJECT_STATUS.md)
- [Locked roadmap](docs/ROADMAP_LOCKED.md)
- [PRD alignment and development plan](docs/11-prd-alignment-and-development-plan.md)
- [Git workflow](docs/WORKFLOW_GIT.md)
- [Category Management safety](docs/10-category-management-safety.md)
- [Backup/Restore UX Safety](docs/12-backup-restore-ux-safety.md)
- [Settings persistence planning](docs/13-settings-persistence-planning.md)
- [Category Management dedicated page planning](docs/14-category-management-dedicated-page-planning.md)
- [Form Category Picker Lockdown planning](docs/15-form-category-picker-lockdown-planning.md)
- [Categories Sidebar Page planning](docs/16-categories-sidebar-page-planning.md)
- [Related Performer Picker Structure planning](docs/17-related-performer-picker-structure-planning.md)

## Current Status

Category Management is complete through Batch 16.3, with the latest known category checkpoint:

```text
post-mvp-16-3-delete-category-record-apply-v1
```

Category Management safety documentation is complete through Batch 17.1 if that checkpoint has been merged.

## Development Rules

- Keep one branch per batch.
- Do not commit without user approval.
- Keep diffs scoped to the requested batch.
- Treat the docs above as compressed project memory.
- Do not change category behavior without following `docs/10-category-management-safety.md`.
- Do not propose UI polish by default unless requested or blocking usability.
