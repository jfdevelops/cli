---
title: Skills, updates, and conflicts
description: Understand where skills come from, keep them in sync, and resolve local edits.
order: 50
---

Skills bring shared conventions and dependency-specific instructions into your repository. Use status, sync, and update commands to keep those instructions aligned with installed packages and upstream conventions while reviewing local edits.

In this guide you will:

- Understand the two sources of skills.
- Check and sync skill copies.
- Update skill source packages.
- Resolve conflicts and compare with upstream.

## Where skills come from

**Package skills.** A package publishes skills by listing them in the `jfdevelops.skills` field of its `package.json` (see [authoring skills](authoring.md)). The CLI reads that metadata and each `SKILL.md` from the installed version, so instructions always match the API you have installed. It never runs anything from those packages to discover skills.

**Shared convention skills.** These come from `https://github.com/jfdevelops/skills` on `main`. Each command that needs them clones that branch with Git into a temporary directory, discovers every skill registered in its package metadata, installs all of them, and deletes the clone. The CLI does not hardcode the skill list. The commit it cloned is recorded as each skill's source version, and the skills are marked `required` in `jfdevelops.json`. When a dependency provides a skill with the same name as a shared one, the shared skill wins. A project's `@jfdevelops/skills` dependency is ignored.

Skills are discovered from the dependencies of the project root and of each workspace package. Each skill is installed once, at the project root, and listings show which packages declare it. Skills from an integration package (Convex, Portless, docs, TanStack, or jfdevelops libraries) are offered only after that integration is adopted with `init` or `add addon`; see [Addons](addons.md).

## Where skills are installed

Each skill has one full copy in `.agents/skills/<name>/`, which `AGENTS.md` links to. Codex, Cursor, and GitHub Copilot read that directory natively. Claude Code reads only `.claude/skills`, so when it is selected each skill also gets a stub `.claude/skills/<name>/SKILL.md` with the same frontmatter, which tells Claude Code to read the copy in `.agents/skills`. The stub only changes when the skill's frontmatter does. A skill that uses Claude Code's own preprocessing (`$ARGUMENTS`, positional or named arguments, `${CLAUDE_*}` variables, or `` !`command` `` injection) gets a full copy in `.claude/skills` instead, because Claude Code only expands those in the `SKILL.md` it discovers.

`init` and `create` ask which agents to set up and record the answer in `jfdevelops.json`. Deselecting an agent with `init` removes its stubs. Projects set up before agents were selectable had full copies in `.claude/skills`, `.cursor/skills`, and `.github/skills`; the next `skills sync` replaces the Claude Code copies with stubs and removes the others, asking first about any you edited.

## Check skill status

```sh
jfdevelops skills
```

The command needs `jfdevelops.json` (see [command requirements](commands.md#command-requirements)). It prints any catalog problems as warnings, then a table with each enabled skill's name, state, source package and version, and details such as `X → Y`, the number of locally edited files, or the number of missing or outdated files. Below the table, an "Also available" line lists skills from installed packages that you could still enable with `jfdevelops add skill <name>`. Shared convention skills are never listed there; `skills sync` installs them.

| State | Meaning | What sync does |
| --- | --- | --- |
| `current` | Copies match the installed version, or the shared skill's recorded commit matches `main` | Nothing |
| `outdated` | The installed package version changed, `main` has a newer commit than the shared skill's recorded one, or copies are missing or out of date | Updates the copies |
| `modified` | At least one copy was edited after the CLI wrote it | Asks whether to keep or replace each edited copy |
| `missing-source` | The source package is no longer installed, or the shared skill is no longer on `main` | Offers to remove the skill |
| `ambiguous` | Several versions are installed in the workspace | Asks which version to use |

Status checks only enabled skills, so a shared skill newly added on `main` is not reported until a full sync installs it. For the same reason, `skills --check` does not detect a shared skill when both its `jfdevelops.json` entry and its file records are gone, although it does detect missing files of a recorded skill.

If a shared skill is no longer on `main` and you decline its removal during a sync, status and the `AGENTS.md` list show it as `@jfdevelops/skills is not installed`. That message does not mean you should reinstall the package, which the CLI ignores. Run `jfdevelops skills sync` again and accept the removal, or keep the skill's files as your own.

> **Note:** Add `--check` in CI to fail when the project needs a sync. It needs `jfdevelops.json`, Git, and network access, and it exits with 1 when `jfdevelops/skills` cannot be fetched. A shared skill counts as `outdated` whenever `main` has a new commit since the commit last recorded by `init`, `update`, `skills update`, or `skills sync`, even when the files are identical. So `skills --check` fails after every new upstream commit until you run `jfdevelops skills sync`.

## Sync after an upgrade

```sh
jfdevelops skills sync
```

`skills sync` needs a configured project; run `npx @jfdevelops/cli init` first when there is no `jfdevelops.json`.

Sync does the following:

- Updates every unchanged copy to the installed version.
- Refreshes shared convention skills to the current `main` commit, and installs shared skills newly added there. A shared skill that is missing from the project comes back with a sync, in one of two cases:
  - If its folder was deleted but its entry is still in `jfdevelops.json`, the skill is still enabled. Any sync, including `skills update <name>`, recreates the files, and `skills --check` reports it.
  - If its entry was deleted, a full `skills sync` installs it again only when its `managedFiles` records are gone too. Otherwise validation fails with "Owner skill is not enabled", and every command that reads `jfdevelops.json` refuses to run until you fix the file. Once the records are gone too, `skills update <name>` rejects the name as an unknown enabled skill, and `add skill` never offers it, so run a full `skills sync`.
- Refreshes the `AGENTS.md` skill list and records the new versions in `jfdevelops.json`.
- Lists skills whose source is gone, with every removal selected. Deselect any to keep it; a skill whose removal you decline keeps its files and stays listed as not installed.
- Asks which version to use for a skill installed in several versions, with the default keeping the recorded one.
- Uses the agents recorded in `jfdevelops.json`; run `init` to change them.

It prints "Skills are already in sync." when nothing changes.

## Update skill sources

```sh
jfdevelops skills update
jfdevelops skills update build-forms --directory ./shop
```

`skills update` upgrades each enabled skill's source package to `latest` with your package manager, then syncs the copies. Names that no enabled skill uses are rejected before anything is installed.

- It installs one upgrade per package per package directory, after a confirmation that warns the whole package is upgraded.
- Local `workspace:`, `file:`, `link:`, and `portal:` sources are synced without a registry update.
- An optional dependency makes the command exit with 1 and an error before anything is installed. Upgrade that package with your package manager, then run `jfdevelops skills sync`.
- Shared convention skills are never installed as a package; the sync refreshes them from `main`.
- With no names, it also installs newly added shared skills. With names, only those skills' copies are synced.
- Package upgrades remain installed, including manifest and lockfile changes, if you decline the file review.

## Upgrade from earlier releases

Since 0.10.0, shared skills come from `jfdevelops/skills` on `main` rather than from the `@jfdevelops/skills` npm package. In a project set up earlier, `jfdevelops skills` reports shared skills as `outdated`, showing the recorded npm version and the new commit, until you sync. To upgrade:

1. Upgrade the project's CLI dependency, then commit the manifest and lockfile. Run `jfdevelops update`, or install the release as a development dependency:

   ```npm
   npm i -D @jfdevelops/cli@0.10.0
   ```

   ```pnpm
   pnpm add -D @jfdevelops/cli@0.10.0
   ```

   ```yarn
   yarn add -D @jfdevelops/cli@0.10.0
   ```

   ```bun
   bun add -D @jfdevelops/cli@0.10.0
   ```

2. Run `jfdevelops skills sync`.
3. Remove the `@jfdevelops/skills` development dependency, only once every collaborator and CI job uses CLI 0.10.0 or newer. Releases 0.7.0 through 0.9.0 read and prefer that package, `init` re-adds it, and their `skills update` installs `@jfdevelops/skills@latest`, so an older CLI's sync rewrites shared skills from npm.

Projects where a 0.7.0 through 0.9.0 CLI ran `init`, `update`, or `skills update` have the dependency, because those releases' `init` adds the package and their `skills update` installs `@jfdevelops/skills@latest` at the root. The 0.10.0 CLI ignores it and no longer installs it.

## How the CLI tells your edits from its own files

`jfdevelops.json` records the SHA-256 of every file the CLI wrote. Every command that writes files compares each file on disk with that record before changing it:

- If it is unchanged, the CLI may update or delete it.
- If it differs, it is yours now: the CLI shows a diff and asks.
- If a file was edited after the plan was shown but before it was applied, that file is skipped and reported as failed instead of being overwritten.

## Read a planned change

Before applying, the CLI shows a tree of every planned path with an action:

| Action | Meaning |
| --- | --- |
| `create` | A new file |
| `update` | An unchanged managed file is replaced |
| `edit` | A targeted edit of a file you own, such as the `AGENTS.md` block or `package.json` scripts |
| `adopt` | An existing identical file is now recorded as managed |
| `delete` | An unchanged managed file is no longer needed |
| `forget` | The record of a file that is already gone is dropped |
| `conflict` | The file needs your decision |
| `write` | The configuration, `jfdevelops.json`, will be rewritten |

## Conflicts

| Conflict | Why it happens | Choices |
| --- | --- | --- |
| Edited after the CLI last wrote it | You or a tool changed a managed copy | Keep the file, or replace it with the planned content |
| Exists and is not managed by the CLI | A file the CLI wants to create is already there | Keep the file, or replace it |
| No longer needed but edited | A removed skill's copy was edited | Keep the file, or delete it |
| Managed for something outside this setup | Another skill or addon owns the path | Kept; resolve the ownership first |
| A directory or link, not a file | Something other than a file is at the path | Kept; the CLI never writes through links |

Conflicts come up in every command that writes files, not only skill commands. With `--yes`, `--conflicts overwrite` replaces or deletes every overwritable conflict, which are the first three rows; the last two are always kept. Paths that resolve outside the project are rejected.

Kept conflicts stay recorded under their previous state, so the next `skills` run reports them again until they are resolved. Run the command again to retry files that failed.

## Instruction files

The CLI only edits text between `<!-- jfdevelops:start -->` and `<!-- jfdevelops:end -->`. Everything else in `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and `.github/copilot-instructions.md` is yours and preserved, including line endings. When the CLI creates `AGENTS.md` it starts with `# Project agent instructions`, and for `CLAUDE.md` with `# Project instructions`. A file with only one of the two markers stops the command until it is fixed. Generated projects keep Prettier and Biome away from skill copies, `jfdevelops.json`, and lockfiles, which the CLI and package managers rewrite.

## Compare with upstream main

Run `jfdevelops skills outdated [directory]` to compare the project's installed `.agents/skills` copies with the registered skills in `https://github.com/jfdevelops/skills` on `main`. This command works without `jfdevelops.json` or installed npm dependencies. It compares skills by name and checks every bundled file, including references, missing resources, and extra local resources. Skills absent from the upstream catalog are reported as not compared.

The command clones a temporary snapshot, reports its commit, and removes the snapshot afterward. It makes no changes to project files. An `outdated` result means content differs; differences may include local edits or unreleased changes on `main`, so it does not mean a package upgrade is pending. Run `jfdevelops skills sync` to bring the shared skill copies to the current `main`.

Use `jfdevelops skills outdated --check` in CI: it exits with code 1 for differences or a failed comparison and code 0 otherwise. Without `--check`, differences are informational; failures still exit with code 1. With no installed skills, it reports that fact without accessing the network.

## Next steps

- [Look up `skills` commands](commands.md#skills-directory).
- [Adopt addons and their skills](addons.md).
- [Publish skills from a library](authoring.md).
- [Understand `jfdevelops.json`](configuration.md).
