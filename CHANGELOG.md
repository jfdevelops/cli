# @jfdevelops/cli

## 0.3.0

### Minor Changes

- cbbbd6f: Let `jfdevelops create` take the package name as its argument, including scoped names, or `.` to create the project in the current directory, and skip the name and destination prompts when the name is valid.

## 0.2.0

### Minor Changes

- 49e51d1: Add `jfdevelops add` to extend a configured project. `add --list` shows compatible additions without changing anything. `add skill <name>` enables one skill from an installed package. `add addon <name>` adopts an installed integration, or installs Convex, Portless, or an individual TanStack or jfdevelops library after confirmation, and offers its skills. `add package <name>` scaffolds a TypeScript library in the workspace and registers its directory when needed. Running `add` alone browses the available additions. `skills sync` now asks which version to use when a skill is installed in more than one version.
- a45c912: Complete existing-project adoption by detecting supported integrations for explicit confirmation, always installing the published shared convention skills as required, previewing and retaining the exact CLI version as a development dependency, and recording the confirmed addons.
- f62df87: Add `jfdevelops create` with reviewed minimal TypeScript app and library templates, required shared skills, project configuration, Prettier or Biome formatting with shared ESLint Stylistic spacing enforcement, dependency installation and verification, optional Git initialization with a foundation commit, cancellation safety, and non-empty destination protection.
- 593d68c: Add `jfdevelops create skills` for library authors. It selects the owning package in a workspace (or `--package <name>`), offers existing `SKILL.md` directories for registration, scaffolds new skills from a name and description, or handles a single `--path <skill-directory>`. It records them in `jfdevelops.skills`, adds their directory to `files` when it would otherwise be left out, and then verifies the registrations and the `npm pack` contents so consumers receive every skill file. Repeat runs add no duplicate registrations.
- 8827667: Add `jfdevelops skills` to report whether each enabled skill is current, outdated after a package upgrade, locally modified, or missing its source package, with `--check` exiting 1 when anything needs syncing. Add `jfdevelops skills sync` to update unchanged skill copies to the installed versions, ask before replacing locally edited copies, offer to remove skills whose source package is gone, and record the synchronized versions. The AGENTS.md skill list is now sorted by name.

### Patch Changes

- a345b6e: Make projects from `jfdevelops create` pass their own `format:check` and lint:
  - Pin TypeScript 6.0 in templates, because typescript-eslint does not support TypeScript 7 yet.
  - Keep Prettier and Biome away from CLI-managed skill copies, `jfdevelops.json`, and lockfiles.
  - Format the generated files once after installing dependencies, and record their resulting hashes.
  - Write the AGENTS.md managed block with the blank lines Markdown formatters expect. Existing blocks are updated on the next `init`, `add`, or `skills sync`.
- 8037c5f: Report `jfdevelops <unknown>` as an unknown command with a pointer to `--help`, instead of "too many arguments".
- 5276f04: Document getting started, every command with its terminal requirements and exit codes, skill updates and conflicts, `jfdevelops.json` and its compatibility policy, and authoring library skills.
- 67ed9dd: Run package managers and Git through a shell on Windows so `init`, `create`, and `add addon` can install dependencies and verify projects there; Node refuses to launch the package managers' `.cmd` shims directly.

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
