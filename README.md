# @jfdevelops/cli

Interactive project setup and skill discovery for new and existing projects. The `jfdevelops` executable supports `create` for new TypeScript apps and libraries and `init` for adopting existing projects; the other commands below are planned.

See [the project roadmap](ROADMAP.md) for the agreed scope, implementation milestones, and open decisions.

## Commands

| Command | Purpose |
| --- | --- |
| `create` | Interactive app or library scaffolding |
| `init` | Adopt existing projects and integrations with a change preview |
| `add` / `add --list` | Browse compatible additions |
| `add skill <name>` | Enable a selected skill |
| `add addon <name>` | Configure an optional integration and its selected skills |
| `add package <name>` | Scaffold a package within a library workspace |
| `create skills` | Scaffold or register package-owned skills and publish metadata |
| `skills` / `skills sync` | Discover skills and reconcile enabled skills with installed versions |
| `help` | Command help |

The intended invocation is `npx @jfdevelops/cli <command>`. Portless, Convex, TanStack libraries, and jfdevelops libraries are opt-in. Addon skills are installed only when the addon is selected. Projects may contain both app and library targets.

The CLI uses Commander for command parsing, subcommands, flags, and help, and Clack for interactive prompts and progress output. `init` detects app and library targets plus installed Portless, Convex, individual TanStack, and individual jfdevelops integrations. Integrations remain opt-in. The three shared convention skills are always installed as required, and the exact CLI version is retained as a development dependency for later commands. Development requires Node.js 22.12.0 or newer and pnpm 10.28.1.

## Required project skills

Naming, coding, and unified Git conventions are copied from `@jfdevelops/skills` version `0.1.0`, with source paths and per-file SHA-256 digests recorded in `jfdevelops.json`. All Git guidance lives in `jf-git/`: its master `SKILL.md` requires reading the current repository's conventions before choosing branch names, writing commits, or creating PRs, then routes to branch, commit, and PR references. Applicable repository rules override shared defaults, with current explicit user instructions taking precedence. AGENTS.md requires loading the applicable instructions; native discovery copies are supplied for agents with differing directory conventions. Compatibility requires the agent to support file access and read the supplied instructions.

The CLI pins the published skills package as a runtime dependency so `init` can install the required conventions even when a project has no jfdevelops packages yet. This repository also keeps checked-in discovery copies and verifies their recorded provenance.

```sh
pnpm install --frozen-lockfile
pnpm check
# Regenerate this repository's owned agent files from the sibling skills checkout:
pnpm skills:sync
```

## Next implementation step

Milestones 2 and 3 are complete. `create` provides reviewed flows for a minimal Node.js TypeScript app and a publishable TypeScript library, with required skills, configuration, dependency installation, formatter choice, shared ESLint Stylistic spacing enforcement, build and formatting verification, and optional Git initialization on `main` with the foundation commit. The next milestone adds ongoing `add` and `skills` operations.
