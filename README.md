# Sakurava Desktop

Sakurava is a private-first, local-first offline Windows desktop application designed for managing, cataloging, and organizing local Videos, Images, and Performers.

All data, media path references, and user categories are stored on your local machine using an offline SQLite database. Sakurava does not communicate with the cloud, sync to external servers, track telemetry, or scrape data over the web without explicit permission.

> [!WARNING]
> **Active Development / Pre-Release Status:** This project is currently in active pre-release development. Features are added incrementally according to a strict development schedule. **It is not yet production-ready or suitable for general public installation.**

---

## Key Design Principles

* **Private-First & Local-First:** Your data belongs to you. All indexing, rating, category tagging, and file availability checks happen 100% locally.
* **Offline-First Privacy Model:**
  * **Local SQLite Database:** All catalog records are saved locally under `sakurava.sqlite` in the user's app data directory.
  * **No Telemetry / Analytics:** Sakurava does not capture, transmit, or share usage statistics or crashes with any remote server.
  * **No Automatic Cloud Scrapers:** No hidden cloud syncs or uncontrolled network fetches.
* **Tauri Sandbox:** Built on Tauri v2 to restrict access and enforce secure filesystem protocol boundaries on local directories.

---

## Who This Is For

Sakurava is designed for power users, collectors, and developers who:
1. Manage large personal archives of local videos, images, and performer files.
2. Demand absolute privacy and offline operation.
3. Want a fast, keyboard-friendly metadata cataloging tool without cloud-account locks or SaaS pricing models.

---

## Project Status & Roadmap

### Current Status
* **Version:** Pre-release / Development MVP
* **Active Batch:** **Batch 35.2 (Form System Finalization)** is currently in progress.
* **Feature Milestones:** 
  * Category Management features are completed up through Batch 16.3 (`post-mvp-16-3-delete-category-record-apply-v1`).
  * Database backup/restore routines and media path availability checks are fully operational.

### Development Roadmap
Development follows locked batches mapped out in our repository specifications. To avoid scope creep and preserve local-first stability, major feature batches (like related performer pickers, external media launch hooks, and gallery thumbnail builders) are planned sequentially. 

---

## Local Development & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (LTS recommended)
- [Rust toolchain](https://www.rust-lang.org/tools/install) (for Tauri compilation)
- Windows Build Tools (C++ build tools)

### 1. Install Dependencies
```powershell
npm.cmd install
```

### 2. Run Development Mode
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

Before staging or submitting code changes, please run the following verification checks:

* **Frontend Unit Tests (Vitest):**
  ```powershell
  npm.cmd run test
  ```
* **Frontend Production Build:**
  ```powershell
  npm.cmd run build
  ```
* **Rust Backend Tests (Cargo):**
  ```powershell
  Push-Location src-tauri; cargo test; Pop-Location
  ```
  *(Always run Rust tests inside the `src-tauri` directory, not the project root.)*

---

## Project Documentation Directory

Detailed specifications, safety reviews, and roadmap plans are grouped in the `docs/` folder:

### Core Roadmap & Architecture
* [Project status](docs/PROJECT_STATUS.md) | [Locked roadmap](docs/ROADMAP_LOCKED.md) | [PRD alignment and development plan](docs/11-prd-alignment-and-development-plan.md)
* [Agent instructions (AGENTS.md)](AGENTS.md) | [Agent Code handoff](docs/AGENT_CODE_HANDOFF.md) | [Git workflow](docs/WORKFLOW_GIT.md)

### Security & Data Safety Guidelines
* [Category Management safety](docs/10-category-management-safety.md) | [Backup/Restore UX Safety](docs/12-backup-restore-ux-safety.md) | [Settings persistence planning](docs/13-settings-persistence-planning.md)
* [Media Tech Info Availability & Safety](docs/38-media-tech-info-availability-safety-plan.md) | [Settings Info Architecture](docs/34-settings-page-v1-information-architecture.md)

### Feature Batch Planning
* **Category Management:** [Category Page Planning](docs/14-category-management-dedicated-page-planning.md) | [Form Picker Lockdown](docs/15-form-category-picker-lockdown-planning.md) | [Categories Sidebar Page](docs/16-categories-sidebar-page-planning.md)
* **Relations & Pickers:** [Related Performer Picker](docs/17-related-performer-picker-structure-planning.md) | [Related Performer Storage](docs/18-related-performer-storage-planning.md) | [Related Media Picker](docs/19-related-video-image-picker-structure-planning.md) | [Related Media Storage](docs/20-related-video-image-storage-planning.md)
* **Media & Gallery:** [Media File Status](docs/21-media-file-status-open-file-planning.md) | [External Media Open](docs/22-external-media-open-planning.md) | [Cover/Thumbnail Preview](docs/23-cover-thumbnail-full-size-preview-planning.md) | [Performer Mini Thumbnails](docs/24-performer-mini-thumbnail-storage-form-planning.md)
