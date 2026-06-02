# Sakurava Desktop

Sakurava is a private-first, local-first offline Windows desktop application designed for managing, cataloging, and organizing Videos, Images, and Performers. 

The application is built on top of Tauri and React, storing all catalog metadata locally in an offline SQLite database. It prioritizes user privacy and runs entirely offline without cloud dependencies, user account synchronization, telemetry, or external web scraping.

> [!WARNING]
> **Active Development / Pre-Release Status:** This project is currently in active development. Features are being added and refactored incrementally according to a locked roadmap. It is not yet ready for production or general public usage.

---

## Technical Stack

- **Frontend:** React, TypeScript, Tailwind CSS, Vite
- **Desktop Runtime:** Tauri (v2)
- **Database:** SQLite (via Rust `rusqlite`)
- **Testing:** Vitest (Frontend), Rust native tests (`cargo test`)

---

## Local Development & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (LTS recommended)
- [Rust toolchain](https://www.rust-lang.org/tools/install) (for Tauri compilation)
- Windows Build Tools (C++ build tools)

### 1. Install Dependencies
Initialize node modules from the root directory:
```powershell
npm.cmd install
```

### 2. Running in Development Mode
You can run the web-only preview mode or the full Tauri desktop application:

* **Tauri Desktop Application (Recommended):**
  ```powershell
  npm.cmd run tauri dev
  ```
* **Web-Only Preview Mode:**
  ```powershell
  npm.cmd run dev
  ```

---

## Testing & Verification

Before proposing any changes, verify the codebase using the following commands:

* **Frontend Unit Tests:**
  ```powershell
  npm.cmd run test
  ```
* **Frontend Compilation/Build Check:**
  ```powershell
  npm.cmd run build
  ```
* **Rust Backend Tests:**
  ```powershell
  Push-Location src-tauri; cargo test; Pop-Location
  ```
  *(Always run `cargo test` inside the `src-tauri` directory, not the project root.)*

---

## Safety & Data Commitment Rules

To ensure repository safety and protect your private data, please adhere to the following rules before staging or committing any code:

1. **Do Not Commit Media Files:** Keep your personal videos, images, and performer pictures in directories outside the workspace or ensure they are excluded.
2. **Do Not Commit Active Databases:** The active SQLite database (`sakurava.sqlite`) and its backups must never be committed. They are excluded by `.gitignore` via the `.local` wildcard and folder structures.
3. **No Secrets or Credentials:** Since Sakurava is entirely local-first, do not introduce API keys, cloud tokens, passwords, or personal file system paths into the codebase.

---

## Project Documentation

Detailed design decisions, safety rules, and roadmap documentation are located under the `docs/` directory:

- [Agent instructions (AGENTS.md)](AGENTS.md)
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
- [Related Performer Storage planning](docs/18-related-performer-storage-planning.md)
- [Related Video/Image Picker Structure planning](docs/19-related-video-image-picker-structure-planning.md)
- [Related Video/Image Storage planning](docs/20-related-video-image-storage-planning.md)
- [Media File Status / Open File planning](docs/21-media-file-status-open-file-planning.md)
- [External Media Open planning](docs/22-external-media-open-planning.md)
- [Cover/Thumbnail Full Size Preview planning](docs/23-cover-thumbnail-full-size-preview-planning.md)
- [Performer Mini Thumbnail Storage/Form planning](docs/24-performer-mini-thumbnail-storage-form-planning.md)

### Current Development Checkpoint

Category Management is complete through Batch 16.3:
```text
post-mvp-16-3-delete-category-record-apply-v1
```

---

## Development Guidelines

- **Branch Workflow:** Use one branch per batch starting from a clean `main`.
- **No Auto-Commits:** Always ask the user for approval before executing any git commit commands.
- **Minimal Diffs:** Keep changes highly focused on the assigned batch. Avoid mixing unrelated refactors.
- **Aesthetics & UI Polish:** Follow the guidelines in `AGENTS.md`. Do not propose UI polish unless requested or required for correctness.
