# Contributing to Sakurava

Thank you for your interest in contributing to Sakurava! We welcome contributions that align with our core project philosophy and technical roadmap.

---

## Code of Conduct & Philosophy

Sakurava is a **private-first, local-first, entirely offline** desktop application. To preserve user trust and security, all contributions must adhere to the following rules:

1. **No Cloud Dependencies:** Do not introduce cloud storage, online account sync, telemetry, analytics, tracking, or network-dependent web scrapers.
2. **Offline-First:** All features must operate entirely locally on the user's machine, storing data in the local SQLite database.
3. **Data Safety First:** Any operation that modifies the database schema, batch mutates record categories, or performs backup/restore must strictly follow the safety policies documented in the `docs/` folder (such as `10-category-management-safety.md` and `12-backup-restore-ux-safety.md`).

---

## Technical Stack

- **Frontend:** React (v19), TypeScript, Tailwind CSS, Vite
- **Desktop Runtime:** Tauri (v2)
- **Database:** SQLite (via Rust `rusqlite` crate)
- **Testing:** Vitest (Frontend), Cargo (Rust Backend)

---

## Development Workflow

1. **Start from clean `main`:** Keep your local `main` branch synchronized with the upstream repository.
2. **Use Single-Topic Branches:** Create a new branch for each individual feature, bug fix, or documentation update.
3. **Keep Diffs Scoped:** Keep pull requests minimal, focused, and reviewable. Avoid mixing unrelated refactors into a feature branch.
4. **Follow the Lint & Format Guidelines:** Ensure your TypeScript/JavaScript matches the existing style. Ensure Rust code is formatted via `cargo fmt`.

---

## Building and Running Tests

Before submitting a Pull Request, please run all available verification checks:

### Frontend Tests
Run Vitest to verify all frontend tests pass:
```powershell
npm.cmd run test
```

### Build Verification
Ensure the frontend builds successfully:
```powershell
npm.cmd run build
```

### Backend Rust Tests
Run Rust tests from the `src-tauri` subdirectory:
```powershell
Push-Location src-tauri; cargo test; Pop-Location
```

---

## Pull Request Guidelines

- Provide a clear, concise description of the changes made and the problem solved.
- Ensure all tests pass and there are no compilation or type errors.
- Do not check in private SQLite databases, logs, personal media paths, or configuration files (check `git status` before committing).
