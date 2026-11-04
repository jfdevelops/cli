# Getting started

`@jfdevelops/cli` sets up projects with the jfdevelops conventions and the agent skills your dependencies publish. It runs on Node.js 22.12.0 or newer with npm, pnpm, yarn, or bun.

Every command that changes files shows the full plan first and writes nothing until you confirm. Cancelling (Escape or Ctrl+C) at any prompt leaves the project untouched. The one exception is `add addon`: when you confirm installing a missing package, the install happens before its skills are chosen, and the command tells you if you cancel afterwards.

## Start a new project

```sh
npx @jfdevelops/cli create my-project
```

Pass `.` instead of a name to create the project in the current directory, named after it. `create` asks for the package name only when you do not give one, then asks whether it is an app or a library, the template, package manager, formatter (Prettier or Biome), and whether to initialize Git. It then:

1. Writes the template, the required convention skills, `AGENTS.md`, and `jfdevelops.json`.
2. Installs dependencies, including the exact CLI version as a development dependency so later commands use the same CLI.
3. Formats the generated files, then runs `format:check` and `build`.
4. Optionally initializes Git on `main` with the commit `chore(init): initialize project`, and adds a pasted remote URL as `origin` without pushing.

The destination must be empty or not exist yet. Before you confirm, `create` shows the folder tree it will write. For an app you can also choose **Monorepo**, which creates a workspace with the app in `apps/` and libraries in `packages/`. A library project can add more packages too, which makes it a workspace of libraries. Both ask you to name each package as you go; see [the `create` command](commands.md#monorepo).

## Adopt an existing project

```sh
npx @jfdevelops/cli init
```

`init` detects the package manager, workspace packages, whether each is an app or a library, supported integrations (Convex, Portless, individual TanStack and jfdevelops libraries), and existing agent instructions. Detected integrations are offered, never enabled automatically. You then choose skills from your installed dependencies; the three shared conventions (`jf-naming-conventions`, `jf-coding-conventions`, `jf-git`) are always installed. Last, you choose which coding agents should load them (Claude Code, Codex, Cursor, GitHub Copilot); agents whose files the project already has are preselected.

`init` never replaces your files. It installs one copy of each skill in `.agents/skills`, adds a marked block to `AGENTS.md` (creating it if needed), adds a short pointer block to `CLAUDE.md` when Claude Code is selected and to existing `GEMINI.md` and `.github/copilot-instructions.md`, and records the setup in `jfdevelops.json`. Existing files that would be overwritten are shown as conflicts with a diff, and you decide each one. Run it again at any time; with nothing to change it reports that the project is already up to date.

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

- `jfdevelops skills` shows whether enabled skills match your installed package versions. See [skills and conflicts](skills.md).
- `jfdevelops skills sync` updates them after a dependency upgrade.
- `jfdevelops add` enables another skill, adopts an integration, or adds a workspace package.

See the [command reference](commands.md) for every command and option.
