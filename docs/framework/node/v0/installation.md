---
title: Installation
description: Install the CLI or run it on demand with a supported package manager.
order: 20
---

Run the CLI on Node.js 22.12.0 or newer. It supports projects managed with npm,
pnpm, yarn, or bun; install the package manager your project uses before setup.

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
so collaborators can run the project's installed version. Commit the manifest,
lockfile, generated skills, and recorded setup.

## Run in automation

```sh
npx @jfdevelops/cli create my-project --kind app --yes --no-git
pnpm exec jfdevelops skills --check
```

Without a terminal, `create` and `init` require `--yes`. Use `--conflicts keep`
(the default) or `--conflicts overwrite` to choose how unattended setup handles
overwritable conflicts. Status and listing commands work without prompts.

## Next steps

- [Create or adopt a project](getting-started.md).
- [Look up command options](commands.md).
- [Check and synchronize skills](skills.md).
