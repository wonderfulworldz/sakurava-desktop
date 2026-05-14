# Git Workflow

## Branching

- Use one branch per batch.
- Start from a clean `main` unless the user explicitly provides another base.
- Name branches after the batch purpose.
- Keep each branch scoped to the requested batch.

## Commit Rule

Do not commit without user approval.

Before proposing or making a commit:

```powershell
git status
git diff --stat
```

Review the changed files and confirm that the diff matches the batch scope.

## PR And Tag Workflow

Recommended workflow:

1. Start from clean `main`.
2. Create a batch branch.
3. Make scoped changes.
4. Run the appropriate verification commands.
5. Review `git status` and `git diff --stat`.
6. Ask the user before committing.
7. Open a PR after the user approves.
8. Merge after human review.
9. Tag the stable checkpoint after merge.

Checkpoint tags should use the established style:

```text
post-mvp-<batch>-<short-description>-v1
```

## Verification Commands

Use the verification set that matches the risk of the batch:

```powershell
npm.cmd run test
npm.cmd run build
Push-Location src-tauri; cargo test; Pop-Location
npm.cmd run tauri dev
```

Important:

- `cargo test` must be run from `src-tauri`, not from the project root.
- `npm.cmd run tauri dev` is an interactive dev command. Use it when runtime smoke testing is needed.
- Docs-only batches do not require the full verification set unless docs reference generated files, changed commands, or changed runtime behavior.

## Safety Notes

- Do not reset, checkout, or discard user changes unless the user explicitly asks.
- If the worktree is dirty before starting, identify whether the changes are related to the batch.
- Preserve unrelated user changes.
- Do not commit generated or build output unless the project already tracks it and the batch requires it.
