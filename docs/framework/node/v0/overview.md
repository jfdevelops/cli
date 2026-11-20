---
title: Overview
description: Set up projects and maintain package-owned agent skills with the jfdevelops CLI.
order: 10
---

The jfdevelops CLI creates TypeScript projects and brings shared conventions and dependency-owned agent skills into existing repositories. Use it when your team needs consistent project setup and instructions that track installed packages.

## Choose a workflow

| Goal | Command | Read next |
| --- | --- | --- |
| Start an app or library | `jfdevelops create my-project` | [Getting started](getting-started.md) |
| Adopt an existing repository | `jfdevelops init` | [Getting started](getting-started.md#adopt-an-existing-project) |
| Add tooling or a workspace package | `jfdevelops add` | [Command reference](commands.md#add) |
| Check installed skill copies | `jfdevelops skills --check` | [Skills and conflicts](skills.md) |
| Refresh the CLI and setup | `jfdevelops update` | [Command reference](commands.md#jfdevelops-update-directory) |
| Publish skills with a library | `jfdevelops create skills` | [Authoring skills](authoring.md) |

## Review changes

Interactive commands show planned file changes and ask how to handle conflicts.
The CLI records file hashes in `jfdevelops.json` so later runs can distinguish its
generated content from local edits. `create` and `init` support unattended execution
with `--yes`; other mutating commands require a terminal.

Package installation is a separate step in some workflows. Cancelling a later
review retains completed installs and earlier applied changes. Review the
[command reference](commands.md) before automating setup or updates.

## Next steps

- [Install the CLI](installation.md).
- [Create or adopt a project](getting-started.md).
- [Understand configuration and ownership](configuration.md).
