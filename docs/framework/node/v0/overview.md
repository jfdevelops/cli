---
title: Overview
description: Set up projects and keep their shared and package-owned agent skills current with the jfdevelops CLI.
order: 10
---

The jfdevelops CLI creates TypeScript projects, adopts existing repositories, and installs two kinds of agent skills: shared jfdevelops conventions fetched from the `jfdevelops/skills` repository, and skills your installed packages publish. Use it when your team needs consistent project setup and instructions that track installed packages.

## Choose a workflow

| Goal | Command | Read next |
| --- | --- | --- |
| Start an app or library | `npx @jfdevelops/cli create my-project` | [Getting started](getting-started.md) |
| Adopt an existing repository | `npx @jfdevelops/cli init` | [Getting started](getting-started.md#adopt-an-existing-project) |
| Add an integration such as Convex or docs | `jfdevelops add addon <name>` | [Addons](addons.md) |
| Enable a skill or add a workspace package | `jfdevelops add` | [Command reference](commands.md#add) |
| Check installed skill copies | `jfdevelops skills --check` | [Skills and conflicts](skills.md#check-skill-status) |
| Compare skills with upstream | `jfdevelops skills outdated` | [Skills and conflicts](skills.md#compare-with-upstream-main) |
| Refresh the CLI and setup | `jfdevelops update` | [Command reference](commands.md#update-directory) |
| Publish skills with a library | `jfdevelops create skills` | [Authoring skills](authoring.md) |

## How it works

| Term | Meaning |
| --- | --- |
| Project and `jfdevelops.json` | The project root and the file where the CLI records its setup; see [Configuration](configuration.md) |
| Target | An app or library the CLI tracks: each workspace package, or the project itself |
| Shared convention skills | Skills from the `jfdevelops/skills` repository on `main`, installed in every project |
| Package skills | Skills that a dependency declares in its `package.json` |
| Addon | An integration such as Convex, Portless, or docs that gates its package's skills; see [Addons](addons.md) |
| Coding agents | Claude Code, Codex, Cursor, and GitHub Copilot, which load the skills in `.agents/skills` and `.claude/skills` |
| Managed files | Files the CLI owns, recorded with a hash; see [Skills](skills.md#how-the-cli-tells-your-edits-from-its-own-files) |

## Review changes

Every change is previewed as a file tree, and the CLI asks how to handle each conflict (see [Conflicts](skills.md#conflicts)).
The CLI records file hashes in `jfdevelops.json` so later runs can distinguish its
generated content from local edits. `create` and `init` support unattended execution
with `--yes`; other mutating commands require a terminal. `skills`, `skills outdated`, and `add --list` are read-only and need no terminal.

Most commands need Git and network access; see [command requirements](commands.md#command-requirements).

Package installation is a separate step in some workflows. Cancelling a later
review retains completed installs and earlier applied changes. Review the
[command reference](commands.md) before automating setup or updates.

## Next steps

- [Install the CLI](installation.md).
- [Create or adopt a project](getting-started.md).
- [Manage skills and conflicts](skills.md).
- [Adopt addons](addons.md).
- [Understand configuration and ownership](configuration.md).
