# DOCUMENTATION_ARCHIVE_POLICY.md

## Purpose

This document defines the policy for managing **historical** and **archival** documentation within the Sakurava repository. The goal is to keep the public‑facing documentation clean, concise, and English‑first, while preserving the original planning, design decisions, and internal discussions for reference.

## Scope

- Applies to all files under the `docs/` directory that are **not** part of the public documentation set (e.g., `README.md`, `PUBLIC_DOCS.md`, `OSS_PUBLIC_READINESS_AUDIT.md`).
- Covers Indonesian‑language planning documents, internal meeting notes, and any draft specifications that are not intended for external contributors.

## Guidelines

1. **Retention** – Historical documents **must not be deleted**. They are retained as an audit trail of design decisions.
2. **Visibility** – Archive files should be clearly marked in their headers with:
   ```
   <!-- ARCHIVE: This file is for internal reference only. -->
   ```
   and a brief note explaining its purpose.
3. **Organization** – All archive files remain in their original location. A top‑level index (`docs/00-readme-index.md`) will list them under an "Archive" section with links and a short description.
4. **Language** – Archive files may remain in Indonesian. No translation is required unless a future batch specifically targets translation.
5. **Contribution** – Contributors should **not** modify archive files unless they are correcting a factual error or updating a reference. Any changes must be clearly justified in the commit message.
6. **Searchability** – The `README.md` and `PUBLIC_DOCS.md` will link to the archive index, ensuring that external reviewers can locate the historical context if needed, but it will not be promoted as primary documentation.

## Enforcement

- Lint checks (e.g., a custom script) can flag any new file added to `docs/` that lacks a proper header indicating its status (public vs. archive).
- Reviewers should verify that any new public documentation files are added to the public index and that archive files remain appropriately marked.

---
*This policy may evolve as the project matures. Contributions to improve the policy are welcome.*
