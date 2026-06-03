# PUBLIC_DOCS.md

## 📖 Overview

Welcome to **Sakurava** – a local‑first, privacy‑first desktop application for managing **Videos**, **Images**, and **Performers**. This repository is intended for developers and contributors who want to explore, extend, or help improve the project.

## 🔎 Recommended Reading Order

1. **README.md** – Quick start, project description, and status.
2. **PUBLIC_DOCS.md** (this file) – Navigation guide for public documentation.
3. **docs/OSS_PUBLIC_READINESS_AUDIT.md** – Detailed audit of secrets, dummy data, and licensing before public release.
4. **docs/00-readme-index.md** – Curated index of all public‑facing docs.
5. **docs/CONTRIBUTING.md** – How to contribute, coding standards, and branch workflow.
6. **docs/SECURITY.md** – Security disclosure process.
7. **docs/ROADMAP.md** (if present) – Planned batches and milestones.

## 🛠️ Development Workflow

- Clone the repository.
- Install dependencies (`npm install` in the root, `cargo build` in `src-tauri`).
- Run the dev server: `npm.cmd run dev`.
- Execute tests: `npm.cmd run test` and `Push-Location src-tauri; cargo test; Pop-Location`.

## 🔐 Privacy & Security Model

- **Local‑first:** All data lives on the user's machine in a SQLite database.
- **No telemetry:** The app never sends usage data to external services.
- **No cloud sync:** Media files and catalog data are not uploaded.
- **Security disclosures:** See **SECURITY.md** for the private reporting channel.

## 📚 Additional Resources

- [License](LICENSE.md)
- [Contribution Guidelines](CONTRIBUTING.md)
- [Issue Templates](.github/ISSUE_TEMPLATE/)

---
*This document will be kept up to date as the project evolves. Contributions to improve documentation are welcome!*
