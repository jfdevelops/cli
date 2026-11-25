---
title: Installation
description: Install the CLI or run it on demand with a supported package manager.
order: 20
---

Run the CLI on Node.js 22.12.0 or newer. It supports projects managed with npm,
pnpm, yarn, or bun; install the package manager your project uses before setup.

## Check the prerequisites

| Requirement | Needed for |
| --- | --- |
| Node.js 22.12.0 or newer | Everything |
| npm, pnpm, yarn, or bun | The project's own package manager |
| Git on `PATH` and access to `https://github.com/jfdevelops/skills` | Commands that clone the shared skills; see [command requirements](commands.md#command-requirements) |
| npm on `PATH` | The publication check of `create skills` |

`create` also uses Git for the optional foundation commit.

## Run without installing

```sh
npx @jfdevelops/cli --help
npx @jfdevelops/cli create my-project
```

Use the scoped package name with `npx`. The executable installed by the package
is named `jfdevelops`.

## Add a project dependency

```npm
npm i -D @jfdevelops/cli
```

```pnpm
pnpm add -D @jfdevelops/cli
```

```yarn
yarn add -D @jfdevelops/cli
```

```bun
bun add -D @jfdevelops/cli
```

Run the local executable through your package manager, for example:

```sh
pnpm exec jfdevelops --version
pnpm exec jfdevelops init
```

`create` and `init` install the CLI as a direct development dependency when needed,
at the exact running version, so collaborators can run the project's installed version. Commit the manifest,
lockfile, generated skills, and recorded setup.

## Run in automation

```sh
npx @jfdevelops/cli create my-project --kind app --yes --no-git
pnpm exec jfdevelops skills --check
```

Without a terminal, `create` and `init` require `--yes`, and `create` also requires `--kind` and a name argument. In a terminal, the choice flags apply only together with `--yes`; without it, the command prompts and ignores them. `--conflicts keep` (the default) or `--conflicts overwrite` chooses how unattended setup handles overwritable conflicts, and also applies only with `--yes`. Other mutating commands require a terminal. The status and listing commands `skills`, `skills outdated`, and `add --list` work without prompts.

Read [Check skill status](skills.md#check-skill-status) before adding `skills --check` to CI, because it fails on new upstream commits to the shared skills.

## Next steps

- [Create or adopt a project](getting-started.md).
- [Look up command options](commands.md).
- [Check and synchronize skills](skills.md).
