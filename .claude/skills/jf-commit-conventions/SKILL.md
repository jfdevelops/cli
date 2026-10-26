---
name: jf-commit-conventions
description: Prepare or review jfdevelops commit messages, staged changes, and commit scope. Read before staging for a commit or making a commit; this skill does not authorize Git mutations.
---

# Commit conventions

Read the target repository's Git instructions and inspect the current branch and worktree. Commit only when the user has authorized it. Preserve unrelated staged and unstaged changes; stage explicit paths for the intended commit. Branch creation and pushing require their own applicable authorization.

Use a subject-only message in the form `type(scope): summary`. Use a lowercase, outcome-focused summary and a scope naming the affected area, such as `skills`, `discovery`, `config`, or `auth`. Types are `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`, `ci`, and `perf`.

Examples:

```text
feat(discovery): find skills declared by installed packages
fix(config): preserve existing project options
docs(skills): explain package-owned skill discovery
```

Use one cohesive behavior change per commit. Include its directly related tests and documentation. Split unrelated changes instead of describing several independent tasks in one subject.

Use no attribution or session trailers. A body is appropriate only when explicitly requested or required by the target repository's instructions. Existing explicit project rules and current user instructions govern conflicts with these shared defaults.

Before committing, review the staged diff and run the relevant configured checks. Report the actual outcome and commit identifier after success. A prepared message or staged diff is not a completed commit.
