# @jfdevelops/cli

## 0.1.0

### Minor Changes

- 72ca375: Apply change plans file by file with atomic writes, require a keep or overwrite decision for every conflict, refuse files edited since planning or reached through links outside the project, report applied, skipped, and failed files, and write `jfdevelops.json` only after validating it.
- 3a9a2a8: Plan managed-file changes before writing anything: classify each file as create, update, unchanged, adopt, delete, forget, or conflict using recorded hashes, limit removals to the owners being planned, and build per-agent install files for discovered skills.
- 3a201af: Add the `jfdevelops` executable with `--help` and `--version`.
- d64e195: Add `jfdevelops init` to adopt an existing project: confirm detected targets, choose skills from installed packages, review every planned change with diffs and conflict decisions, then install skill copies for each agent, maintain a managed skill list in `AGENTS.md` and pointers in existing agent instruction files, and record the setup in `jfdevelops.json`. Cancelling before confirmation writes nothing, and repeat runs report when the project is already up to date.
- e807cec: Define and validate the `jfdevelops.json` project configuration, covering generator, project, targets, addons, formatter, skill sources, and managed-file hashes.
- 3afa17d: Detect a project's package manager, workspace packages, app and library targets, existing agent instruction files, and `jfdevelops.json` configuration, reporting conflicting signals as warnings instead of guessing.
- d3fbada: Discover skills declared in installed packages' `jfdevelops.skills` metadata and build a catalog per project scope, reporting invalid metadata, missing dependencies, and same-named skills from different sources instead of choosing one.

### Patch Changes

- 3e2ad2c: Check out files with LF line endings so recorded skill digests match on Windows.
- 3a201af: Publish releases to npm with provenance when the release pull request merges, and verify the packed executable in CI.
- 6a20828: Manage versions and the changelog with Changesets, open release pull requests from `main`, and run CI checks on Linux, Windows, and macOS with Node.js 22 and 24.
- 3e2ad2c: Add TypeScript type checking and Vitest tests to `pnpm check`.
