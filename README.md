# @jfdevelops/cli

Interactive project setup and skill discovery for new and existing projects. This repository currently contains its project foundation and three required convention skills. The `jfdevelops` executable supports `init`, which adopts an existing project interactively; the other commands below are planned.

See [the project roadmap](ROADMAP.md) for the agreed scope, implementation milestones, and open decisions.

## Planned commands

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

The CLI uses Commander for command parsing, subcommands, flags, and help, and Clack for interactive prompts and progress output. Both are installed as runtime dependencies. Command handlers and interactive flows will be implemented next, with project operations kept separate from terminal input/output. Development requires Node.js 22.12.0 or newer and pnpm 10.28.1.

## Required project skills

Naming, coding, and unified Git conventions are copied from `@jfdevelops/skills` version `0.1.0`, with source paths and per-file SHA-256 digests recorded in `jfdevelops.json`. All Git guidance lives in `jf-git/`: its master `SKILL.md` requires reading the current repository's conventions before choosing branch names, writing commits, or creating PRs, then routes to branch, commit, and PR references. Applicable repository rules override shared defaults, with current explicit user instructions taking precedence. AGENTS.md requires loading the applicable instructions; native discovery copies are supplied for agents with differing directory conventions. Compatibility requires the agent to support file access and read the supplied instructions.

Until the skills package is published, these are checked-in snapshots generated from the sibling `skills` repository. There is no unresolved registry dependency or external path dependency required to run checks. After the first skills release, the CLI should pin that published package as a dev dependency and use the installed package as the synchronization source.

```sh
pnpm install --frozen-lockfile
pnpm check
# Regenerate owned agent files from the sibling skills repository:
pnpm skills:sync
```

## Next implementation step

The shared engine is in place: project detection (`src/detect`), package-owned skill discovery (`src/skills`), and read-only change plans applied with per-file results (`src/plan`). Implement `init` on top of it, then reuse that engine for `create` and `add`. Existing user files must be preserved; locally modified managed files need a reviewable conflict. The bootstrap sync script is development tooling for these two new repositories, not that installer.

The schema version 1 project configuration is defined and validated in `src/config/schema.ts`: generator, project, targets, addons, formatter, skill provenance, and per-file managed-file hashes. This repository's own `jfdevelops.json` still uses the skills-only bootstrap shape written by the sibling sync script until that script emits the new structure. Target detection, addon state, and package scaffolding will populate the configuration with their respective features.
