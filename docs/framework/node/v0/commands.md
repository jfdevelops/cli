---
title: Command reference
description: Look up commands, options, terminal requirements, and exit codes.
order: 40
---

Run commands with `npx @jfdevelops/cli <command>`, or through your package manager once the CLI is a dependency of the project, for example `pnpm exec jfdevelops <command>`. The examples below write `jfdevelops <command>` for either form. `jfdevelops --help` and `jfdevelops <command> --help` list every option.

| Command | What it does | Needs a terminal |
| --- | --- | --- |
| `create [name]` | Create an app or library from a template | Yes, unless `--yes` |
| `create skills` | Register or scaffold skills in a library package and verify they are published | Yes |
| `init [directory]` | Adopt an existing project | Yes, unless `--yes` |
| `add` | Browse and choose an addition | Yes |
| `add -l, --list` | List compatible additions without changing anything | No |
| `add skill <name>` | Enable one skill from an installed package | Yes |
| `add addon <name>` | Adopt or install an integration and offer its skills | Yes |
| `add package <name> [--private \| --public]` | Scaffold a TypeScript library in the workspace, with `src/`, `test/`, and Vite+ tasks | Yes |
| `update [directory]` | Upgrade the CLI and refresh managed project setup | Yes |
| `skills [directory]` | Report whether enabled skills match installed packages and the shared skills on `main` | No |
| `skills sync [directory]` | Update skill copies to the installed versions and the current `main` | Yes |
| `skills update [skills...]` | Upgrade skill source packages, then sync | Yes |
| `skills outdated [directory]` | Compare skill copies with upstream `main` | No |

## Command requirements

Most commands fetch the shared convention skills from `https://github.com/jfdevelops/skills` on `main` with Git, so they need Git and network access. This table shows what each command needs:

| Command | `jfdevelops.json` | Git and network |
| --- | --- | --- |
| `create` | Must not exist | Yes |
| `create skills` | Not needed (needs npm instead) | No |
| `init` | Optional; `init` creates it | Yes |
| `add`, including `add --list` | Required | Yes |
| `update` | Required | Yes |
| `skills`, `skills sync`, `skills update` | Required | Yes |
| `skills outdated` | Not needed | Yes, unless no skills are installed |

`create` and `init` accept `--yes` so agents and scripts can run them without a terminal. In a terminal without `--yes`, they prompt and ignore the choice flags, including `--conflicts`. Other mutating commands refuse to run without a terminal and exit with code 1.

Every mutating command previews its changes as a file tree with an action label for each file; see [Read a planned change](skills.md#read-a-planned-change).

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Finished, including when nothing needed to change or you cancelled |
| 1 | Failed, finished with errors on some files, was run without a required terminal, or was given a rejected flag, argument, or unknown command |

Some commands add their own failures:

- `skills` exits with 1 when it cannot read the status, for example when there is no `jfdevelops.json` or `main` cannot be fetched. With `--check`, it also exits with 1 when anything needs syncing.
- `skills outdated` exits with 1 when the comparison fails. With `--check`, it also exits with 1 when compared skills differ.
- `create skills` exits with 1 when the publication check fails.

## `create [name]`

The optional argument names the project or its destination. `create my-project` creates `./my-project`, and a valid scoped name such as `@acme/site` names the package `@acme/site` in `./site`. Any other argument is the destination, and its last path segment is the package name. Use `.` to create the project in the current directory, named after that directory. The destination may already contain files; differing paths are offered as conflicts. A destination that already has `jfdevelops.json` is refused—use `init` to adopt that project instead.

The validity check uses the argument's last path segment, so `create apps/web` names the package `web` without asking. When that segment is not a valid package name, `create` asks only for the name, with the segment as the default, and with `--yes` it fails with "Invalid package name" instead. With no argument, it asks for the name and the destination.

The prompts run in this order: name, destination, app or library, **Monorepo** (apps) or **Do you want to add a package? (this makes the project a workspace)** (libraries), the workspace prompts, template, package manager, formatter, coding agents, and Git initialization. When Git is initialized it also offers to add a remote: paste an `https://`, `ssh://`, or `user@host:path` URL, or press Enter to skip. The URL is added as `origin` and nothing is pushed.

After you confirm, `create` writes the files, installs `@jfdevelops/cli` at the running version and `@jfdevelops/skills` at its latest release as exact development dependencies, and formats the files it wrote with the chosen formatter and ESLint. It then checks them and runs `build`, or `typecheck`, `test`, and `build` in a workspace. The shared convention skills it installs are every skill registered in `jfdevelops/skills` on `main`. `create` also writes `AGENTS.md`, and `CLAUDE.md` when Claude Code is selected.

Git is skipped with a warning when Git has no author or committer identity (`git var` is used, so environment variables count as well as `user.name` and `user.email`) or the destination already contains a `.git` entry (a file counts too, for example in a worktree). Otherwise `create` runs `git init -b main`, stages everything, and commits with `chore(init): initialize project`.

### Non-interactive flags

Pass `--yes` to apply the plan without prompts. The project name argument and `--kind` are required; other choices use the defaults below. Without a terminal, `--yes` is required. In a terminal without `--yes`, the choice flags are ignored and `create` prompts instead.

| Option | Default | Notes |
| --- | --- | --- |
| `--kind <app\|library>` | required | |
| `--template <name>` | the only template for that kind | Must match the kind |
| `--package-manager <name>` | `pnpm` | `pnpm`, `npm`, `yarn`, or `bun` |
| `--formatter <name>` | `prettier` | `prettier` or `biome` |
| `--agents <list>` | all agents | Comma-separated: `claude-code`, `codex`, `cursor`, `copilot` |
| `--git` / `--no-git` | initialize Git | |
| `--remote <url>` | none | Errors with `--no-git`, and is ignored whenever Git is skipped; accepts `https://`, `ssh://`, or `user@host:path` URLs |
| `--monorepo` | off | App workspaces only; errors with a library |
| `--workspace` | off | Library workspaces only; errors with an app |
| `--namespace <name>` | the scope of a scoped project name; otherwise `@<project>` for a library workspace or `<project>` for an app monorepo | `none` gives bare names |
| `--app-name <name>` | `web` | With `--monorepo` |
| `--apps-dir <path>` | `apps` | With `--monorepo` |
| `--libraries-dir <path>` | `packages` | With `--monorepo` or `--workspace` |
| `--packages <list>` | none / `core` for `--workspace` | Comma-separated library short names |
| `-y, --yes` | | Apply without confirming |
| `--conflicts <keep\|overwrite>` | `keep` | How to treat overwritable conflicts; applies only with `--yes` |

Example: `npx @jfdevelops/cli create my-app --kind app --yes`.

Templates:

| Template | Kind | Contents |
| --- | --- | --- |
| `node-app` | App | Private TypeScript application compiled for Node.js |
| `typescript-library` | Library | Publishable ESM library with type declarations |

Single-package projects build with `tsc`; workspaces use Vite+ (below). TypeScript is pinned to `^6.0.3`. Both include the selected formatter (Prettier or Biome) and an ESLint Stylistic policy that enforces the shared spacing and brace rules through `format` and `format:check` scripts.

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

Choosing a library asks **Do you want to add a package? (this makes the project a workspace)** first. No keeps a single package. Yes makes the project a private workspace root with only a libraries directory: you choose the namespace (default `@<project name>`, so `acme` gives `@acme/core`), the libraries directory (default `packages`), and then name each library in the same add-another loop. Libraries in a library workspace are publishable, and each is recorded as a library target in `jfdevelops.json`.

## `create skills`

| Option | Description |
| --- | --- |
| `--package <name>` | The package name of the target that owns the skills; otherwise the only named non-app package is used, or you choose |
| `--path <skill-directory>` | Register this directory, or scaffold a skill there when it has no `SKILL.md`; relative to the current directory or the package root |
| `-d, --directory <path>` | Project directory (default `.`) |

It needs a terminal and npm on `PATH`, and it does not need `jfdevelops.json`. See [authoring skills](authoring.md).

## `init [directory]`

Detects the project, confirms target types and integrations, lets you choose skills and the coding agents that load them, previews every change with conflicts, applies it after confirmation, and records the setup. It also adds development dependencies the root manifest does not have: `@jfdevelops/cli` at the running version, and `@jfdevelops/skills` at its latest release. Both are saved as exact versions. A later `update` (for `@jfdevelops/cli` and `@jfdevelops/skills`) or `skills update` (for `@jfdevelops/skills`) keeps an exact version exact when it upgrades; a range stays a range. Shared skill files still come from `main`, not from the installed package.

### Non-interactive flags

Pass `--yes` to apply without prompts. Without a terminal, `--yes` is required. In a terminal without `--yes`, the choice flags are ignored and `init` prompts instead. Omitted selection flags install or adopt everything available.

| Option | Default | Notes |
| --- | --- | --- |
| `--package-manager <name>` | detected | Required only when the package manager cannot be detected; a value that differs from the detected manager is an error |
| `--agents <list>` | all agents | Comma-separated: `claude-code`, `codex`, `cursor`, `copilot`. Interactive runs preselect the recorded agents, then the detected ones, then all |
| `--addons <list>` | all detected integrations | Comma-separated integration names, which must be detected. Recorded addons that are no longer detected are kept |
| `--skills <list>` | all available skills | Comma-separated skill names; use `package:name` when a name is provided by more than one package. The shared convention skills are always included |
| `-y, --yes` | | Apply without confirming |
| `--conflicts <keep\|overwrite>` | `keep` | How to treat overwritable conflicts; applies only with `--yes` |

Detected target kinds are accepted as-is. A kind is unknown when a package is private without a known app framework, or when it matches both kinds; with `--yes` an unknown kind fails, so run interactively. Example: `jfdevelops init --yes`.

## `add`

All `add` commands accept `-d, --directory <path>` (default `.`). They need `jfdevelops.json` (see [command requirements](#command-requirements)). `add` alone asks what you would like to add, offering only the kinds that are available.

- **`add -l, --list`** prints available skills with their source and the workspace packages that can use them, addons that are installed but not adopted or that can be installed, and whether `add package` is available. It never lists enabled skills or shared convention skills. Individual `@tanstack/*` and `@jfdevelops/*` libraries can also be added by package name.
- **`add skill <name>`** asks which source to use when more than one package or version provides the name. A skill that is already enabled points you to `skills sync`. Shared convention skills cannot be added this way; `skills sync` installs them.
- **`add addon <name>`** accepts an addon name (`convex`, `docs`, or `portless`), its package name, or an individual `@tanstack/*` or `@jfdevelops/*` library. An installed integration is adopted as is. Otherwise, in a project with several packages it asks where to install the package (docs always goes at the root), then confirms the install command. Convex and the libraries are runtime dependencies, and Portless and docs are development dependencies. Its skills are then offered, all preselected. If a later step fails or is cancelled, the package stays installed; run the command again to finish. See [Addons](addons.md).
- **`add addon docs`** installs `@jfdevelops/docs` and sets up the docs scripts, ignore entries, `docs/README.md`, and a docs workflow; see [Set up the docs addon](addons.md#set-up-the-docs-addon).
- **`add package <name>`** needs a workspace (`pnpm-workspace.yaml` or `package.json` workspaces) and a valid npm package name. It asks where to create the package, defaulting to the parent of the first `<directory>/*` workspace pattern (otherwise `packages`) plus the last segment of the name. It refuses a directory that is already recorded or not empty. It then asks whether the package should be published: the default is private when `jfdevelops.json` records an app target and public otherwise, matching `create`. Pass `--private` to add `"private": true` to its manifest, or `--public` to make it publishable, and the question is skipped; the two flags cannot be combined. The library has `src/`, `test/`, and Vite+ tasks. The command adds the directory to the workspace when no pattern covers it and records a `typescript-library` target. Run your package manager's install afterwards to link it.

## `update [directory]`

Needs `jfdevelops.json` and a terminal. The command runs in this order:

1. It previews upgrading `@jfdevelops/cli` to the latest release (a development dependency unless it is a runtime dependency) and asks for confirmation.
2. The installed release then refreshes the project:
   1. `skills update` for all skills, which confirms the package upgrades and then reviews the skill files.
   2. A full interactive `init`, which reviews targets, integrations, skills, and agents.
   3. Tooling regeneration, only for projects created with `create` whose recorded formatter is `prettier` or `biome` and whose targets have a template.
3. It runs the package manager's install after the tooling changes.

| Item | What `update` does |
| --- | --- |
| Application sources and tests, `README.md`, `.gitignore`, `pnpm-workspace.yaml` | Never regenerated |
| `src/` and `test/` stubs | Added only when missing |
| Other `package.json` fields, including `name`, `version`, `private`, `workspaces`, custom scripts, and dependencies | Kept |
| Generated scripts and tooling devDependency versions | Replace entries with the same name |

Adopted projects without template metadata keep their existing build tooling. Declining any review cancels the remaining steps, and earlier package upgrades and applied changes remain; run `update` again to retry.

## `skills [directory]`

Needs `jfdevelops.json`, but no terminal. It prints a table of each enabled skill's state, source package, and details, then lists the skills from installed packages that you could still enable. Shared convention skills are compared with the current `main` commit; other skills are compared with their installed package versions. See [Check skill status](skills.md#check-skill-status).

| Option | Description |
| --- | --- |
| `--check` | Exit with code 1 when anything needs syncing, for CI |

## `skills sync [directory]`

Needs a terminal and `jfdevelops.json`. It refreshes shared convention skills to the current `main` commit, installs shared skills that were newly added there, and updates other copies to the installed versions. It uses the coding agents recorded in `jfdevelops.json`; run `init` again to change them. It offers to remove skills whose package is gone, with every removal preselected, asks which version to use when a skill is installed in several versions (the default keeps the recorded one), previews the updates, and asks about each locally edited copy. See [Sync after an upgrade](skills.md#sync-after-an-upgrade).

## `skills update [skills...]`

Needs a terminal and `jfdevelops.json`. Use `-d, --directory <path>` to choose a project. Names that no enabled skill uses are rejected before anything is installed.

The command previews source-package upgrades to `latest`, warns that updating a source package updates all of its code, and asks for confirmation. Declining cancels the command. Multiple skills from the same package share one package upgrade per scope. Local `workspace:`, `file:`, `link:`, and `portal:` sources are synced without a registry update. An optional source dependency makes the command exit with 1 and an error before anything is installed; update that package with your package manager, then run `skills sync`. When shared convention skills are selected and the project declares `@jfdevelops/skills`, that package is upgraded to `latest` too, but the shared skill files still refresh from `main` during the sync.

It then runs a sync: a full sync, which also installs newly added shared skills, when you gave no names, and only the named skills' copies otherwise. Package upgrades change the manifest and lockfile even if the later file review is declined. See [Update skill sources](skills.md#update-skill-sources).

## `skills outdated [directory]`

Read-only comparison of installed `.agents/skills` resources against the registered skills on `jfdevelops/skills`'s `main` branch. Defaults to the current directory; needs no terminal or project configuration. Reports the upstream commit and the changed paths for each matching skill. Unmatched skills are reported as not compared.

`--check` exits with code 1 when compared skills differ; otherwise differences are informational. Comparison failures always exit with code 1. No skills installed, or no differences among compared skills, exits with code 0. Local edits count as differences. This command does not install updates.

## Next steps

- [Check and synchronize skills](skills.md).
- [Add addons](addons.md).
- [Understand `jfdevelops.json`](configuration.md).
