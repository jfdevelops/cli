---
title: Getting started
description: Create a project, adopt an existing one, and keep its skills current.
order: 30
---

`@jfdevelops/cli` sets up projects with the shared jfdevelops convention skills and the agent skills your dependencies publish. It runs on Node.js 22.12.0 or newer with npm, pnpm, yarn, or bun.

In this guide you will:

- Create a new app or library.
- Adopt an existing repository.
- Check and refresh installed skills.

Interactive file changes are previewed before confirmation. With `--yes`, `create` and `init` apply without prompting. Cancellation stops the remaining work and does not roll back earlier installs; see the retained installs described for [`add`](commands.md#add), [`update`](commands.md#update-directory), and [`skills update`](commands.md#skills-update-skills).

Agents and scripts can run `create` and `init` with `--yes` and flags instead of prompts—for example `npx @jfdevelops/cli create my-app --kind app --yes` or `npx @jfdevelops/cli init --yes`. See [Command reference](commands.md) for the flag defaults.

## Start a new project

```sh
npx @jfdevelops/cli create my-project
```

Pass `.` instead of a name to create the project in the current directory, named after it. A valid scoped name such as `@acme/site` is the package name and creates the project in `./site`. Any other argument is the destination, and its last path segment is the package name (`create apps/web` names the package `web` without asking). `create` asks for the name only when that segment is not a valid name, and with `--yes` it fails with "Invalid package name" instead. With no argument, it asks for both. It then asks whether the project is an app or a library, whether to make an app a **Monorepo** or add a package to a library, the template, package manager, formatter (Prettier or Biome), coding agents, and whether to initialize Git, with an optional remote URL. It then:

1. Writes the template, every shared convention skill from `jfdevelops/skills` on `main`, `AGENTS.md`, `CLAUDE.md` when Claude Code is selected, and `jfdevelops.json`.
2. Installs dependencies, including the exact CLI version as a development dependency so later commands use the same CLI, and the latest `@jfdevelops/skills` release.
3. Formats the files it wrote with the chosen formatter and ESLint and checks them, then runs `build`, or `typecheck`, `test`, and `build` in a workspace.
4. If chosen, initializes Git on `main` with the commit `chore(init): initialize project`, and adds a pasted remote URL as `origin` without pushing. Git is skipped with a warning when Git has no author or committer identity (environment variables count as well as `user.name` and `user.email`) or the destination already contains a `.git` entry.

The destination may contain files: differing paths go through conflict review. A destination with `jfdevelops.json` is refused; use `init` instead. Before you confirm, `create` shows the folder tree it will write. For an app you can also choose **Monorepo**, which creates a workspace with the app in `apps/` and libraries in `packages/`. A library project can add more packages too, which makes it a workspace of libraries. Both ask you to name each package as you go; see [the `create` command](commands.md#monorepo).

## Adopt an existing project

```sh
npx @jfdevelops/cli init
```

`init` works through these steps:

1. Detects the package manager (and asks when it cannot), the workspace packages, and whether each is an app or a library. It asks for unknown kinds and confirms the detected ones.
2. Detects integrations (Convex, Portless, docs, and individual TanStack and jfdevelops libraries) and preselects them for adoption. With `--yes` and no `--addons`, it adopts every detected integration.
3. Shows the shared convention skills, which are always installed, and lets you choose skills from your installed dependencies.
4. Asks which coding agents load the skills (Claude Code, Codex, Cursor, GitHub Copilot), preselecting those already recorded, then those whose files exist.
5. Previews every change, with conflicts shown as diffs for you to decide.
6. After you confirm, installs one copy of each skill in `.agents/skills`, adds a marked block to `AGENTS.md` (creating it if needed), adds a short pointer block to `CLAUDE.md` when Claude Code is selected and to existing `GEMINI.md` and `.github/copilot-instructions.md`, adds `@jfdevelops/cli` at this version and `@jfdevelops/skills` at its latest release as development dependencies when the project lacks them, and records the setup in `jfdevelops.json`.

`init` replaces a file you edited, or one the CLI does not manage, only when you choose to replace it in conflict review or pass `--conflicts overwrite` with `--yes`. It updates and deletes unchanged managed files, and edits the marked blocks in files you own, without a per-file prompt; an interactive run still asks you to confirm the whole change. Run it again at any time; with nothing to change it reports that the project is already up to date. To finish docs setup after `init` adopts the docs addon, see [Addons](addons.md#finish-an-unfinished-docs-setup).

## What ends up in your project

| Path | Purpose | Owner |
| --- | --- | --- |
| `.agents/skills/<name>/` | The only full copy of each skill, read natively by Codex, Cursor, and GitHub Copilot and linked from `AGENTS.md` | CLI |
| `.claude/skills/<name>/SKILL.md` | A stub per skill when Claude Code is selected: the same frontmatter, pointing to the copy in `.agents/skills` | CLI |
| `AGENTS.md` | Your instructions plus a marked block listing enabled skills | You, except the marked block |
| `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md` | A pointer block to `AGENTS.md`, added when the file exists (and to `CLAUDE.md` whenever Claude Code is selected) | You, except the marked block |
| `jfdevelops.json` | The recorded setup; see [configuration](configuration.md) | CLI |

Commit all of these. Skill copies are files in your repository so every collaborator and agent sees the same instructions without any global setup.

## Keep it current

- `jfdevelops skills` reports whether enabled skills match your installed packages and the current `jfdevelops/skills` `main`. See [skills and conflicts](skills.md).
- `jfdevelops skills sync` updates copies after a dependency upgrade or a new commit on `main`, and installs newly added shared skills.
- `jfdevelops skills update` upgrades skill source packages to their latest releases, then syncs.
- `jfdevelops update` upgrades the CLI and refreshes the setup.
- `jfdevelops add` enables another skill, adopts an integration, or adds a workspace package. See [Addons](addons.md).

See the [command reference](commands.md) for every command and option.

## Next steps

- [Install the CLI](installation.md).
- [Read the command reference](commands.md).
- [Manage skills and conflicts](skills.md).
- [Adopt addons](addons.md).
