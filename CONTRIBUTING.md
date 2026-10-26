# Contributing

Follow the required conventions linked from AGENTS.md, including the Git workflow for initialization and topic branches. Shared convention changes belong in `jfdevelops/skills`; regenerate snapshots with `pnpm skills:sync` and review the resulting diff. Keep agent-facing instructions independent of a particular agent's tool API.

Run `pnpm check` to verify skill copies and recorded provenance. The CLI is private until a real executable and its behavior tests exist. Publishing, commits, and pushes require user authorization.

Bootstrap scripts may regenerate owned files in these empty/new repositories. The future `init` command must instead inspect existing instructions, preview edits, preserve unrelated content, and detect managed-file changes before updating them.
