# @jfdevelops/cli

Set up new and existing projects with the jfdevelops conventions and the agent skills their dependencies publish, then keep those skills current.

```sh
npx @jfdevelops/cli create my-project   # start a new app or library
npx @jfdevelops/cli init                # adopt an existing project
```

Every command that changes files previews the full plan, shows a diff for anything you edited, and writes nothing until you confirm.

## Commands

| Command | Purpose |
| --- | --- |
| `create [directory]` | Create a TypeScript app or library with your choice of formatter and optional Git initialization |
| `init [directory]` | Adopt an existing project: confirm targets and integrations, choose skills, review every change |
| `add` / `add --list` | Browse or list compatible additions |
| `add skill <name>` | Enable one skill from an installed package |
| `add addon <name>` | Adopt or install Convex, Portless, or an individual TanStack or jfdevelops library |
| `add package <name>` | Scaffold a TypeScript library in the workspace, with `src/`, `test/`, and Vite+ tasks |
| `skills` / `skills sync` | Check enabled skills against installed versions and update them |
| `skills outdated [directory] [--check]` | Compare installed skills with `jfdevelops/skills` on `main` without changing files |
| `create skills` | Register or scaffold the skills a library publishes and verify its tarball |

## Documentation

- [Getting started](docs/getting-started.md): first run, what ends up in your project, and keeping it current.
- [Command reference](docs/commands.md): every command, option, terminal requirement, and exit code.
- [Skills, updates, and conflicts](docs/skills.md): skill sources, status, syncing, and how local edits are protected.
- [Configuration](docs/configuration.md): `jfdevelops.json` fields and how the format evolves.
- [Authoring skills](docs/authoring.md): publishing skills from a library with `create skills`.

See [the project roadmap](ROADMAP.md) for scope, milestones, and open decisions.

## Developing the CLI

Development requires Node.js 22.12.0 or newer and pnpm 10.28.1. The CLI uses Commander for commands and Clack for prompts, and keeps prompts separate from detection, planning, and file operations.

```sh
pnpm install --frozen-lockfile
pnpm check          # typecheck, tests, skill provenance, and the packed executable
pnpm smoke:create   # create, install, format, lint, and build real projects (needs network)
pnpm skills:sync    # regenerate this repository's agent files from the sibling skills checkout
```

This repository follows the shared naming, coding, and Git conventions from `@jfdevelops/skills`, installed as checked-in copies with their provenance recorded in `jfdevelops.json`. See [CONTRIBUTING.md](CONTRIBUTING.md) before changing conventions or tooling.

Update enabled skills to their latest published source packages, then review changes to the managed copies:

```sh
jfdevelops update
jfdevelops update jf-git jf-coding-conventions
jfdevelops update jf-git --directory ./my-project
```

`init` installs both `@jfdevelops/cli` and `@jfdevelops/skills` as direct development dependencies. `update` refreshes source packages with the project package manager, then uses the same local-edit review as `skills sync`. Selecting skills limits which copies are synchronized; updating a package also updates its code and may cross major versions. Local workspace/file packages are synchronized without a registry update. Use `jfdevelops skills --check` in CI to detect stale or edited copies against installed packages.
