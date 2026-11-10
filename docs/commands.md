# Command reference

Run commands with `npx @jfdevelops/cli <command>`, or `jfdevelops <command>` once the CLI is a dependency of the project. `jfdevelops --help` and `jfdevelops <command> --help` list every option.

| Command | What it does | Needs a terminal |
| --- | --- | --- |
| `create [name]` | Create an app or library from a template | Yes, unless `--yes` |
| `create skills` | Register or scaffold skills in a library package and verify they are published | Yes |
| `init [directory]` | Adopt an existing project | Yes, unless `--yes` |
| `add` | Browse and choose an addition | Yes |
| `add --list` | List compatible additions without changing anything | No |
| `add skill <name>` | Enable one skill from an installed package | Yes |
| `add addon <name>` | Adopt or install an integration and offer its skills | Yes |
| `add package <name>` | Scaffold a TypeScript library in the workspace, with `src/`, `test/`, and Vite+ tasks | Yes |
| `update [directory]` | Upgrade the CLI and refresh managed project setup | Yes |
| `skills update [skills...]` | Update all enabled skills or selected names from published packages | Yes |
| `skills [directory]` | Report whether enabled skills match installed versions | No |
| `skills sync [directory]` | Update skill copies to the installed versions | Yes |

`create` and `init` accept `--yes` so agents and scripts can run them without a terminal. Other mutating commands still refuse to run without a terminal and exit with code 1.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Finished, including when nothing needed to change or you cancelled |
| 1 | Failed, finished with errors on some files, or was run without a required terminal; `skills --check` also uses 1 when skills need syncing |

## `create [name]`

The optional argument is the package name. It is also the destination: `create my-project` creates `./my-project`, and `create @acme/site` names the package `@acme/site` in `./site`. Use `.` to create the project in the current directory, named after that directory. The destination may already contain files; differing paths are offered as conflicts. A destination that already has `jfdevelops.json` is refused—use `init` to adopt that project instead.

When the argument gives a valid package name, `create` does not ask for the name or destination. Otherwise it prompts for them, along with app or library, template, package manager, formatter, coding agents, and Git initialization. When Git is initialized it also offers to add a remote: paste an `https://`, `ssh://`, or `git@host:path` URL, or press Enter to skip. The URL is added as `origin` and nothing is pushed.

### Non-interactive flags

Pass `--yes` to apply the plan without prompts. `--kind` is required; other choices use the defaults below. Without a terminal, `--yes` is required.

| Option | Default | Notes |
| --- | --- | --- |
| `--kind <app\|library>` | required | |
| `--template <name>` | the only template for that kind | Must match the kind |
| `--package-manager <name>` | `pnpm` | `pnpm`, `npm`, `yarn`, or `bun` |
| `--formatter <name>` | `prettier` | `prettier` or `biome` |
| `--agents <list>` | all agents | Comma-separated: `claude-code`, `codex`, `cursor`, `copilot` |
| `--git` / `--no-git` | initialize Git | |
| `--remote <url>` | none | Only with Git initialization |
| `--monorepo` | off | App workspaces only |
| `--workspace` | off | Library workspaces only |
| `--namespace <name>` | same as interactive | Or `none` for bare names |
| `--app-name <name>` | `web` | With `--monorepo` |
| `--apps-dir <path>` | `apps` | With `--monorepo` |
| `--libraries-dir <path>` | `packages` | With `--monorepo` or `--workspace` |
| `--packages <list>` | none / `core` for `--workspace` | Comma-separated library short names |
| `-y, --yes` | | Apply without confirming |
| `--conflicts <keep\|overwrite>` | `keep` | How to treat overwritable conflicts |

Example: `jfdevelops create my-app --kind app --yes`.

Templates:

| Template | Kind | Contents |
| --- | --- | --- |
| `node-app` | App | Private TypeScript application compiled for Node.js |
| `typescript-library` | Library | Publishable ESM library with type declarations |

Both include the selected formatter (Prettier or Biome) and an ESLint Stylistic policy that enforces the shared spacing and brace rules through `format` and `format:check` scripts.

Before you confirm, `create` shows the layout it will write as a folder tree (generated agent and skill files are summarized) above the list of changes.

### Monorepo

Choosing an app also offers a **Monorepo** option (space to select, Enter to confirm). It creates a private workspace root named after the project, with the formatter, ESLint policy, and CLI dependency at the root, and the app in its own package. You are asked for:

| Prompt | Default | Result |
| --- | --- | --- |
| Namespace | the project name, or the scope of a scoped project name | `acme` gives package names such as `acme-web`; `@acme` gives `@acme/web`; `none` gives bare names |
| App name | `web` | The package name is the namespace plus this name, and the directory is `apps/<name>` |
| Apps directory | `apps` | Where apps live |
| Libraries directory | `packages` | Where libraries live |

After the directories, **Do you want to add a package?** lets you add libraries. Answer yes and type a name (the first has the grey default `core`); `create` shows where it will be created, such as `Added packages/utils (acme-utils)`, then asks whether to add another. Names that are invalid or already used in the workspace are asked for again. Libraries next to an app are private.

The workspace is defined in `pnpm-workspace.yaml` for pnpm and in the `workspaces` field of `package.json` for npm, yarn, and bun. The root `packageManager` field records the package manager version you created it with. Each package is recorded as a target in `jfdevelops.json`. Packages build on their own until you link them with workspace dependencies. Use `add package` to add libraries afterwards.

#### Packages and tasks

Workspaces use [Vite+](https://viteplus.dev). Every package has its sources in `src/` (a stub `index.ts`) and its tests in `test/` (a stub `index.test.ts` that imports from `vite-plus/test`), with a `tsconfig.json` that type checks both and a `tsconfig.build.json` for the compiled sources. Each package's `vite.config.ts` defines three cached tasks:

| Task | Library | App |
| --- | --- | --- |
| `build` | `vp pack` (tsdown) to `dist/index.mjs` and `dist/index.d.mts` | `tsc -p tsconfig.build.json` |
| `typecheck` | `tsc` | `tsc` |
| `test` | `vp test run` (Vitest) | `vp test run` |

Each task first builds the workspace packages its package depends on. The root `build`, `typecheck`, and `test` scripts run these tasks in every package with `vp run -r`. A task whose inputs have not changed replays from the Vite+ cache instead of running again.

#### CI

Workspaces also get `.github/workflows/ci.yml`. It installs Vite+, Node.js, and your package manager with `voidzero-dev/setup-vp`, then checks formatting. Next, `scripts/run-affected.mjs` runs `typecheck`, `test`, and `build` only in the packages a change affects. It compares with the pull request's base, or with the previous commit on pushes to `main`, and selects each package that has changed files, along with the packages that depend on it, through `vp run --filter "...{<directory>}"`. Changes only to Markdown, `.agents/`, `.claude/`, or `jfdevelops.json` run nothing. A change outside every package, such as the lockfile or root configuration, runs the tasks everywhere, and so does a base that cannot be compared. The workflow also restores and saves the Vite Task cache (`node_modules/.vite/task-cache`) between runs. Run `BASE_SHA=<commit> node scripts/run-affected.mjs typecheck test build` to do the same locally.

### Library workspace

Choosing a library asks **Do you want to add a package?** first. No keeps a single package, as before. Yes makes the project a private workspace root with only a libraries directory: you choose the namespace (default `@<project name>`, so `acme` gives `@acme/core`), the libraries directory (default `packages`), and then name each library in the same add-another loop. Libraries in a library workspace are publishable, and each is recorded as a library target in `jfdevelops.json`.

## `create skills`

| Option | Description |
| --- | --- |
| `--package <name>` | The workspace package that owns the skills; otherwise you choose, or the only library is used |
| `--path <skill-directory>` | Register this directory, or scaffold a skill there when it has no `SKILL.md` |
| `-d, --directory <path>` | Project directory (default `.`) |

See [authoring skills](authoring.md).

## `init [directory]`

Detects the project, confirms target types and integrations, lets you choose skills and the coding agents that load them, previews every change with conflicts, applies it after confirmation, and records the setup. It also adds the CLI as an exact development dependency when it is missing.

### Non-interactive flags

Pass `--yes` to apply without prompts. Without a terminal, `--yes` is required. Omitted selection flags install or adopt everything available.

| Option | Default | Notes |
| --- | --- | --- |
| `--package-manager <name>` | detected | Required only when the package manager cannot be detected |
| `--agents <list>` | all agents | Comma-separated agent names |
| `--addons <list>` | all detected integrations | Comma-separated integration names |
| `--skills <list>` | all available skills | Comma-separated skill names; use `package:name` when a name is provided by more than one package |
| `-y, --yes` | | Apply without confirming |
| `--conflicts <keep\|overwrite>` | `keep` | How to treat overwritable conflicts |

Detected target kinds are accepted as-is. If a target kind is unknown, run interactively. Example: `jfdevelops init --yes`.

## `add`

All `add` commands accept `-d, --directory <path>` (default `.`).

- **`add --list`** prints available skills with their source and the workspace packages that can use them, addons that are installed but not adopted or that can be installed, and whether `add package` is available.
- **`add skill <name>`** asks which source to use when more than one package or version provides the name.
- **`add addon <name>`** accepts `convex`, `portless`, or an individual `@tanstack/*` or `@jfdevelops/*` library. An installed integration is adopted as is; otherwise the package is installed with your package manager after confirmation (Portless as a development dependency). Its skills are then offered. Addon skills never appear elsewhere until the addon is enabled.
- **`add package <name>`** needs a workspace (`pnpm-workspace.yaml` or `package.json` workspaces). It suggests a directory from your workspace patterns, adds the directory to the workspace when no pattern covers it, and records the package as a library target. Run your package manager's install afterwards to link it.

## `skills [directory]`

| Option | Description |
| --- | --- |
| `--check` | Exit with code 1 when anything needs syncing, for CI |

## `skills sync [directory]`

Uses the coding agents recorded in `jfdevelops.json`; run `init` again to change them. Offers to remove skills whose package is gone, asks which version to use when a skill is installed in several versions, previews the updates, and asks about each locally edited copy. See [skills and conflicts](skills.md).

### `skills outdated [directory]`

Read-only comparison of installed `.agents/skills` resources against the registered skills on `jfdevelops/skills`'s `main` branch. Defaults to the current directory; requires Git and network access, but no terminal or project configuration. Reports the upstream commit and the changed paths for each matching skill. Unmatched skills are reported as not compared.

`--check` exits with code 1 when compared skills differ; otherwise differences are informational. Comparison failures always exit with code 1. No skills installed, or no differences among compared skills, exits with code 0. Local edits count as differences. This command does not install updates.

## `jfdevelops skills update [skills...]`

Updates all enabled skills by default, or only the named skills. Use `-d, --directory <path>` to choose a project. The command previews source-package upgrades to `latest`, asks for confirmation, then reviews the nested file tree and any locally edited skill copies before synchronizing them. Package upgrades change the manifest and lockfile even if the later file review is declined. Multiple skills from the same package share one package upgrade per scope. Local workspace/file sources are not upgraded from the registry. Optional source dependencies must be updated with the package manager before `skills sync`.

`init` installs the CLI and the shared skills package directly as development dependencies. Planned file changes use a nested tree with folder/file icons and action labels.

## `jfdevelops update [directory]`

Upgrades the project's `@jfdevelops/cli` dependency to the latest published release, then runs that installed release to refresh the project. It updates enabled skills, runs init to review newly detected integrations/skills, and regenerates tooling from the project's recorded templates and formatter. The planned file tree and local-edit conflicts are reviewed before tooling is written. Template entry/test stubs are only added when missing; existing application source, tests, README files, workspace membership, and unrelated manifest entries are preserved. Adopted projects without template metadata keep their existing build tooling. Dependencies are installed after tooling changes. Package and file updates already applied are retained if a later step is cancelled or fails; rerun update to retry.
