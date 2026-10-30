# Contributing

Follow the required conventions linked from AGENTS.md, including the master `jf-git` skill before any Git decision. Read this repository's conventions before its branch, commit, or PR references. Shared convention changes belong in `jfdevelops/skills`; regenerate snapshots with `pnpm skills:sync` and review the resulting diff. Keep agent-facing instructions independent of a particular agent's tool API.

Run `pnpm check` to typecheck, run the Vitest suite, and verify skill copies and recorded provenance. Source lives in `src/` with tests beside it as `*.test.ts`. The CLI is private until a real executable and its behavior tests exist. Publishing, commits, and pushes require user authorization.

Bootstrap scripts may regenerate owned files in these empty/new repositories. The future `init` command must instead inspect existing instructions, preview edits, preserve unrelated content, and detect managed-file changes before updating them.

Add a changeset with `pnpm changeset` to every pull request that changes CLI behavior; use `pnpm changeset --empty` for changes without release impact. CI runs the checks on Linux, Windows, and macOS with Node.js 22 and 24, and requires a changeset on pull requests. Merges to `main` open or update the `chore(release): version packages` pull request; see [.changeset/README.md](.changeset/README.md).
